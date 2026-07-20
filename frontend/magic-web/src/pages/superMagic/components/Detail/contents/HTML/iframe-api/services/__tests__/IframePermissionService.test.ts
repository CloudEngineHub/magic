import { beforeEach, describe, expect, it, vi } from "vitest"
import {
	IframePermissionService,
	type HtmlPermissionConfirmRequest,
	type IframePermissionServiceConfig,
} from "../IframePermissionService"
import type { HtmlPermissionGrant, HtmlPermissionGrantStore } from "../HtmlPermissionGrantStore"
import { htmlMicroAppPreviewLogger } from "../../../utils/htmlMicroAppPreviewLogger"

class MemoryGrantStore implements HtmlPermissionGrantStore {
	grants: HtmlPermissionGrant[] = []
	save = vi.fn((grant: HtmlPermissionGrant) => {
		this.grants = this.grants.filter(
			(item) =>
				!(
					item.mode === grant.mode &&
					item.userKey === grant.userKey &&
					item.projectId === grant.projectId &&
					item.appRootDir === grant.appRootDir &&
					item.entryPath === grant.entryPath &&
					item.appFingerprint === grant.appFingerprint &&
					item.scope === grant.scope
				),
		)
		this.grants.push(grant)
	})
	list = vi.fn(() => this.grants)
	remove = vi.fn((match: Partial<HtmlPermissionGrant>) => {
		this.grants = this.grants.filter((grant) =>
			Object.entries(match).some(
				([key, value]) => grant[key as keyof HtmlPermissionGrant] !== value,
			),
		)
	})
	prune = vi.fn((now: number) => {
		this.grants = this.grants.filter((grant) => grant.expiresAt > now)
	})
}

function createService(overrides: Partial<IframePermissionServiceConfig> = {}) {
	const grantStore = new MemoryGrantStore()
	const confirmPermission = vi.fn(async () => ({ allowed: true, ttlMs: 15 * 60 * 1000 }))
	const service = new IframePermissionService({
		grantStore,
		confirmPermission,
		getNow: () => 1_000_000,
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
			userKey: "user-1",
			projectId: "project-1",
			appRootDir: "app/",
			entryPath: "app/index.html",
			content: "<html>manifest</html>",
		},
		...overrides,
	})
	return { service, grantStore, confirmPermission }
}

