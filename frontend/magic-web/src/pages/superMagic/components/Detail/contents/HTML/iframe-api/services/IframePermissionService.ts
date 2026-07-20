import { htmlMicroAppPreviewLogger } from "../../utils/htmlMicroAppPreviewLogger"
import type { HTMLAppConfig, HtmlPermissionScope } from "../types"
import type { HtmlPermissionGrant, HtmlPermissionGrantStore } from "./HtmlPermissionGrantStore"
import {
	analyzeHtmlPermissionDeclarations,
	createEmptyHtmlPermissionDeclaration,
	type HtmlPermissionDeclarationAnalysis,
	type HtmlPermissionDiagnostic,
} from "./htmlPermissionDeclarations"
import {
	getDefaultHtmlPermissionTtl,
	getSharedHtmlPermissionTtlOptions,
	SUPPORTED_HTML_PERMISSION_SCOPES,
	type HtmlPermissionMode,
	type HtmlPermissionTtlOption,
} from "./htmlPermissionPolicy"

type HtmlPermissionGrantIdentity = Omit<HtmlPermissionGrant, "scope" | "grantedAt" | "expiresAt">

export type { HtmlPermissionDiagnostic, HtmlPermissionTtlOption }

export interface HtmlPermissionAuthorizeOptions {
	reason?: string
	presentation?: "capability" | "userInfo"
}

export interface HtmlPermissionConfirmRequest {
	appName: string
	mode: HtmlPermissionMode
	isLegacy: boolean
	appConfigLoadError?: string
	scopes: HtmlPermissionScope[]
	reason: string
	presentation: "capability" | "userInfo"
	ttlOptions: HtmlPermissionTtlOption[]
	defaultTtlMs: number
}

export interface HtmlPermissionConfirmResult {
	allowed: boolean
	ttlMs: number
}

export interface HtmlPermissionMissingDeclarationRequest {
	appName: string
	scope: HtmlPermissionScope
	declaredScopes: HtmlPermissionScope[]
}

export interface IframePermissionAppInstance {
	userKey: string
	projectId: string
	appRootDir: string
	entryPath: string
	content: string
}

export type HtmlAppConfigState =
	| { status: "loading" }
	| { status: "absent" }
	| { status: "loaded"; config: HTMLAppConfig }
	| { status: "error"; error: string }

export interface HtmlPermissionSnapshotItem {
	scope: string
	supported: boolean
	declarationStatus: "declared" | "notDeclared" | "unsupported"
	grant?: HtmlPermissionGrant
	ttlOptions: HtmlPermissionTtlOption[]
}

export interface HtmlPermissionSnapshot {
	configStatus: HtmlAppConfigState["status"]
	mode: HtmlPermissionMode | null
	app: {
		name: string
		version: string
		entry: string
		appRootDir: string
		reason: string
	}
	permissions: HtmlPermissionSnapshotItem[]
	diagnostics: HtmlPermissionDiagnostic[]
	activeGrantCount: number
}

export interface IframePermissionServiceConfig {
	grantStore: HtmlPermissionGrantStore
	confirmPermission: (
		request: HtmlPermissionConfirmRequest,
	) => Promise<HtmlPermissionConfirmResult>
	onMissingDeclaration?: (request: HtmlPermissionMissingDeclarationRequest) => void
	onGrantsChanged?: () => void
	appConfigState: HtmlAppConfigState
	appInstance: IframePermissionAppInstance
	getNow?: () => number
}

export class IframePermissionService {
	private readonly cfg: IframePermissionServiceConfig

	constructor(cfg: IframePermissionServiceConfig) {
		this.cfg = cfg
	}

	async authorize(scope: HtmlPermissionScope): Promise<boolean> {
		return this.authorizeMany([scope])
	}

