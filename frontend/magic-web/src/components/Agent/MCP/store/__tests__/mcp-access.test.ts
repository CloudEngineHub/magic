import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/apis", () => ({
	ContactApi: {},
	FlowApi: {},
}))

import { getMCPAccess, loadMCPWithLegacyCompatibility } from "../mcp-access"
import { defaultMCPStore } from "../mcp-store"

const createAccess = (mcpList: Array<{ id: string }>) => ({
	mcpList,
	load: vi.fn().mockResolvedValue(undefined),
	save: vi.fn().mockResolvedValue(undefined),
})

describe("getMCPAccess", () => {
	beforeEach(() => {
		localStorage.clear()
	})

	it("returns shared default store without params", () => {
		expect(getMCPAccess()).toBe(defaultMCPStore)
	})

	it("returns cached project store for the same storage key", () => {
		const firstAccess = getMCPAccess({ storageKey: "project-id" })
		const secondAccess = getMCPAccess({ storageKey: "project-id" })

		expect(firstAccess).toBe(secondAccess)
		expect(firstAccess).not.toBe(defaultMCPStore)
	})

	it("returns shared temp store when temp storage is enabled", () => {
		const firstAccess = getMCPAccess({ useTempStorage: true })
		const secondAccess = getMCPAccess({ useTempStorage: true })

		expect(firstAccess).toBe(secondAccess)
		expect(firstAccess).not.toBe(defaultMCPStore)
	})

	it("rehydrates an empty added bucket even when the migration marker exists", async () => {
		localStorage.setItem(
			"magic_mcp_legacy_migration_v1",
			JSON.stringify({ "project-id": ["legacy-mcp"] }),
		)
		const addedAccess = createAccess([])
		const legacyAccess = createAccess([{ id: "legacy-mcp" }])

		await loadMCPWithLegacyCompatibility({
			addedAccess: addedAccess as never,
			legacyAccess: legacyAccess as never,
			legacyStorageKey: "project-id",
		})

		expect(addedAccess.save).toHaveBeenCalledWith({
			selectedIds: new Set(["legacy-mcp"]),
			items: [{ id: "legacy-mcp" }],
		})
		expect(JSON.parse(localStorage.getItem("magic_mcp_legacy_migration_v1") ?? "{}")).toEqual({
			"project-id": ["legacy-mcp"],
		})
	})

	it("shares an in-flight migration between input surfaces", async () => {
		const addedAccess = createAccess([])
		const legacyAccess = createAccess([{ id: "legacy-mcp" }])

		await Promise.all([
			loadMCPWithLegacyCompatibility({
				addedAccess: addedAccess as never,
				legacyAccess: legacyAccess as never,
				legacyStorageKey: "project-id",
			}),
			loadMCPWithLegacyCompatibility({
				addedAccess: addedAccess as never,
				legacyAccess: legacyAccess as never,
				legacyStorageKey: "project-id",
			}),
		])

		expect(addedAccess.save).toHaveBeenCalledTimes(1)
	})
})
