import { IDBFactory } from "fake-indexeddb"
import { beforeEach, describe, expect, it, vi } from "vitest"
import {
	LOCAL_STORAGE_HTML_PERMISSION_GRANT_FALLBACK_KEY,
	LOCAL_STORAGE_HTML_PERMISSION_GRANT_STORE_KEY,
	type HtmlPermissionGrant,
} from "../HtmlPermissionGrantStore"
import { IndexedDbHtmlPermissionGrantStore } from "../IndexedDbHtmlPermissionGrantStore"
import { LocalStorageHtmlPermissionGrantStore } from "../LocalStorageHtmlPermissionGrantStore"
import {
	closeHtmlPermissionGrantDatabaseForTest,
	createService,
	installWebLocksMock,
} from "./IframePermissionService.testUtils"

function grant(overrides: Partial<HtmlPermissionGrant> = {}): HtmlPermissionGrant {
	return {
		mode: "manifest",
		userId: "user-1",
		projectId: "project-1",
		appRootDir: "app/",
		entryPath: "app/index.html",
		appFingerprint: "abc123",
		scope: "llm.use",
		grantedAt: 1_000_000,
		expiresAt: 2_000_000,
		...overrides,
	}
}

describe("HTML permission storage fallback", () => {
	beforeEach(() => {
		vi.stubGlobal("indexedDB", undefined)
		installWebLocksMock()
		localStorage.clear()
		vi.restoreAllMocks()
	})

	it("persists and reuses grants in localStorage when IndexedDB is unavailable", async () => {
		const confirmPermission = vi.fn(async () => ({
			allowed: true,
			ttlMs: 60 * 60 * 1000,
		}))
		const grantStore = new IndexedDbHtmlPermissionGrantStore(() => 1_000_000)
		const { service } = createService({ grantStore, confirmPermission })

		expect(await service.authorize("llm.use")).toBe(true)
		expect(await service.authorize("llm.use")).toBe(true)

		expect(confirmPermission).toHaveBeenCalledTimes(1)
		expect(
			localStorage.getItem(LOCAL_STORAGE_HTML_PERMISSION_GRANT_FALLBACK_KEY),
		).not.toBeNull()
		expect(localStorage.getItem(LOCAL_STORAGE_HTML_PERMISSION_GRANT_STORE_KEY)).toBeNull()
	})

	it("does not persist plaintext identity in the localStorage fallback", async () => {
		const grantStore = new IndexedDbHtmlPermissionGrantStore(() => 1_000_000)
		const { service } = createService({ grantStore })

		await service.authorize("llm.use")

		const raw = localStorage.getItem(LOCAL_STORAGE_HTML_PERMISSION_GRANT_FALLBACK_KEY) || ""
		expect(raw).not.toContain("user-1")
		expect(raw).not.toContain("project-1")
		expect(raw).not.toContain("app/index.html")
		expect(raw).not.toContain("abc123")
	})

	it("keeps revocation and clear operations consistent across fallback store instances", async () => {
		const firstStore = new IndexedDbHtmlPermissionGrantStore(() => 1_000_000)
		const secondStore = new IndexedDbHtmlPermissionGrantStore(() => 1_000_000)
		const first = createService({ grantStore: firstStore })

		await first.service.authorize("llm.use")
		expect((await first.service.getPermissionSnapshot()).activeGrantCount).toBe(1)

		await first.service.revoke("llm.use")
		expect((await first.service.getPermissionSnapshot()).activeGrantCount).toBe(0)

		await first.service.authorize("llm.use")
		await secondStore.clear()
		expect((await first.service.getPermissionSnapshot()).activeGrantCount).toBe(0)
	})

	it("serializes concurrent fallback writes across store instances", async () => {
		const firstStore = new LocalStorageHtmlPermissionGrantStore(() => 1_000_000)
		const secondStore = new LocalStorageHtmlPermissionGrantStore(() => 1_000_000)

		await Promise.all([
			firstStore.save(grant({ scope: "llm.use" })),
			secondStore.save(grant({ scope: "project.message.write" })),
		])

		expect((await firstStore.getAppGrants(grant())).map((item) => item.scope).sort()).toEqual([
			"llm.use",
			"project.message.write",
		])
	})

	it("allows only the current request and rejects preauthorization when no storage works", async () => {
		vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
			throw new DOMException("Storage disabled", "SecurityError")
		})
		const confirmPermission = vi.fn(async (request) => ({
			allowed: true,
			ttlMs: request.defaultTtlMs,
		}))
		const grantStore = new IndexedDbHtmlPermissionGrantStore(() => 1_000_000)
		const { service } = createService({ grantStore, confirmPermission })

		expect(await service.authorize("llm.use")).toBe(true)
		expect(confirmPermission.mock.calls[0][0].ttlOptions.map((option) => option.ttlMs)).toEqual(
			[0],
		)
		expect(await service.authorize("llm.use", { allowOnce: false })).toBe(false)
		expect(confirmPermission).toHaveBeenCalledTimes(1)
	})

	it("persists an account clear marker when Web Locks are unavailable", async () => {
		Object.defineProperty(globalThis.navigator, "locks", {
			configurable: true,
			value: undefined,
		})
		const fallbackStore = new LocalStorageHtmlPermissionGrantStore(() => 1_000_000)

		await fallbackStore.clear()

		expect(
			localStorage.getItem(LOCAL_STORAGE_HTML_PERMISSION_GRANT_FALLBACK_KEY),
		).not.toBeNull()
	})

	it("migrates active degraded grants before IndexedDB becomes authoritative again", async () => {
		const fallbackStore = new IndexedDbHtmlPermissionGrantStore(() => 1_000_000)
		const firstConfirm = vi.fn(async () => ({ allowed: true, ttlMs: 60 * 60 * 1000 }))
		const first = createService({ grantStore: fallbackStore, confirmPermission: firstConfirm })
		await first.service.authorize("llm.use")
		expect(
			localStorage.getItem(LOCAL_STORAGE_HTML_PERMISSION_GRANT_FALLBACK_KEY),
		).not.toBeNull()

		vi.stubGlobal("indexedDB", new IDBFactory())
		const indexedDbStore = new IndexedDbHtmlPermissionGrantStore(() => 1_000_000)
		const recoveredConfirm = vi.fn(async () => ({ allowed: true, ttlMs: 60 * 60 * 1000 }))
		const recovered = createService({
			grantStore: indexedDbStore,
			confirmPermission: recoveredConfirm,
		})

		expect(await recovered.service.authorize("llm.use")).toBe(true)

		expect(recoveredConfirm).not.toHaveBeenCalled()
		expect(localStorage.getItem(LOCAL_STORAGE_HTML_PERMISSION_GRANT_FALLBACK_KEY)).toBeNull()
	})

	it("reconciles fallback changes written after an IndexedDB store is already healthy", async () => {
		const indexedDbFactory = new IDBFactory()
		vi.stubGlobal("indexedDB", indexedDbFactory)
		const indexedDbStore = new IndexedDbHtmlPermissionGrantStore(() => 1_000_000)
		const permanentGrant = grant({ expiresAt: null })
		await indexedDbStore.save(permanentGrant)

		vi.stubGlobal("indexedDB", undefined)
		const fallbackStore = new IndexedDbHtmlPermissionGrantStore(() => 1_000_000)
		await fallbackStore.isPersistentAvailable()
		vi.stubGlobal("indexedDB", indexedDbFactory)

		await fallbackStore.remove(permanentGrant, permanentGrant.scope)
		expect(await indexedDbStore.getAppGrants(permanentGrant)).toEqual([])
		expect(localStorage.getItem(LOCAL_STORAGE_HTML_PERMISSION_GRANT_FALLBACK_KEY)).toBeNull()

		const nextGrant = grant({ scope: "project.message.write", expiresAt: null })
		await indexedDbStore.save(nextGrant)
		await fallbackStore.clear()

		expect(await indexedDbStore.getAppGrants(permanentGrant)).toEqual([])
		expect(localStorage.getItem(LOCAL_STORAGE_HTML_PERMISSION_GRANT_FALLBACK_KEY)).toBeNull()
	})

	it("keeps the fallback snapshot when IndexedDB recovery fails", async () => {
		const indexedDbFactory = new IDBFactory()
		vi.stubGlobal("indexedDB", indexedDbFactory)
		const indexedDbStore = new IndexedDbHtmlPermissionGrantStore(() => 1_000_000)
		await indexedDbStore.isPersistentAvailable()

		const fallbackStore = new LocalStorageHtmlPermissionGrantStore(() => 1_000_000)
		const permanentGrant = grant({ expiresAt: null })
		await fallbackStore.save(permanentGrant)
		await closeHtmlPermissionGrantDatabaseForTest(indexedDbStore)

		expect(await indexedDbStore.getAppGrants(permanentGrant)).toEqual([permanentGrant])
		expect(
			localStorage.getItem(LOCAL_STORAGE_HTML_PERMISSION_GRANT_FALLBACK_KEY),
		).not.toBeNull()
	})
})