	async authorizeMany(
		scopes: HtmlPermissionScope[],
		options: HtmlPermissionAuthorizeOptions = {},
	): Promise<boolean> {
		const requestedScopes = Array.from(new Set(scopes))
		if (requestedScopes.length === 0) return true

		const now = this.getNow()
		this.cfg.grantStore.prune(now)

		const context = await this.resolveContext()
		if (!context) return false

		const { appConfig, appConfigLoadError, mode, appFingerprint, declaration } = context
		if (appConfigLoadError) {
			htmlMicroAppPreviewLogger.warn(
				"Permission fallback: app.json unavailable, using legacy confirmation",
				{ scopes: requestedScopes, error: appConfigLoadError },
			)
		}

		if (mode === "manifest") {
			const undeclaredScopes = requestedScopes.filter(
				(scope) => !declaration.declaredScopes.includes(scope),
			)
			if (undeclaredScopes.length > 0) {
				for (const scope of undeclaredScopes) {
					this.reportMissingDeclaration(scope, appConfig, declaration.declaredScopes)
				}
				return false
			}
		}

		const identity = this.buildGrantIdentity(mode, appFingerprint)
		const existingScopes = new Set(
			this.cfg.grantStore
				.list()
				.filter(
					(grant) =>
						identity.appFingerprint &&
						this.matchesGrantIdentity(grant, identity) &&
						grant.expiresAt > now,
				)
				.map((grant) => grant.scope),
		)
		const missingScopes = requestedScopes.filter((scope) => !existingScopes.has(scope))
		if (missingScopes.length === 0) return true

		const ttlOptions = getSharedHtmlPermissionTtlOptions(missingScopes, mode)
		const result = await this.cfg.confirmPermission({
			appName: appConfig?.name || "",
			mode,
			isLegacy: mode === "legacy",
			appConfigLoadError,
			scopes: missingScopes,
			reason:
				options.reason ||
				appConfig?.permissions?.reason ||
				(options.presentation === "userInfo"
					? appConfig?.permissions?.userInfo?.reason
					: "") ||
				"",
			presentation: options.presentation || "capability",
			ttlOptions,
			defaultTtlMs: getDefaultHtmlPermissionTtl(missingScopes[0], ttlOptions),
		})

		if (!result.allowed) return false
		if (result.ttlMs > 0 && this.canPersistGrant(identity)) {
			for (const scope of missingScopes) {
				this.cfg.grantStore.save({
					...identity,
					scope,
					grantedAt: now,
					expiresAt: now + result.ttlMs,
				})
			}
			this.cfg.onGrantsChanged?.()
		}
		return true
	}

	async getPermissionSnapshot(): Promise<HtmlPermissionSnapshot> {
		const now = this.getNow()
		this.cfg.grantStore.prune(now)

		const configState = this.cfg.appConfigState
		if (configState.status === "loading") {
			return this.createSnapshot(null, null, createEmptyHtmlPermissionDeclaration(), [])
		}

		const appConfig = configState.status === "loaded" ? configState.config : null
		const mode: HtmlPermissionMode = appConfig ? "manifest" : "legacy"
		const declaration = analyzeHtmlPermissionDeclarations(appConfig)
		const appFingerprint = await this.getAppFingerprint(mode, appConfig)
		const identity = this.buildGrantIdentity(mode, appFingerprint)
		const grants = this.cfg.grantStore
			.list()
			.filter(
				(grant) =>
					identity.appFingerprint &&
					this.matchesGrantIdentity(grant, identity) &&
					grant.expiresAt > now,
			)

		return this.createSnapshot(mode, appConfig, declaration, grants)
	}

	async revoke(scope: HtmlPermissionScope): Promise<HtmlPermissionSnapshot> {
		const context = await this.resolveContext()
		if (context) {
			this.cfg.grantStore.remove({
				...this.buildGrantIdentity(context.mode, context.appFingerprint),
				scope,
			})
			this.cfg.onGrantsChanged?.()
		}
		return this.getPermissionSnapshot()
	}

	async updateGrantTtl(
		scope: HtmlPermissionScope,
		ttlMs: number,
	): Promise<HtmlPermissionSnapshot> {
		const now = this.getNow()
		this.cfg.grantStore.prune(now)

		const context = await this.resolveContext()
		if (!context) throw new Error("Permission context is not ready")

		const { mode, appFingerprint, declaration } = context
		if (mode === "manifest" && !declaration.declaredScopes.includes(scope)) {
			throw new Error("Permission scope is not declared")
		}

		const ttlOptions = getSharedHtmlPermissionTtlOptions([scope], mode).filter(
			(option) => option.ttlMs > 0,
		)
		if (!Number.isFinite(ttlMs) || !ttlOptions.some((option) => option.ttlMs === ttlMs)) {
			throw new Error("Permission duration is not allowed")
		}

		const identity = this.buildGrantIdentity(mode, appFingerprint)
		const existingGrant = this.cfg.grantStore
			.list()
			.find(
				(grant) =>
					grant.scope === scope &&
					this.matchesGrantIdentity(grant, identity) &&
					grant.expiresAt > now,
			)
		if (!existingGrant) throw new Error("Active permission grant was not found")

		this.cfg.grantStore.save({
			...identity,
			scope,
			grantedAt: now,
			expiresAt: now + ttlMs,
		})
		this.cfg.onGrantsChanged?.()
		return this.getPermissionSnapshot()
	}

	async revokeAll(): Promise<HtmlPermissionSnapshot> {
		const context = await this.resolveContext()
		if (context) {
			this.cfg.grantStore.remove(
				this.buildGrantIdentity(context.mode, context.appFingerprint),
			)
			this.cfg.onGrantsChanged?.()
		}
		return this.getPermissionSnapshot()
	}

