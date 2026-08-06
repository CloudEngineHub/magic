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

	it("reuses manifest grants when source changes without a manifest change", async () => {
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

		expect(confirmPermission).toHaveBeenCalledTimes(1)
	})
})
