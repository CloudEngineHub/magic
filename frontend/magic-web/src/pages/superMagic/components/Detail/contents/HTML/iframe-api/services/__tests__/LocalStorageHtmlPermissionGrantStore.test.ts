import { beforeEach, describe, expect, it, vi } from "vitest"
import { htmlMicroAppPreviewLogger } from "../../../utils/htmlMicroAppPreviewLogger"
import {
	createHtmlPermissionAppKey,
	HTML_PERMISSION_GRANTS_CHANGED_EVENT,
	LOCAL_STORAGE_HTML_PERMISSION_GRANT_STORE_KEY,
	LocalStorageHtmlPermissionGrantStore,
	MAX_HTML_PERMISSION_GRANTS,
	type HtmlPermissionGrant,
	type HtmlPermissionGrantIdentity,
} from "../HtmlPermissionGrantStore"

function grant(overrides: Partial<HtmlPermissionGrant> = {}): HtmlPermissionGrant {
	return {
		mode: "manifest",
		userId: "user-1",
		projectId: "project-1",
		appRootDir: "app/",
		entryPath: "app/index.html",
		appFingerprint: "abc123",
		scope: "llm.use",
		grantedAt: 1000,
		expiresAt: 3000,
		...overrides,
	}
}

function toIdentity(value: HtmlPermissionGrant): HtmlPermissionGrantIdentity {
	return {
		mode: value.mode,
		userId: value.userId,
		projectId: value.projectId,
		appRootDir: value.appRootDir,
		entryPath: value.entryPath,
		appFingerprint: value.appFingerprint,
	}
}

function persistGrants(grants: HtmlPermissionGrant[]) {
	const apps: Record<
		string,
		{
			grants: Record<string, { grantedAt: number; expiresAt: number | null }>
		}
	> = {}
	for (const item of grants) {
		const identity = toIdentity(item)
		const appKey = createHtmlPermissionAppKey(identity)
		const app = apps[appKey] || { grants: {} }
		app.grants[item.scope] = { grantedAt: item.grantedAt, expiresAt: item.expiresAt }
		apps[appKey] = app
	}
	localStorage.setItem(
		LOCAL_STORAGE_HTML_PERMISSION_GRANT_STORE_KEY,
		JSON.stringify({ version: 2, apps }),
	)
}

function readStoredApps() {
	return JSON.parse(
		localStorage.getItem(LOCAL_STORAGE_HTML_PERMISSION_GRANT_STORE_KEY) || "{}",
	) as {
		version: 2
		apps: Record<
			string,
			{ grants: Record<string, { grantedAt: number; expiresAt: number | null }> }
		>
	}
}

