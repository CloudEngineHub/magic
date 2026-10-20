import { describe, expect, it, vi } from "vitest"
import type { HTMLAppConfig, HtmlPermissionScope } from "../../types"
import type {
	HtmlPermissionConfirmRequest,
	IframePermissionAppInstance,
	IframePermissionService,
} from "../IframePermissionService"
import type { HtmlPermissionGrantIdentity } from "../HtmlPermissionGrantStore"
import {
	createMemoryLegacyMigrationMarker,
	createService,
	MemoryGrantStore,
} from "./IframePermissionService.testUtils"

const DAY = 24 * 60 * 60 * 1000

const baseInstance: IframePermissionAppInstance = {
	userId: "user-1",
	projectId: "project-1",
	appRootDir: "app/",
	entryPath: "app/index.html",
	entryFileId: "file-1",
	content: "<html>manifest</html>",
	runtimeFingerprint: "runtime-v1",
}

function allowAll() {
	return vi.fn(async (request: HtmlPermissionConfirmRequest) => ({
		allowed: true,
		ttlMs: request.scopes.includes("llm.use") ? DAY : request.defaultTtlMs,
	}))
}

function manifest(config: Partial<HTMLAppConfig> = {}) {
	return {
		status: "loaded" as const,
		config: {
			name: "Manifest App",
			entry: "index.html",
			permissions: { scopes: ["llm.use"] as HtmlPermissionScope[] },
			...config,
		} as HTMLAppConfig,
	}
}

/** Builds the identity earlier versions used, so tests can seed pre-upgrade grants. */
async function legacyIdentityOf(
	service: IframePermissionService,
	mode: "manifest" | "legacy",
	config: HTMLAppConfig | null,
): Promise<HtmlPermissionGrantIdentity> {
	return (
		service as unknown as {
			buildLegacyGrantIdentity: (
				mode: "manifest" | "legacy",
				config: HTMLAppConfig | null,
			) => Promise<HtmlPermissionGrantIdentity>
		}
	).buildLegacyGrantIdentity(mode, config)
}

