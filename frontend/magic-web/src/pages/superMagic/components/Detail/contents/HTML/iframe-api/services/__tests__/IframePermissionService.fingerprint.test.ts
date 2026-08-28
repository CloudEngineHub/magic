import { describe, expect, it, vi } from "vitest"
import type { HtmlPermissionConfirmRequest } from "../IframePermissionService"
import { createService, MemoryGrantStore } from "./IframePermissionService.testUtils"

describe("IframePermissionService app fingerprint", () => {
	it("does not reuse grants when the app fingerprint changes", async () => {
		const store = new MemoryGrantStore()
		const confirmPermission = vi.fn(async () => ({
			allowed: true,
			ttlMs: 24 * 60 * 60 * 1000,
		}))
		const first = createService({ grantStore: store, confirmPermission })
		await first.service.authorize("llm.use")

		const second = createService({
			grantStore: store,
			confirmPermission,
			appConfigState: {
				status: "loaded",
				config: {
					name: "Manifest App",
					entry: "index.html",
					version: "2.0.0",
					permissions: { scopes: ["llm.use"] },
				},
			},
		})

		await second.service.authorize("llm.use")

		expect(confirmPermission).toHaveBeenCalledTimes(2)
	})

	it("does not reuse manifest grants when the permission declaration changes", async () => {
		const store = new MemoryGrantStore()
		const confirmPermission = vi.fn(async (request: HtmlPermissionConfirmRequest) => ({
			allowed: true,
			ttlMs: request.defaultTtlMs,
		}))
		const first = createService({ grantStore: store, confirmPermission })
		await first.service.authorize("llm.use")

		const second = createService({
			grantStore: store,
			confirmPermission,
			appConfigState: {
				status: "loaded",
				config: {
					name: "Manifest App",
					entry: "index.html",
					permissions: {
						scopes: ["llm.use"],
						reason: "A new purpose",
					},
				},
			},
		})

		await second.service.authorize("llm.use")

		expect(confirmPermission).toHaveBeenCalledTimes(2)
	})

	it("does not reuse manifest grants when executable source changes", async () => {
		const store = new MemoryGrantStore()
		const confirmPermission = vi.fn(async () => ({
			allowed: true,
			ttlMs: 24 * 60 * 60 * 1000,
		}))
		const first = createService({ grantStore: store, confirmPermission })
		await first.service.authorize("llm.use")

		const second = createService({
			grantStore: store,
			confirmPermission,
			appInstance: {
				userId: "user-1",
				projectId: "project-1",
				appRootDir: "app/",
				entryPath: "app/index.html",
				content: "<html>changed source</html>",
			},
		})

		await second.service.authorize("llm.use")

		expect(confirmPermission).toHaveBeenCalledTimes(2)
	})

	it("does not reuse manifest grants when executable resource versions change", async () => {
		const store = new MemoryGrantStore()
		const confirmPermission = vi.fn(async () => ({
			allowed: true,
			ttlMs: 24 * 60 * 60 * 1000,
		}))
		const first = createService({
			grantStore: store,
			confirmPermission,
			appInstance: {
				userId: "user-1",
				projectId: "project-1",
				appRootDir: "app/",
				entryPath: "app/index.html",
				content: "<html>same source</html>",
				runtimeFingerprint: "runtime-v1",
			},
		})
		await first.service.authorize("llm.use")

		const second = createService({
			grantStore: store,
			confirmPermission,
			appInstance: {
				userId: "user-1",
				projectId: "project-1",
				appRootDir: "app/",
				entryPath: "app/index.html",
				content: "<html>same source</html>",
				runtimeFingerprint: "runtime-v2",
			},
		})

		await second.service.authorize("llm.use")

		expect(confirmPermission).toHaveBeenCalledTimes(2)
	})

	it("persists grants when the app uses external executable resources", async () => {
		const store = new MemoryGrantStore()
		const confirmPermission = vi.fn(async () => ({
			allowed: true,
			ttlMs: 24 * 60 * 60 * 1000,
		}))
		const appInstance = {
			userId: "user-1",
			projectId: "project-1",
			appRootDir: "app/",
			entryPath: "app/index.html",
			content: '<script src="https://cdn.example.com/app.js"></script>',
			// 即使调用方还携带旧的外部资源标记，也不能再影响授权持久化。
			hasUnversionedExternalRuntimeResources: true,
		}
		const service = createService({
			grantStore: store,
			confirmPermission,
			appInstance,
		})

		expect(
			await service.service.authorize("llm.use", {
				allowOnce: false,
			}),
		).toBe(true)
		expect(await service.service.authorize("llm.use")).toBe(true)
		expect(confirmPermission).toHaveBeenCalledOnce()
		expect(store.grants).toHaveLength(1)
	})

	it("does not reuse legacy grants when executable resource versions change", async () => {
		const store = new MemoryGrantStore()
		const confirmPermission = vi.fn(async () => ({
			allowed: true,
			ttlMs: 24 * 60 * 60 * 1000,
		}))
		const first = createService({
			grantStore: store,
			confirmPermission,
			appConfigState: { status: "absent" },
			appInstance: {
				userId: "user-1",
				projectId: "project-1",
				appRootDir: "app/",
				entryPath: "app/index.html",
				content: "<html>same source</html>",
				runtimeFingerprint: "runtime-v1",
			},
		})
		await first.service.authorize("llm.use")

		const second = createService({
			grantStore: store,
			confirmPermission,
			appConfigState: { status: "absent" },
			appInstance: {
				userId: "user-1",
				projectId: "project-1",
				appRootDir: "app/",
				entryPath: "app/index.html",
				content: "<html>same source</html>",
				runtimeFingerprint: "runtime-v2",
			},
		})
		await second.service.authorize("llm.use")

		expect(confirmPermission).toHaveBeenCalledTimes(2)
	})
})