describe("IframePermissionService", () => {
	beforeEach(() => {
		vi.clearAllMocks()
		vi.spyOn(htmlMicroAppPreviewLogger, "warn").mockImplementation(() => undefined)
	})

	it("rejects undeclared manifest scopes with diagnostics and without prompting", async () => {
		const onMissingDeclaration = vi.fn()
		const { service, grantStore, confirmPermission } = createService({
			onMissingDeclaration,
		})

		const allowed = await service.authorize("project.message.write")

		expect(allowed).toBe(false)
		expect(confirmPermission).not.toHaveBeenCalled()
		expect(grantStore.save).not.toHaveBeenCalled()
		expect(htmlMicroAppPreviewLogger.warn).toHaveBeenCalledWith(
			"Permission blocked: scope not declared in app.json",
			{
				appName: "Manifest App",
				declaredScopes: ["llm.use"],
				scope: "project.message.write",
			},
		)
		expect(onMissingDeclaration).toHaveBeenCalledWith({
			appName: "Manifest App",
			declaredScopes: ["llm.use"],
			scope: "project.message.write",
		})
	})

	it("saves a grant using the selected ttl for declared manifest scopes", async () => {
		const { service, grantStore, confirmPermission } = createService()

		const allowed = await service.authorize("llm.use")

		expect(allowed).toBe(true)
		expect(confirmPermission).toHaveBeenCalledWith(
			expect.objectContaining<Partial<HtmlPermissionConfirmRequest>>({
				appName: "Manifest App",
				mode: "manifest",
				scopes: ["llm.use"],
				reason: "Analyze project data",
			}),
		)
		expect(grantStore.save).toHaveBeenCalledWith(
			expect.objectContaining({
				mode: "manifest",
				scope: "llm.use",
				expiresAt: 1_900_000,
			}),
		)
		expect(confirmPermission.mock.calls[0][0].ttlOptions.map((option) => option.ttlMs)).toEqual(
			[
				5 * 60 * 1000,
				15 * 60 * 1000,
				30 * 60 * 1000,
				60 * 60 * 1000,
				2 * 60 * 60 * 1000,
				4 * 60 * 60 * 1000,
				8 * 60 * 60 * 1000,
				12 * 60 * 60 * 1000,
			],
		)
	})

	it("does not save reusable grant when user selects current request only", async () => {
		const { service, grantStore } = createService({
			confirmPermission: vi.fn(async () => ({ allowed: true, ttlMs: 0 })),
			appConfigState: {
				status: "loaded",
				config: {
					name: "Writer",
					permissions: { scopes: ["fs.project.write"] },
				},
			},
		})

		const allowed = await service.authorize("fs.project.write")

		expect(allowed).toBe(true)
		expect(grantStore.save).not.toHaveBeenCalled()
	})

	it("reuses an unexpired grant without prompting", async () => {
		const { service, grantStore, confirmPermission } = createService()

		await service.authorize("llm.use")
		await service.authorize("llm.use")

		expect(confirmPermission).toHaveBeenCalledTimes(1)
		expect(grantStore.save).toHaveBeenCalledTimes(1)
	})

	it("prompts legacy apps with shorter ttl options", async () => {
		const { service, confirmPermission } = createService({
			appConfigState: { status: "absent" },
		})

		const allowed = await service.authorize("project.files.download")

		expect(allowed).toBe(true)
		expect(confirmPermission).toHaveBeenCalledWith(
			expect.objectContaining<Partial<HtmlPermissionConfirmRequest>>({
				mode: "legacy",
				scopes: ["project.files.download"],
				isLegacy: true,
			}),
		)
		const request = confirmPermission.mock.calls[0][0]
		expect(request.ttlOptions.map((option) => option.ttlMs)).toEqual([
			5 * 60 * 1000,
			15 * 60 * 1000,
			30 * 60 * 1000,
		])
	})

	it("offers longer but still bounded ttl options for manifest project writes", async () => {
		const { service, confirmPermission } = createService({
			appConfigState: {
				status: "loaded",
				config: {
					name: "Writer",
					permissions: { scopes: ["fs.project.write"] },
				},
			},
		})

		await service.authorize("fs.project.write")

		expect(confirmPermission.mock.calls[0][0].ttlOptions.map((option) => option.ttlMs)).toEqual(
			[
				0,
				5 * 60 * 1000,
				10 * 60 * 1000,
				30 * 60 * 1000,
				60 * 60 * 1000,
				2 * 60 * 60 * 1000,
				4 * 60 * 60 * 1000,
				8 * 60 * 60 * 1000,
				12 * 60 * 60 * 1000,
			],
		)
	})

	it("rejects while app config is loading without prompting", async () => {
		const { service, grantStore, confirmPermission } = createService({
			appConfigState: { status: "loading" },
		})

		const allowed = await service.authorize("llm.use")

		expect(allowed).toBe(false)
		expect(confirmPermission).not.toHaveBeenCalled()
		expect(grantStore.save).not.toHaveBeenCalled()
	})

	it("falls back to legacy confirmation when app config failed to load", async () => {
		const { service, grantStore, confirmPermission } = createService({
			appConfigState: { status: "error", error: "HTTP 500" },
		})

		const allowed = await service.authorize("llm.use")

		expect(allowed).toBe(true)
		expect(confirmPermission).toHaveBeenCalledWith(
			expect.objectContaining<Partial<HtmlPermissionConfirmRequest>>({
				mode: "legacy",
				isLegacy: true,
				appConfigLoadError: "HTTP 500",
				scopes: ["llm.use"],
			}),
		)
		expect(grantStore.save).toHaveBeenCalledWith(
			expect.objectContaining({
				mode: "legacy",
				scope: "llm.use",
			}),
		)
		expect(htmlMicroAppPreviewLogger.warn).toHaveBeenCalledWith(
			"Permission fallback: app.json unavailable, using legacy confirmation",
			{
				scopes: ["llm.use"],
				error: "HTTP 500",
			},
		)
	})

	it("authorizes user info scopes together and persists one grant per scope", async () => {
		const { service, grantStore, confirmPermission } = createService({
			appConfigState: {
				status: "loaded",
				config: {
					name: "Profile App",
					permissions: {
						scopes: ["user.profile.name", "user.profile.identity"],
					},
				},
			},
		})

		const allowed = await service.authorizeMany(
			["user.profile.name", "user.profile.identity"],
			{ reason: "Build a profile card", presentation: "userInfo" },
		)

		expect(allowed).toBe(true)
		expect(confirmPermission).toHaveBeenCalledWith(
			expect.objectContaining({
				scopes: ["user.profile.name", "user.profile.identity"],
				reason: "Build a profile card",
				presentation: "userInfo",
			}),
		)
		expect(grantStore.save).toHaveBeenCalledTimes(2)
	})

	it("includes legacy userInfo declarations in the unified manifest scopes", async () => {
		const { service, confirmPermission } = createService({
			appConfigState: {
				status: "loaded",
				config: {
					permissions: {
						userInfo: { scopes: ["user.profile.organization"] },
					},
				},
			},
		})

		expect(await service.authorize("user.profile.organization")).toBe(true)
		expect(confirmPermission).toHaveBeenCalledOnce()
	})

	it("returns declaration diagnostics and only current app grants in snapshots", async () => {
		const { service, grantStore } = createService({
			appConfigState: {
				status: "loaded",
				config: {
					name: "Diagnostic App",
					permissions: {
						scopes: ["llm.use", "llm.use", "future.scope"] as never,
					},
				},
			},
		})
		await service.authorize("llm.use")
		grantStore.grants.push({
			...grantStore.grants[0],
			projectId: "another-project",
			scope: "project.message.write",
		})

		const snapshot = await service.getPermissionSnapshot()

		expect(snapshot.activeGrantCount).toBe(1)
		expect(snapshot.permissions.find((item) => item.scope === "llm.use")?.grant).toBeDefined()
		expect(snapshot.permissions.find((item) => item.scope === "future.scope")).toMatchObject({
			supported: false,
			declarationStatus: "unsupported",
		})
		expect(snapshot.diagnostics).toEqual(
			expect.arrayContaining([
				{ code: "scopeDuplicate", scope: "llm.use" },
				{ code: "scopeUnsupported", scope: "future.scope" },
			]),
		)
	})

	it("treats malformed permissions.scopes as an empty declaration", async () => {
		const { service, confirmPermission } = createService({
			appConfigState: {
				status: "loaded",
				config: {
					permissions: { scopes: "llm.use" as never },
				},
			},
		})

		expect(await service.authorize("llm.use")).toBe(false)
		expect(confirmPermission).not.toHaveBeenCalled()
		expect((await service.getPermissionSnapshot()).diagnostics).toContainEqual({
			code: "scopesInvalid",
		})
	})

	it("prunes expired grants when reading the permission snapshot", async () => {
		let now = 1_000_000
		const { service, grantStore } = createService({
			getNow: () => now,
			confirmPermission: vi.fn(async () => ({ allowed: true, ttlMs: 5 * 60 * 1000 })),
		})
		await service.authorize("llm.use")
		now += 6 * 60 * 1000

		const snapshot = await service.getPermissionSnapshot()

		expect(snapshot.activeGrantCount).toBe(0)
		expect(grantStore.grants).toHaveLength(0)
	})

	it("updates an active grant duration from the current time", async () => {
		let now = 1_000_000
		const onGrantsChanged = vi.fn()
		const { service, grantStore } = createService({
			getNow: () => now,
			onGrantsChanged,
		})
		await service.authorize("llm.use")
		grantStore.grants.push({
			...grantStore.grants[0],
			projectId: "another-project",
		})
		now += 60_000

		const snapshot = await service.updateGrantTtl("llm.use", 4 * 60 * 60 * 1000)

		expect(grantStore.grants).toContainEqual(
			expect.objectContaining({
				scope: "llm.use",
				grantedAt: now,
				expiresAt: now + 4 * 60 * 60 * 1000,
			}),
		)
		expect(
			snapshot.permissions
				.find((item) => item.scope === "llm.use")
				?.ttlOptions.map((option) => option.ttlMs),
		).toContain(4 * 60 * 60 * 1000)
		expect(onGrantsChanged).toHaveBeenCalledTimes(2)
		expect(grantStore.grants.some((grant) => grant.projectId === "another-project")).toBe(true)
	})

	it("rejects non-persistent durations when updating an active grant", async () => {
		const { service, grantStore } = createService({
			appConfigState: {
				status: "loaded",
				config: {
					name: "Writer",
					permissions: { scopes: ["fs.project.write"] },
				},
			},
			confirmPermission: vi.fn(async () => ({ allowed: true, ttlMs: 5 * 60 * 1000 })),
		})
		await service.authorize("fs.project.write")

		await expect(service.updateGrantTtl("fs.project.write", 0)).rejects.toThrow(
			"Permission duration is not allowed",
		)
		expect(grantStore.grants[0].expiresAt).toBe(1_300_000)
	})

	it("revokes one scope or all scopes without removing other app grants", async () => {
		const { service, grantStore } = createService({
			appConfigState: {
				status: "loaded",
				config: {
					permissions: { scopes: ["llm.use", "project.files.download"] },
				},
			},
		})
		await service.authorizeMany(["llm.use", "project.files.download"])
		grantStore.grants.push({
			...grantStore.grants[0],
			projectId: "another-project",
		})

		let snapshot = await service.revoke("llm.use")
		expect(snapshot.activeGrantCount).toBe(1)
		expect(grantStore.grants.some((grant) => grant.projectId === "another-project")).toBe(true)

		snapshot = await service.revokeAll()
		expect(snapshot.activeGrantCount).toBe(0)
		expect(grantStore.grants).toHaveLength(1)
		expect(grantStore.grants[0].projectId).toBe("another-project")
	})

	it("prompts again after the current scope is revoked", async () => {
		const { service, confirmPermission } = createService()
		await service.authorize("llm.use")
		await service.revoke("llm.use")

		expect(await service.authorize("llm.use")).toBe(true)
		expect(confirmPermission).toHaveBeenCalledTimes(2)
	})

	it("does not reuse grants when the app fingerprint changes", async () => {
		const store = new MemoryGrantStore()
		const confirmPermission = vi.fn(async () => ({ allowed: true, ttlMs: 15 * 60 * 1000 }))
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
})