describe("IframePermissionService stable app identity", () => {
	it("reuses high-risk grants after content and executable file versions change", async () => {
		const store = new MemoryGrantStore()
		const confirmPermission = allowAll()
		await createService({ grantStore: store, confirmPermission }).service.authorize("llm.use")
		const edited = createService({
			grantStore: store,
			confirmPermission,
			appInstance: {
				...baseInstance,
				content: "<html>new executable content</html>",
				runtimeFingerprint: "runtime-v2",
			},
		})

		expect(await edited.service.authorize("llm.use")).toBe(true)
		expect(confirmPermission).toHaveBeenCalledOnce()
	})

	it("reuses stable grants before the project file list is ready", async () => {
		const store = new MemoryGrantStore()
		const confirmPermission = allowAll()
		await createService({ grantStore: store, confirmPermission }).service.authorize("llm.use")
		const loading = createService({
			grantStore: store,
			confirmPermission,
			appInstance: { ...baseInstance, runtimeFingerprint: "[]" },
		})

		expect(await loading.service.authorize("llm.use")).toBe(true)
		expect(confirmPermission).toHaveBeenCalledOnce()
	})

	it("keeps grants when the entry content changes", async () => {
		const store = new MemoryGrantStore()
		const confirmPermission = allowAll()
		await createService({ grantStore: store, confirmPermission }).service.authorize("llm.use")

		const edited = createService({
			grantStore: store,
			confirmPermission,
			appInstance: { ...baseInstance, content: "<html>changed source</html>" },
		})

		expect(await edited.service.authorize("llm.use")).toBe(true)
		expect(confirmPermission).toHaveBeenCalledOnce()
	})

	it("keeps read-only grants when sibling executable files change", async () => {
		const store = new MemoryGrantStore()
		const confirmPermission = allowAll()
		const config = manifest({
			permissions: { scopes: ["fs.project.read"] },
		})
		await createService({
			grantStore: store,
			confirmPermission,
			appConfigState: config,
			appInstance: { ...baseInstance, runtimeFingerprint: "runtime-v1" },
		}).service.authorize("fs.project.read")

		const edited = createService({
			grantStore: store,
			confirmPermission,
			appConfigState: config,
			appInstance: { ...baseInstance, runtimeFingerprint: "runtime-v2" },
		})

		expect(await edited.service.authorize("fs.project.read")).toBe(true)
		expect(confirmPermission).toHaveBeenCalledOnce()
	})

	it("keeps legacy-mode grants across content edits", async () => {
		const store = new MemoryGrantStore()
		const confirmPermission = allowAll()
		await createService({
			grantStore: store,
			confirmPermission,
			appConfigState: { status: "absent" },
		}).service.authorize("llm.use")

		const edited = createService({
			grantStore: store,
			confirmPermission,
			appConfigState: { status: "absent" },
			appInstance: { ...baseInstance, content: "<html>changed</html>" },
		})

		expect(await edited.service.authorize("llm.use")).toBe(true)
		expect(confirmPermission).toHaveBeenCalledOnce()
	})

	it("keeps grants when the app is renamed or moved but keeps its file id", async () => {
		const store = new MemoryGrantStore()
		const confirmPermission = allowAll()
		await createService({ grantStore: store, confirmPermission }).service.authorize("llm.use")

		const moved = createService({
			grantStore: store,
			confirmPermission,
			appInstance: {
				...baseInstance,
				appRootDir: "moved/dir/",
				entryPath: "moved/dir/home.html",
			},
		})

		expect(await moved.service.authorize("llm.use")).toBe(true)
		expect(confirmPermission).toHaveBeenCalledOnce()
	})

	it("asks again for a copy that has a different entry file id", async () => {
		const store = new MemoryGrantStore()
		const confirmPermission = allowAll()
		await createService({ grantStore: store, confirmPermission }).service.authorize("llm.use")

		const copy = createService({
			grantStore: store,
			confirmPermission,
			appInstance: { ...baseInstance, entryFileId: "file-copy" },
		})
		await copy.service.authorize("llm.use")

		expect(confirmPermission).toHaveBeenCalledTimes(2)
	})

	it("keys micro apps on appId regardless of entry file or path", async () => {
		const store = new MemoryGrantStore()
		const confirmPermission = allowAll()
		const microApp = {
			...baseInstance,
			appId: "app-1",
			appRootDir: "",
			entryPath: "index.html",
		}
		await createService({
			grantStore: store,
			confirmPermission,
			appInstance: microApp,
		}).service.authorize("llm.use")

		const sameApp = createService({
			grantStore: store,
			confirmPermission,
			appInstance: { ...microApp, entryFileId: "file-2", content: "changed" },
		})
		expect(await sameApp.service.authorize("llm.use")).toBe(true)
		expect(confirmPermission).toHaveBeenCalledOnce()

		const otherApp = createService({
			grantStore: store,
			confirmPermission,
			appInstance: { ...microApp, appId: "app-2" },
		})
		await otherApp.service.authorize("llm.use")
		expect(confirmPermission).toHaveBeenCalledTimes(2)
	})

	it("only prompts for newly declared scopes when the declaration grows", async () => {
		const store = new MemoryGrantStore()
		const confirmPermission = allowAll()
		await createService({ grantStore: store, confirmPermission }).service.authorize("llm.use")

		const grown = createService({
			grantStore: store,
			confirmPermission,
			appConfigState: manifest({
				permissions: { scopes: ["llm.use", "fs.project.read"] },
			}),
		})
		expect(await grown.service.authorizeMany(["llm.use", "fs.project.read"])).toBe(true)

		expect(confirmPermission).toHaveBeenCalledTimes(2)
		expect(confirmPermission.mock.calls[1][0].scopes).toEqual(["fs.project.read"])
	})

	it("falls back to one-time consent when the app has no stable id", async () => {
		const store = new MemoryGrantStore()
		const confirmPermission = vi.fn(async (request: HtmlPermissionConfirmRequest) => ({
			allowed: true,
			ttlMs: request.defaultTtlMs,
		}))
		const noId = createService({
			grantStore: store,
			confirmPermission,
			appInstance: { ...baseInstance, entryFileId: "" },
		})

		expect(await noId.service.authorize("llm.use")).toBe(true)
		expect(store.grants).toHaveLength(0)
		expect(await noId.service.authorize("llm.use")).toBe(true)
		expect(confirmPermission).toHaveBeenCalledTimes(2)
	})
})

