import type { HTMLAppConfig, HtmlPermissionScope } from "../types"
import type { HtmlPermissionGrant, HtmlPermissionGrantStore } from "./HtmlPermissionGrantStore"

const MINUTE_MS = 60 * 1000

export interface HtmlPermissionTtlOption {
	labelKey: string
	ttlMs: number
}

export interface HtmlPermissionConfirmRequest {
	appName: string
	mode: "manifest" | "legacy"
	isLegacy: boolean
	scope: HtmlPermissionScope
	scopeLabelKey: string
	reason: string
	ttlOptions: HtmlPermissionTtlOption[]
	defaultTtlMs: number
}

export interface HtmlPermissionConfirmResult {
	allowed: boolean
	ttlMs: number
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

export interface IframePermissionServiceConfig {
	grantStore: HtmlPermissionGrantStore
	confirmPermission: (
		request: HtmlPermissionConfirmRequest,
	) => Promise<HtmlPermissionConfirmResult>
	appConfigState: HtmlAppConfigState
	appInstance: IframePermissionAppInstance
	getNow?: () => number
}

const SCOPE_LABEL_KEYS: Record<HtmlPermissionScope, string> = {
	"llm.use": "htmlEditor.permissionAuthorizationConfirm.scopes.llmUse",
	"project.message.write": "htmlEditor.permissionAuthorizationConfirm.scopes.projectMessageWrite",
	"project.files.upload": "htmlEditor.permissionAuthorizationConfirm.scopes.projectFilesUpload",
	"project.files.download":
		"htmlEditor.permissionAuthorizationConfirm.scopes.projectFilesDownload",
	"fs.project.read": "htmlEditor.permissionAuthorizationConfirm.scopes.fsProjectRead",
	"fs.project.write": "htmlEditor.permissionAuthorizationConfirm.scopes.fsProjectWrite",
	"user.profile.name": "htmlEditor.permissionAuthorizationConfirm.scopes.userProfileName",
	"user.profile.identity": "htmlEditor.permissionAuthorizationConfirm.scopes.userProfileIdentity",
	"user.profile.organization":
		"htmlEditor.permissionAuthorizationConfirm.scopes.userProfileOrganization",
}

const MANIFEST_TTL_OPTIONS: Record<HtmlPermissionScope, HtmlPermissionTtlOption[]> = {
	"llm.use": longTtlOptions(),
	"project.message.write": ttlOptions([5, 10, 15, 30, 60]),
	"project.files.upload": longTtlOptions(),
	"project.files.download": longTtlOptions(),
	"fs.project.read": longTtlOptions(),
	"fs.project.write": [
		{ labelKey: "htmlEditor.permissionAuthorizationConfirm.ttl.once", ttlMs: 0 },
		...ttlOptions([5, 10, 30, 60]),
		...hourOptions([2, 4, 8, 12]),
	],
	"user.profile.name": longTtlOptions(),
	"user.profile.identity": longTtlOptions(),
	"user.profile.organization": longTtlOptions(),
}

const LEGACY_TTL_OPTIONS: Record<HtmlPermissionScope, HtmlPermissionTtlOption[]> = {
	"llm.use": ttlOptions([5, 15, 30]),
	"project.message.write": ttlOptions([5, 15, 30]),
	"project.files.upload": ttlOptions([5, 15, 30]),
	"project.files.download": ttlOptions([5, 15, 30]),
	"fs.project.read": ttlOptions([5, 15, 30]),
	"fs.project.write": [
		{ labelKey: "htmlEditor.permissionAuthorizationConfirm.ttl.once", ttlMs: 0 },
		...ttlOptions([5, 10, 30]),
	],
	"user.profile.name": ttlOptions([5, 15, 30]),
	"user.profile.identity": ttlOptions([5, 15, 30]),
	"user.profile.organization": ttlOptions([5, 15, 30]),
}

const DEFAULT_TTL_BY_SCOPE: Record<HtmlPermissionScope, number> = {
	"llm.use": 15 * MINUTE_MS,
	"project.message.write": 10 * MINUTE_MS,
	"project.files.upload": 15 * MINUTE_MS,
	"project.files.download": 15 * MINUTE_MS,
	"fs.project.read": 15 * MINUTE_MS,
	"fs.project.write": 0,
	"user.profile.name": 15 * MINUTE_MS,
	"user.profile.identity": 15 * MINUTE_MS,
	"user.profile.organization": 15 * MINUTE_MS,
}

function ttlOptions(minutes: number[]): HtmlPermissionTtlOption[] {
	return minutes.map((minute) => ({
		labelKey: `htmlEditor.permissionAuthorizationConfirm.ttl.${minute}m`,
		ttlMs: minute * MINUTE_MS,
	}))
}

function hourOptions(hours: number[]): HtmlPermissionTtlOption[] {
	return hours.map((hour) => ({
		labelKey: `htmlEditor.permissionAuthorizationConfirm.ttl.${hour}h`,
		ttlMs: hour * 60 * MINUTE_MS,
	}))
}

function longTtlOptions(): HtmlPermissionTtlOption[] {
	return [...ttlOptions([5, 15, 30, 60]), ...hourOptions([2, 4, 8, 12])]
}

export class IframePermissionService {
	private readonly cfg: IframePermissionServiceConfig

