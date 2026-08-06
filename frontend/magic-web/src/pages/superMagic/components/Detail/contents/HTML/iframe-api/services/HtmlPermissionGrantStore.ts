import sha256 from "crypto-js/sha256"
import { htmlMicroAppPreviewLogger } from "../../utils/htmlMicroAppPreviewLogger"
import type { HtmlPermissionScope } from "../types"
import { isSupportedHtmlPermissionScope } from "./htmlPermissionPolicy"

export const LOCAL_STORAGE_HTML_PERMISSION_GRANT_STORE_KEY = "magic:html-app-permissions:v2"
export const HTML_PERMISSION_GRANTS_CHANGED_EVENT = "magic:html-app-permissions:changed"
export const MAX_HTML_PERMISSION_GRANTS = 1000

export interface HtmlPermissionGrantIdentity {
	mode: "manifest" | "legacy"
	userId: string
	projectId: string
	appRootDir: string
	entryPath: string
	appFingerprint: string
}

export interface HtmlPermissionGrant extends HtmlPermissionGrantIdentity {
	scope: HtmlPermissionScope
	grantedAt: number
	expiresAt: number | null
}

interface StoredHtmlPermissionGrant {
	grantedAt: number
	expiresAt: number | null
}

interface StoredHtmlPermissionApp {
	grants: Partial<Record<HtmlPermissionScope, StoredHtmlPermissionGrant>>
}

interface StoredHtmlPermissionData {
	version: 2
	apps: Record<string, StoredHtmlPermissionApp>
}

interface StoredHtmlPermissionDataHeader {
	version: 2
	apps: Record<string, unknown>
}

export interface HtmlPermissionGrantStore {
	getGrant(
		identity: HtmlPermissionGrantIdentity,
		scope: HtmlPermissionScope,
	): HtmlPermissionGrant | undefined
	getAppGrants(identity: HtmlPermissionGrantIdentity): HtmlPermissionGrant[]
	save(grant: HtmlPermissionGrant): void
	remove(identity: HtmlPermissionGrantIdentity, scope?: HtmlPermissionScope): void
	prune(now: number): void
	clear(): void
}

export function isHtmlPermissionGrantActive(grant: HtmlPermissionGrant, now: number): boolean {
	return grant.expiresAt === null || grant.expiresAt > now
}

export function createHtmlPermissionAppKey(identity: HtmlPermissionGrantIdentity): string {
	const source = JSON.stringify([
		identity.mode,
		identity.userId,
		identity.projectId,
		identity.appRootDir,
		identity.entryPath,
		identity.appFingerprint,
	])
	return sha256(source).toString()
}

function isValidStoredGrant(value: unknown): value is StoredHtmlPermissionGrant {
	if (!isRecord(value)) return false
	const grant = value as Record<string, unknown>
	return (
		typeof grant.grantedAt === "number" &&
		Number.isFinite(grant.grantedAt) &&
		(grant.expiresAt === null ||
			(typeof grant.expiresAt === "number" && Number.isFinite(grant.expiresAt)))
	)
}

function isValidStoredApp(value: unknown): value is StoredHtmlPermissionApp {
	if (!isRecord(value)) return false
	const app = value as Record<string, unknown>
	// The previous v2 shape stored identity in plaintext. Reject it instead of migrating sensitive data.
	if ("identity" in app || !isRecord(app.grants)) {
		return false
	}
	return Object.entries(app.grants).every(
		([scope, grant]) => isSupportedHtmlPermissionScope(scope) && isValidStoredGrant(grant),
	)
}

function isValidStoredDataHeader(value: unknown): value is StoredHtmlPermissionDataHeader {
	if (!isRecord(value)) return false
	const data = value as Record<string, unknown>
	return data.version === 2 && isRecord(data.apps)
}

function isValidStoredData(value: unknown): value is StoredHtmlPermissionData {
	if (!isValidStoredDataHeader(value)) return false
	const data = value as StoredHtmlPermissionDataHeader
	return Object.values(data.apps).every(isValidStoredApp)
}

function containsPlaintextIdentity(data: StoredHtmlPermissionDataHeader): boolean {
	return Object.values(data.apps).some((app) => isRecord(app) && "identity" in app)
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return Boolean(value) && typeof value === "object" && !Array.isArray(value)
}