describe("IframePermissionService legacy grant migration", () => {
	it("retries migration after a failed save, including after a service reload", async () => {
		const store = new MemoryGrantStore()
		const marker = createMemoryLegacyMigrationMarker()
		const config = manifest()
		const options = {
			grantStore: store,
			legacyMigrationMarker: marker,
			appConfigState: config,
			appInstance: baseInstance,
		}
		const first = createService(options).service
		const legacyIdentity = await legacyIdentityOf(first, "manifest", config.config)
		await store.save({ ...legacyIdentity, scope: "llm.use", grantedAt: 500, expiresAt: null })
		store.save.mockResolvedValueOnce(false)

		expect((await first.getPermissionSnapshot()).activeGrantCount).toBe(0)
		expect(store.grants[0].entryFileId).toBeUndefined()

		const reloaded = createService(options).service
		expect((await reloaded.getPermissionSnapshot()).activeGrantCount).toBe(1)
		expect(store.grants).toHaveLength(1)
		expect(store.grants[0].entryFileId).toBe("file-1")
	})

	it("adopts a grant saved under the old content fingerprint and keeps its expiry", async () => {
		const store = new MemoryGrantStore()
		const confirmPermission = allowAll()
		const config = manifest()
		const { service } = createService({
			grantStore: store,
			confirmPermission,
			appConfigState: config,
		})
		const legacyIdentity = await legacyIdentityOf(service, "manifest", config.config)
		await store.save({
			...legacyIdentity,
			scope: "llm.use",
			grantedAt: 500,
			expiresAt: 999_999_999,
		})

		expect(await service.authorize("llm.use")).toBe(true)

		expect(confirmPermission).not.toHaveBeenCalled()
		expect(store.grants).toHaveLength(1)
		expect(store.grants[0]).toMatchObject({
			entryFileId: "file-1",
			scope: "llm.use",
			grantedAt: 500,
			expiresAt: 999_999_999,
		})
	})

	it("does not adopt expired legacy grants", async () => {
		const store = new MemoryGrantStore()
		const confirmPermission = allowAll()
		const config = manifest()
		const { service } = createService({
			grantStore: store,
			confirmPermission,
			appConfigState: config,
		})
		const legacyIdentity = await legacyIdentityOf(service, "manifest", config.config)
		await store.save({ ...legacyIdentity, scope: "llm.use", grantedAt: 1, expiresAt: 2 })

		await service.authorize("llm.use")

		expect(confirmPermission).toHaveBeenCalledOnce()
	})

	it("ignores legacy grants made for different content", async () => {
		const store = new MemoryGrantStore()
		const confirmPermission = allowAll()
		const config = manifest()
		const older = createService({
			grantStore: store,
			confirmPermission,
			appConfigState: config,
			appInstance: { ...baseInstance, content: "<html>older</html>" },
		})
		const oldIdentity = await legacyIdentityOf(older.service, "manifest", config.config)
		await store.save({ ...oldIdentity, scope: "llm.use", grantedAt: 500, expiresAt: null })

		await createService({
			grantStore: store,
			confirmPermission,
			appConfigState: config,
		}).service.authorize("llm.use")

		expect(confirmPermission).toHaveBeenCalledOnce()
	})

	it("does not adopt legacy grants for scopes the manifest no longer declares", async () => {
		const store = new MemoryGrantStore()
		const confirmPermission = allowAll()
		const config = manifest()
		const { service } = createService({
			grantStore: store,
			confirmPermission,
			appConfigState: config,
		})
		const legacyIdentity = await legacyIdentityOf(service, "manifest", config.config)
		await store.save({
			...legacyIdentity,
			scope: "fs.project.read",
			grantedAt: 500,
			expiresAt: null,
		})

		const snapshot = await service.getPermissionSnapshot()

		expect(snapshot.activeGrantCount).toBe(0)
		expect(store.grants).toHaveLength(1)
	})

	it("does not adopt old grants again after a revoke, even for an earlier version of the file", async () => {
		const store = new MemoryGrantStore()
		const confirmPermission = allowAll()
		const marker = createMemoryLegacyMigrationMarker()
		const config = manifest()
		const original = createService({
			grantStore: store,
			confirmPermission,
			appConfigState: config,
			legacyMigrationMarker: marker,
		})
		const legacyIdentity = await legacyIdentityOf(original.service, "manifest", config.config)
		await store.save({ ...legacyIdentity, scope: "llm.use", grantedAt: 500, expiresAt: null })
		await original.service.revoke("llm.use")
		// An older grant for this content version is still stored under the legacy key.
		await store.save({ ...legacyIdentity, scope: "llm.use", grantedAt: 600, expiresAt: null })

		const reloaded = createService({
			grantStore: store,
			confirmPermission,
			appConfigState: config,
			legacyMigrationMarker: marker,
		})
		await reloaded.service.authorize("llm.use")

		expect(confirmPermission).toHaveBeenCalledOnce()
	})

	it("does not bring back a revoked grant through migration", async () => {
		const store = new MemoryGrantStore()
		const confirmPermission = allowAll()
		const config = manifest()
		const { service } = createService({
			grantStore: store,
			confirmPermission,
			appConfigState: config,
		})
		const legacyIdentity = await legacyIdentityOf(service, "manifest", config.config)
		await store.save({ ...legacyIdentity, scope: "llm.use", grantedAt: 500, expiresAt: null })

		await service.revoke("llm.use")
		const fresh = createService({
			grantStore: store,
			confirmPermission,
			appConfigState: config,
		})
		await fresh.service.authorize("llm.use")

		expect(store.grants.filter((grant) => grant.scope === "llm.use")).toHaveLength(1)
		expect(confirmPermission).toHaveBeenCalledOnce()
	})
})