	private createSnapshot(
		mode: HtmlPermissionMode | null,
		appConfig: HTMLAppConfig | null,
		declaration: HtmlPermissionDeclarationAnalysis,
		grants: HtmlPermissionGrant[],
	): HtmlPermissionSnapshot {
		const grantsByScope = new Map(grants.map((grant) => [grant.scope, grant]))
		const declaredScopeSet = new Set(declaration.declaredScopes)
		const diagnostics = [...declaration.diagnostics]
		if (this.cfg.appConfigState.status === "absent") {
			diagnostics.unshift({ code: "manifestAbsent" })
		} else if (this.cfg.appConfigState.status === "error") {
			diagnostics.unshift({
				code: "manifestLoadError",
				error: this.cfg.appConfigState.error,
			})
		}

		return {
			configStatus: this.cfg.appConfigState.status,
			mode,
			app: {
				name: appConfig?.name || "",
				version: appConfig?.version || "",
				entry: appConfig?.entry || this.cfg.appInstance.entryPath.split("/").pop() || "",
				appRootDir: this.cfg.appInstance.appRootDir,
				reason:
					appConfig?.permissions?.reason ||
					appConfig?.permissions?.userInfo?.reason ||
					"",
			},
			permissions: [
				...SUPPORTED_HTML_PERMISSION_SCOPES.map((scope) => ({
					scope,
					supported: true,
					declarationStatus: declaredScopeSet.has(scope)
						? ("declared" as const)
						: ("notDeclared" as const),
					grant: grantsByScope.get(scope),
					ttlOptions: mode
						? getSharedHtmlPermissionTtlOptions([scope], mode).filter(
								(option) => option.ttlMs > 0,
							)
						: [],
				})),
				...declaration.unsupportedScopes.map((scope) => ({
					scope,
					supported: false,
					declarationStatus: "unsupported" as const,
					ttlOptions: [],
				})),
			],
			diagnostics,
			activeGrantCount: grants.length,
		}
	}

	private async resolveContext() {
		const appConfigState = this.cfg.appConfigState
		if (appConfigState.status === "loading") return null

		const appConfig = appConfigState.status === "loaded" ? appConfigState.config : null
		const mode: HtmlPermissionMode = appConfig ? "manifest" : "legacy"
		return {
			appConfig,
			mode,
			appConfigLoadError:
				appConfigState.status === "error" ? appConfigState.error : undefined,
			appFingerprint: await this.getAppFingerprint(mode, appConfig),
			declaration: analyzeHtmlPermissionDeclarations(appConfig),
		}
	}

	private reportMissingDeclaration(
		scope: HtmlPermissionScope,
		appConfig: HTMLAppConfig | null,
		declaredScopes: HtmlPermissionScope[],
	) {
		const appName = appConfig?.name || ""
		htmlMicroAppPreviewLogger.warn("Permission blocked: scope not declared in app.json", {
			appName,
			declaredScopes,
			scope,
		})
		this.cfg.onMissingDeclaration?.({ appName, declaredScopes, scope })
	}

	private async getAppFingerprint(
		mode: HtmlPermissionMode,
		appConfig: HTMLAppConfig | null,
	): Promise<string> {
		const source =
			mode === "manifest"
				? stableStringify({
						type: appConfig?.type || "",
						name: appConfig?.name || "",
						version: appConfig?.version || "",
						entry: appConfig?.entry || "",
						permissions: appConfig?.permissions || {},
					})
				: this.cfg.appInstance.content || ""
		return shortHash(source)
	}

	private buildGrantIdentity(
		mode: HtmlPermissionMode,
		appFingerprint: string,
	): HtmlPermissionGrantIdentity {
		return {
			mode,
			userKey: this.cfg.appInstance.userKey,
			projectId: this.cfg.appInstance.projectId,
			appRootDir: this.cfg.appInstance.appRootDir,
			entryPath: this.cfg.appInstance.entryPath,
			appFingerprint,
		}
	}

	private matchesGrantIdentity(
		grant: HtmlPermissionGrant,
		identity: HtmlPermissionGrantIdentity,
	): boolean {
		return (
			grant.mode === identity.mode &&
			grant.userKey === identity.userKey &&
			grant.projectId === identity.projectId &&
			grant.appRootDir === identity.appRootDir &&
			grant.entryPath === identity.entryPath &&
			grant.appFingerprint === identity.appFingerprint
		)
	}

	private canPersistGrant(identity: HtmlPermissionGrantIdentity): boolean {
		return Boolean(
			identity.userKey && identity.projectId && identity.entryPath && identity.appFingerprint,
		)
	}

	private getNow() {
		return this.cfg.getNow?.() ?? Date.now()
	}
}

function stableStringify(value: unknown): string {
	if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`
	if (value && typeof value === "object") {
		return `{${Object.keys(value as Record<string, unknown>)
			.sort()
			.map(
				(key) =>
					`${JSON.stringify(key)}:${stableStringify((value as Record<string, unknown>)[key])}`,
			)
			.join(",")}}`
	}
	return JSON.stringify(value)
}

async function shortHash(value: string): Promise<string> {
	const subtle = globalThis.crypto?.subtle
	if (subtle) {
		const bytes = new TextEncoder().encode(value)
		const digest = await subtle.digest("SHA-256", bytes)
		return Array.from(new Uint8Array(digest).slice(0, 16))
			.map((byte) => byte.toString(16).padStart(2, "0"))
			.join("")
	}
	return ""
}