function getStoredGrantEntries(
	app: StoredHtmlPermissionApp,
): Array<[HtmlPermissionScope, StoredHtmlPermissionGrant]> {
	// Full reads and targeted app lookups both validate scopes before this typed view is used.
	return Object.entries(app.grants) as Array<[HtmlPermissionScope, StoredHtmlPermissionGrant]>
}

export class LocalStorageHtmlPermissionGrantStore implements HtmlPermissionGrantStore {
	constructor(
		private readonly storageKey = LOCAL_STORAGE_HTML_PERMISSION_GRANT_STORE_KEY,
		private readonly getNow: () => number = () => Date.now(),
	) {}

	getGrant(
		identity: HtmlPermissionGrantIdentity,
		scope: HtmlPermissionScope,
	): HtmlPermissionGrant | undefined {
		const data = this.readData(false)
		const appKey = createHtmlPermissionAppKey(identity)
		const app = this.getValidatedApp(data, appKey)
		if (!app) return undefined
		const storedGrant = app.grants[scope]
		if (!storedGrant) return undefined
		const grant = this.toGrant(identity, scope, storedGrant)
		if (isHtmlPermissionGrantActive(grant, this.getNow())) return grant

		delete app.grants[scope]
		this.removeEmptyApps(data)
		this.write(data)
		return undefined
	}

	getAppGrants(identity: HtmlPermissionGrantIdentity): HtmlPermissionGrant[] {
		const data = this.readData(false)
		const appKey = createHtmlPermissionAppKey(identity)
		const app = this.getValidatedApp(data, appKey)
		if (!app) return []

		const grants: HtmlPermissionGrant[] = []
		const now = this.getNow()
		let changed = false
		for (const [scope, storedGrant] of getStoredGrantEntries(app)) {
			const grant = this.toGrant(identity, scope, storedGrant)
			if (isHtmlPermissionGrantActive(grant, now)) grants.push(grant)
			else {
				delete app.grants[scope]
				changed = true
			}
		}

		if (changed) {
			this.removeEmptyApps(data)
			this.write(data)
		}
		return grants
	}

	save(grant: HtmlPermissionGrant): void {
		const data = this.readData()
		const now = this.getNow()
		this.removeExpiredFromData(data, now)
		const appKey = createHtmlPermissionAppKey(grant)
		const app = data.apps[appKey] || { grants: {} }
		app.grants[grant.scope] = {
			grantedAt: grant.grantedAt,
			expiresAt: grant.expiresAt,
		}
		data.apps[appKey] = app
		this.limitGrantCount(data)
		this.write(data)
	}

	remove(identity: HtmlPermissionGrantIdentity, scope?: HtmlPermissionScope): void {
		const data = this.readData()
		const appKey = createHtmlPermissionAppKey(identity)
		const app = data.apps[appKey]
		if (!app) return
		let changed = false
		if (scope) {
			if (!app.grants[scope]) return
			delete app.grants[scope]
			changed = true
		} else {
			delete data.apps[appKey]
			changed = true
		}
		if (scope && changed) {
			this.removeEmptyApps(data)
		}
		if (changed) this.write(data)
	}

	prune(now: number): void {
		const data = this.readData()
		if (this.removeExpiredFromData(data, now)) this.write(data)
	}

	clear(): void {
		this.clearStorage()
		this.notifySameTabChange()
	}

	private readData(validateAllApps = true): StoredHtmlPermissionData {
		try {
			const raw = globalThis.localStorage?.getItem(this.storageKey)
			if (!raw) return { version: 2, apps: {} }
			const parsed = JSON.parse(raw)
			if (!isValidStoredDataHeader(parsed) || containsPlaintextIdentity(parsed)) {
				this.discardCorruptedStorage()
				return { version: 2, apps: {} }
			}
			if (validateAllApps && !isValidStoredData(parsed)) {
				this.discardCorruptedStorage()
				return { version: 2, apps: {} }
			}
			return parsed as StoredHtmlPermissionData
		} catch (error) {
			htmlMicroAppPreviewLogger.error("Failed to read permission grants from localStorage", {
				error: error instanceof Error ? error.message : String(error),
			})
			this.clearStorage()
			return { version: 2, apps: {} }
		}
	}