	constructor(cfg: IframePermissionServiceConfig) {
		this.cfg = cfg
	}

	async authorize(scope: HtmlPermissionScope): Promise<boolean> {
		const now = this.getNow()
		this.cfg.grantStore.prune(now)

		const appConfigState = this.cfg.appConfigState
		if (appConfigState.status === "loading" || appConfigState.status === "error") {
			return false
		}

		const appConfig = appConfigState.status === "loaded" ? appConfigState.config : null
		const mode = appConfig ? "manifest" : "legacy"
		const declared = this.isDeclared(scope, appConfig)
		if (mode === "manifest" && !declared) return false

		const appFingerprint = await this.getAppFingerprint(mode, appConfig)
		const match = this.buildGrantMatch(scope, mode, appFingerprint)
		const existing = this.cfg.grantStore
			.list()
			.find(
				(grant) =>
					match.appFingerprint &&
					this.matchesGrant(grant, match) &&
					grant.expiresAt > now,
			)
		if (existing) return true

		const ttlOptions =
			mode === "legacy" ? LEGACY_TTL_OPTIONS[scope] : MANIFEST_TTL_OPTIONS[scope]
		const result = await this.cfg.confirmPermission({
			appName: appConfig?.name || "HTML 微应用",
			mode,
			isLegacy: mode === "legacy",
			scope,
			scopeLabelKey: SCOPE_LABEL_KEYS[scope],
			reason: appConfig?.permissions?.reason || "",
			ttlOptions,
			defaultTtlMs: this.getDefaultTtl(scope, ttlOptions),
		})

		if (!result.allowed) return false
		if (result.ttlMs > 0 && this.canPersistGrant(match)) {
			this.cfg.grantStore.save({
				...match,
				grantedAt: now,
				expiresAt: now + result.ttlMs,
			})
		}
		return true
	}

	private isDeclared(scope: HtmlPermissionScope, appConfig: HTMLAppConfig | null): boolean {
		const scopes = appConfig?.permissions?.scopes
		if (!Array.isArray(scopes)) return false
		return scopes.includes(scope)
	}

	private async getAppFingerprint(
		mode: "manifest" | "legacy",
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

	private buildGrantMatch(
		scope: HtmlPermissionScope,
		mode: "manifest" | "legacy",
		appFingerprint: string,
	): Omit<HtmlPermissionGrant, "grantedAt" | "expiresAt"> {
		return {
			mode,
			userKey: this.cfg.appInstance.userKey,
			projectId: this.cfg.appInstance.projectId,
			appRootDir: this.cfg.appInstance.appRootDir,
			entryPath: this.cfg.appInstance.entryPath,
			appFingerprint,
			scope,
		}
	}

	private matchesGrant(
		grant: HtmlPermissionGrant,
		match: Omit<HtmlPermissionGrant, "grantedAt" | "expiresAt">,
	): boolean {
		return (
			grant.mode === match.mode &&
			grant.userKey === match.userKey &&
			grant.projectId === match.projectId &&
			grant.appRootDir === match.appRootDir &&
			grant.entryPath === match.entryPath &&
			grant.appFingerprint === match.appFingerprint &&
			grant.scope === match.scope
		)
	}

	private canPersistGrant(match: Omit<HtmlPermissionGrant, "grantedAt" | "expiresAt">): boolean {
		return Boolean(match.userKey && match.projectId && match.entryPath && match.appFingerprint)
	}

	private getDefaultTtl(scope: HtmlPermissionScope, ttlOptions: HtmlPermissionTtlOption[]) {
		const configured = DEFAULT_TTL_BY_SCOPE[scope]
		return ttlOptions.some((option) => option.ttlMs === configured)
			? configured
			: (ttlOptions[0]?.ttlMs ?? 0)
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