describe("LocalStorageHtmlPermissionGrantStore", () => {
	beforeEach(() => {
		localStorage.clear()
		sessionStorage.clear()
		vi.restoreAllMocks()
	})

	it("uses localStorage and replaces grants for the same app and scope", () => {
		const store = new LocalStorageHtmlPermissionGrantStore(undefined, () => 1000)
		const identity = toIdentity(grant())

		store.save(grant({ expiresAt: 2000 }))
		store.save(grant({ expiresAt: 3000 }))

		expect(store.getGrant(identity, "llm.use")).toEqual(grant({ expiresAt: 3000 }))
		expect(store.getAppGrants(identity)).toEqual([grant({ expiresAt: 3000 })])
		expect(localStorage.getItem(LOCAL_STORAGE_HTML_PERMISSION_GRANT_STORE_KEY)).not.toBeNull()
		expect(sessionStorage.length).toBe(0)
	})

	it("uses a fixed-length SHA-256 app key instead of the raw identity", () => {
		const identity = toIdentity(grant())
		const appKey = createHtmlPermissionAppKey(identity)

		expect(appKey).toMatch(/^[a-f0-9]{64}$/)
		expect(appKey).not.toContain(identity.userId)
		expect(appKey).not.toContain(identity.entryPath)
		expect(createHtmlPermissionAppKey(identity)).toBe(appKey)
	})

	it("does not persist plaintext grant identity", () => {
		const item = grant()
		const store = new LocalStorageHtmlPermissionGrantStore(undefined, () => 1000)

		store.save(item)

		const raw = localStorage.getItem(LOCAL_STORAGE_HTML_PERMISSION_GRANT_STORE_KEY) || ""
		expect(raw).not.toContain(item.userId)
		expect(raw).not.toContain(item.projectId)
		expect(raw).not.toContain(item.appRootDir)
		expect(raw).not.toContain(item.entryPath)
		expect(raw).not.toContain(item.appFingerprint)
	})

	it("removes one scope or all scopes for one app without affecting another app", () => {
		const store = new LocalStorageHtmlPermissionGrantStore(undefined, () => 1000)
		const firstIdentity = toIdentity(grant())
		const otherAppGrant = grant({ entryPath: "other/index.html" })
		store.save(grant({ scope: "llm.use" }))
		store.save(grant({ scope: "project.message.write" }))
		store.save(otherAppGrant)

		store.remove(firstIdentity, "llm.use")
		expect(store.getAppGrants(firstIdentity)).toEqual([
			grant({ scope: "project.message.write" }),
		])
		expect(store.getAppGrants(toIdentity(otherAppGrant))).toEqual([otherAppGrant])

		store.remove(firstIdentity)
		expect(store.getAppGrants(firstIdentity)).toEqual([])
		expect(store.getAppGrants(toIdentity(otherAppGrant))).toEqual([otherAppGrant])
	})

	it("reads one app through its index without writing unchanged data", () => {
		const firstAppGrant = grant()
		const otherAppGrant = grant({ entryPath: "other/index.html" })
		persistGrants([firstAppGrant, otherAppGrant])
		const setItem = vi.spyOn(Storage.prototype, "setItem")
		const store = new LocalStorageHtmlPermissionGrantStore(undefined, () => 1000)

		expect(store.getAppGrants(toIdentity(firstAppGrant))).toEqual([firstAppGrant])
		expect(setItem).not.toHaveBeenCalled()
	})

	it("does not validate unrelated apps during an indexed app query", () => {
		const firstAppGrant = grant()
		persistGrants([firstAppGrant])
		const stored = JSON.parse(
			localStorage.getItem(LOCAL_STORAGE_HTML_PERMISSION_GRANT_STORE_KEY) || "{}",
		) as { apps: Record<string, unknown> }
		stored.apps.invalid = {
			grants: { "future.scope": { grantedAt: 1000, expiresAt: 3000 } },
		}
		localStorage.setItem(LOCAL_STORAGE_HTML_PERMISSION_GRANT_STORE_KEY, JSON.stringify(stored))
		const store = new LocalStorageHtmlPermissionGrantStore(undefined, () => 1000)

		expect(store.getAppGrants(toIdentity(firstAppGrant))).toEqual([firstAppGrant])
		expect(localStorage.getItem(LOCAL_STORAGE_HTML_PERMISSION_GRANT_STORE_KEY)).not.toBeNull()

		store.prune(1000)
		expect(localStorage.getItem(LOCAL_STORAGE_HTML_PERMISSION_GRANT_STORE_KEY)).toBeNull()
	})

	it("cleans expired grants while retaining always-valid grants", () => {
		persistGrants([
			grant({ scope: "llm.use", expiresAt: 1500 }),
			grant({ scope: "project.message.write", expiresAt: 2500 }),
			grant({ scope: "user.profile.name", expiresAt: null }),
		])
		const store = new LocalStorageHtmlPermissionGrantStore(undefined, () => 2000)

		expect(store.getAppGrants(toIdentity(grant()))).toEqual([
			grant({ scope: "project.message.write", expiresAt: 2500 }),
			grant({ scope: "user.profile.name", expiresAt: null }),
		])
		expect(
			Object.values(readStoredApps().apps).flatMap((app) => Object.values(app.grants)),
		).toHaveLength(2)
	})

	it("clears corrupted or structurally invalid stored data", () => {
		localStorage.setItem(LOCAL_STORAGE_HTML_PERMISSION_GRANT_STORE_KEY, "{bad json")
		const store = new LocalStorageHtmlPermissionGrantStore(undefined, () => 1000)

		store.prune(1000)
		expect(localStorage.getItem(LOCAL_STORAGE_HTML_PERMISSION_GRANT_STORE_KEY)).toBeNull()

		localStorage.setItem(
			LOCAL_STORAGE_HTML_PERMISSION_GRANT_STORE_KEY,
			JSON.stringify({
				version: 2,
				apps: {
					invalid: {
						identity: toIdentity(grant()),
						grants: { "future.scope": { grantedAt: 1000, expiresAt: 3000 } },
					},
				},
			}),
		)
		store.prune(1000)
		expect(localStorage.getItem(LOCAL_STORAGE_HTML_PERMISSION_GRANT_STORE_KEY)).toBeNull()
	})

	it("discards the previous v2 shape containing plaintext identity", () => {
		const item = grant()
		const identity = toIdentity(item)
		localStorage.setItem(
			LOCAL_STORAGE_HTML_PERMISSION_GRANT_STORE_KEY,
			JSON.stringify({
				version: 2,
				apps: {
					[createHtmlPermissionAppKey(identity)]: {
						identity,
						grants: {
							[item.scope]: { grantedAt: item.grantedAt, expiresAt: item.expiresAt },
						},
					},
				},
			}),
		)
		const store = new LocalStorageHtmlPermissionGrantStore(undefined, () => 1000)

		expect(store.getAppGrants(identity)).toEqual([])
		expect(localStorage.getItem(LOCAL_STORAGE_HTML_PERMISSION_GRANT_STORE_KEY)).toBeNull()
	})

	it("evicts the earliest finite grant before always-valid grants", () => {
		const grants = Array.from({ length: MAX_HTML_PERMISSION_GRANTS }, (_, index) =>
			grant({
				entryPath: `app/${index}.html`,
				grantedAt: index + 1,
				expiresAt: index === 0 ? 10_000 : null,
			}),
		)
		persistGrants(grants)
		const warning = vi
			.spyOn(htmlMicroAppPreviewLogger, "warn")
			.mockImplementation(() => undefined)
		const store = new LocalStorageHtmlPermissionGrantStore(undefined, () => 1000)

		store.save(grant({ entryPath: "app/new.html", grantedAt: 2000, expiresAt: null }))

		const stored = readStoredApps()
		expect(Object.keys(stored.apps)).toHaveLength(MAX_HTML_PERMISSION_GRANTS)
		expect(stored.apps[createHtmlPermissionAppKey(toIdentity(grants[0]))]).toBeUndefined()
		expect(
			stored.apps[
				createHtmlPermissionAppKey(toIdentity(grant({ entryPath: "app/new.html" })))
			],
		).toBeDefined()
		expect(warning).toHaveBeenCalledWith("Permission grant limit exceeded", {
			limit: MAX_HTML_PERMISSION_GRANTS,
			evictedCount: 1,
		})
	})

	it("evicts the oldest always-valid grant when all grants are permanent", () => {
		const grants = Array.from({ length: MAX_HTML_PERMISSION_GRANTS }, (_, index) =>
			grant({ entryPath: `app/${index}.html`, grantedAt: index + 1, expiresAt: null }),
		)
		persistGrants(grants)
		vi.spyOn(htmlMicroAppPreviewLogger, "warn").mockImplementation(() => undefined)
		const store = new LocalStorageHtmlPermissionGrantStore(undefined, () => 1000)

		store.save(grant({ entryPath: "app/new.html", grantedAt: 2000, expiresAt: null }))

		const stored = readStoredApps()
		expect(Object.keys(stored.apps)).toHaveLength(MAX_HTML_PERMISSION_GRANTS)
		expect(stored.apps[createHtmlPermissionAppKey(toIdentity(grants[0]))]).toBeUndefined()
		expect(
			stored.apps[
				createHtmlPermissionAppKey(toIdentity(grant({ entryPath: "app/new.html" })))
			],
		).toBeDefined()
	})

	it("clears grants and notifies the current tab", () => {
		const store = new LocalStorageHtmlPermissionGrantStore(undefined, () => 1000)
		const listener = vi.fn()
		window.addEventListener(HTML_PERMISSION_GRANTS_CHANGED_EVENT, listener)
		store.save(grant())

		store.clear()

		expect(localStorage.getItem(LOCAL_STORAGE_HTML_PERMISSION_GRANT_STORE_KEY)).toBeNull()
		expect(listener).toHaveBeenCalledTimes(1)
		window.removeEventListener(HTML_PERMISSION_GRANTS_CHANGED_EVENT, listener)
	})

	it("clears old grants without blocking the current call when persistence fails", () => {
		const store = new LocalStorageHtmlPermissionGrantStore(undefined, () => 1000)
		store.save(grant({ expiresAt: 3000 }))
		vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
			throw new DOMException("Quota exceeded", "QuotaExceededError")
		})
		vi.spyOn(htmlMicroAppPreviewLogger, "warn").mockImplementation(() => undefined)

		expect(() => store.save(grant({ expiresAt: 5000 }))).not.toThrow()
		expect(localStorage.getItem(LOCAL_STORAGE_HTML_PERMISSION_GRANT_STORE_KEY)).toBeNull()
	})
})