	private getValidatedApp(
		data: StoredHtmlPermissionData,
		appKey: string,
	): StoredHtmlPermissionApp | undefined {
		const app = data.apps[appKey]
		if (app === undefined) return undefined
		if (!isValidStoredApp(app)) {
			this.discardCorruptedStorage()
			return undefined
		}
		return app
	}

	private removeExpiredFromData(data: StoredHtmlPermissionData, now: number): boolean {
		let changed = false
		for (const [appKey, app] of Object.entries(data.apps)) {
			for (const [scope, storedGrant] of getStoredGrantEntries(app)) {
				if (storedGrant.expiresAt !== null && storedGrant.expiresAt <= now) {
					delete app.grants[scope]
					changed = true
				}
			}
			if (Object.keys(app.grants).length === 0) {
				delete data.apps[appKey]
				changed = true
			}
		}
		return changed
	}

	private limitGrantCount(data: StoredHtmlPermissionData) {
		const grants = Object.entries(data.apps).flatMap(([appKey, app]) =>
			Object.entries(app.grants).map(([scope, grant]) => ({ appKey, scope, grant })),
		)
		if (grants.length <= MAX_HTML_PERMISSION_GRANTS) return

		const overflow = grants.length - MAX_HTML_PERMISSION_GRANTS
		// Prefer grants that will expire anyway; permanent grants are only evicted after finite ones.
		const evictionCandidates = grants.sort((a, b) => {
			if (a.grant.expiresAt === null && b.grant.expiresAt !== null) return 1
			if (a.grant.expiresAt !== null && b.grant.expiresAt === null) return -1
			if (a.grant.expiresAt !== null && b.grant.expiresAt !== null) {
				return (
					a.grant.expiresAt - b.grant.expiresAt || a.grant.grantedAt - b.grant.grantedAt
				)
			}
			return a.grant.grantedAt - b.grant.grantedAt
		})
		for (const { appKey, scope } of evictionCandidates.slice(0, overflow)) {
			delete data.apps[appKey].grants[scope as HtmlPermissionScope]
		}
		htmlMicroAppPreviewLogger.warn("Permission grant limit exceeded", {
			limit: MAX_HTML_PERMISSION_GRANTS,
			evictedCount: overflow,
		})
		this.removeEmptyApps(data)
	}

	private removeEmptyApps(data: StoredHtmlPermissionData) {
		for (const [appKey, app] of Object.entries(data.apps)) {
			if (Object.keys(app.grants).length === 0) delete data.apps[appKey]
		}
	}

	private toGrant(
		identity: HtmlPermissionGrantIdentity,
		scope: HtmlPermissionScope,
		grant: StoredHtmlPermissionGrant,
	): HtmlPermissionGrant {
		return { ...identity, scope, ...grant }
	}

	private discardCorruptedStorage() {
		htmlMicroAppPreviewLogger.error("Corrupted permission grants in localStorage", {
			storageKey: this.storageKey,
		})
		this.clearStorage()
	}

	private clearStorage() {
		try {
			globalThis.localStorage?.removeItem(this.storageKey)
		} catch (error) {
			htmlMicroAppPreviewLogger.warn("Failed to clear permission grants from localStorage", {
				error: error instanceof Error ? error.message : String(error),
			})
		}
	}

	private notifySameTabChange() {
		try {
			const target = globalThis.window
			if (!target) return
			target.dispatchEvent(new target.Event(HTML_PERMISSION_GRANTS_CHANGED_EVENT))
		} catch (error) {
			htmlMicroAppPreviewLogger.warn("Failed to notify permission grant change", {
				error: error instanceof Error ? error.message : String(error),
			})
		}
	}

	private write(data: StoredHtmlPermissionData): void {
		try {
			globalThis.localStorage?.setItem(this.storageKey, JSON.stringify(data))
		} catch (error) {
			// Storage is only a consent cache. The current operation may proceed, but future calls prompt again.
			htmlMicroAppPreviewLogger.warn("Failed to persist permission grants to localStorage", {
				error: error instanceof Error ? error.message : String(error),
			})
			this.clearStorage()
		}
	}
}
