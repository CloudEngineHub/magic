import { vi } from "vitest"
import {
	IframePermissionService,
	type HtmlPermissionConfirmRequest,
	type IframePermissionServiceConfig,
} from "../IframePermissionService"
import {
	isHtmlPermissionGrantActive,
	type HtmlPermissionGrant,
	type HtmlPermissionGrantIdentity,
	type HtmlPermissionGrantStore,
} from "../HtmlPermissionGrantStore"
import type { HtmlPermissionScope } from "../../types"
import type { IndexedDbHtmlPermissionGrantStore } from "../IndexedDbHtmlPermissionGrantStore"

export async function closeHtmlPermissionGrantDatabaseForTest(
	store: IndexedDbHtmlPermissionGrantStore,
) {
	const db = await (store as unknown as { dbPromise: Promise<IDBDatabase | null> }).dbPromise
	db?.close()
}

export function installWebLocksMock() {
	let tail = Promise.resolve<unknown>(undefined)
	const request = vi.fn((name: string, callback: (lock: Lock) => unknown) => {
		const result = tail.then(() => callback({ name, mode: "exclusive" } as Lock))
		tail = result.then(
			() => undefined,
			() => undefined,
		)
		return result
	})
	Object.defineProperty(globalThis.navigator, "locks", {
		configurable: true,
		value: { request },
	})
}

export class MemoryGrantStore implements HtmlPermissionGrantStore {
	constructor(private readonly getNow: () => number = () => 1_000_000) {}

	grants: HtmlPermissionGrant[] = []
	isPersistentAvailable = vi.fn(async () => true)
	getGrant = vi.fn(async (identity: HtmlPermissionGrantIdentity, scope: HtmlPermissionScope) => {
		this.removeExpired(this.getNow())
		return this.grants.find(
			(grant) =>
				grant.scope === scope &&
				matchesIdentity(grant, identity) &&
				isHtmlPermissionGrantActive(grant, this.getNow()),
		)
	})
	getAppGrants = vi.fn(async (identity: HtmlPermissionGrantIdentity) => {
		this.removeExpired(this.getNow())
		return this.grants.filter(
			(grant) =>
				matchesIdentity(grant, identity) &&
				isHtmlPermissionGrantActive(grant, this.getNow()),
		)
	})
	save = vi.fn(async (grant: HtmlPermissionGrant) => {
		this.grants = this.grants.filter(
			(item) =>
				!(
					item.mode === grant.mode &&
					item.userId === grant.userId &&
					item.projectId === grant.projectId &&
					item.appRootDir === grant.appRootDir &&
					item.entryPath === grant.entryPath &&
					item.appFingerprint === grant.appFingerprint &&
					item.scope === grant.scope
				),
		)
		this.grants.push(grant)
		return true
	})
	remove = vi.fn(async (identity: HtmlPermissionGrantIdentity, scope?: HtmlPermissionScope) => {
		this.grants = this.grants.filter(
			(grant) =>
				!matchesIdentity(grant, identity) || (scope !== undefined && grant.scope !== scope),
		)
	})
	prune = vi.fn(async (now: number) => {
		this.removeExpired(now)
	})
	clear = vi.fn(async () => {
		this.grants = []
	})

	private removeExpired(now: number) {
		this.grants = this.grants.filter((grant) => isHtmlPermissionGrantActive(grant, now))
	}
}

function matchesIdentity(grant: HtmlPermissionGrant, identity: HtmlPermissionGrantIdentity) {
	return (
		grant.mode === identity.mode &&
		grant.userId === identity.userId &&
		grant.projectId === identity.projectId &&
		grant.appRootDir === identity.appRootDir &&
		grant.entryPath === identity.entryPath &&
		grant.appFingerprint === identity.appFingerprint
	)
}

export function createService(overrides: Partial<IframePermissionServiceConfig> = {}) {
	const getNow = overrides.getNow || (() => 1_000_000)
	const grantStore = overrides.grantStore || new MemoryGrantStore(getNow)
	const confirmPermission = vi.fn(
		overrides.confirmPermission ||
			(async (request: HtmlPermissionConfirmRequest) => ({
				allowed: true,
				ttlMs: request.defaultTtlMs,
			})),
	)
	const service = new IframePermissionService({
		appConfigState: {
			status: "loaded",
			config: {
				name: "Manifest App",
				entry: "index.html",
				permissions: {
					scopes: ["llm.use"],
					reason: "Analyze project data",
				},
			},
		},
		appInstance: {
			userId: "user-1",
			projectId: "project-1",
			appRootDir: "app/",
			entryPath: "app/index.html",
			content: "<html>manifest</html>",
		},
		...overrides,
		grantStore,
		confirmPermission,
		getNow,
	})
	return { service, grantStore, confirmPermission }
}
