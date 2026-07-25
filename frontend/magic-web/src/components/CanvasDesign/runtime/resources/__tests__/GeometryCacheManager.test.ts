import { describe, expect, it } from "vitest"
import { GeometryCacheManager } from "../../shared/geometry/GeometryCacheManager"

function createManager(
	boundsById: Map<string, { x: number; y: number; width: number; height: number }>,
) {
	const elementIds: string[] = []
	boundsById.forEach((_, id) => {
		elementIds.push(id)
	})
	const visibleIds = new Set(elementIds)
	return new GeometryCacheManager({
		canvas: {
			elementManager: {
				getAllElementIds: () => elementIds,
				isElementVisibleInDataTree: (id: string) => visibleIds.has(id),
				getElementInstance: (id: string) => ({
					getBoundingRect: () => boundsById.get(id) ?? null,
				}),
			},
		} as never,
	})
}

describe("GeometryCacheManager", () => {
	it("returns elements that only expose a small corner in the viewport", () => {
		const manager = createManager(
			new Map([
				["corner", { x: 99, y: 99, width: 20, height: 20 }],
				["outside", { x: 121, y: 121, width: 20, height: 20 }],
			]),
		)

		const ids = manager.queryElementIdsByExpandedRect(
			{ x: 0, y: 0, width: 100, height: 100 },
			0,
		)

		expect(ids).toContain("corner")
		expect(ids).not.toContain("outside")
	})

	it("keeps indexed viewport queries cheap for large element sets", () => {
		const boundsById = new Map<
			string,
			{ x: number; y: number; width: number; height: number }
		>()
		for (let index = 0; index < 10_000; index += 1) {
			boundsById.set(`element-${index}`, {
				x: (index % 100) * 220,
				y: Math.floor(index / 100) * 180,
				width: 160,
				height: 120,
			})
		}
		const manager = createManager(boundsById)

		const startedAt = performance.now()
		const ids = manager.queryElementIdsByExpandedRect(
			{ x: 2_000, y: 2_000, width: 1_440, height: 900 },
			0,
		)
		const durationMs = performance.now() - startedAt

		expect(ids.length).toBeGreaterThan(0)
		expect(ids.length).toBeLessThan(200)
		expect(durationMs).toBeLessThan(500)
	})

	it("restricts spatial queries to the provided candidate ids", () => {
		const manager = createManager(
			new Map([
				["allowed", { x: 0, y: 0, width: 100, height: 100 }],
				["excluded", { x: 20, y: 20, width: 100, height: 100 }],
			]),
		)

		const ids = manager.queryElementIdsByExpandedRect(
			{ x: 0, y: 0, width: 200, height: 200 },
			0,
			{ elementIds: ["allowed"] },
		)

		expect(ids).toEqual(["allowed"])
	})

	it("directly scans candidate ids when a huge query would enumerate too many cells", () => {
		const boundsById = new Map([
			["allowed", { x: 0, y: 0, width: 100, height: 100 }],
			["far", { x: 1_000_000, y: 1_000_000, width: 100, height: 100 }],
		])
		const elementIds = Array.from(boundsById.keys())
		let getAllElementIdsCount = 0
		const manager = new GeometryCacheManager({
			canvas: {
				elementManager: {
					getAllElementIds: () => {
						getAllElementIdsCount += 1
						return elementIds
					},
					isElementVisibleInDataTree: (id: string) => boundsById.has(id),
					getElementInstance: (id: string) => ({
						getBoundingRect: () => boundsById.get(id) ?? null,
					}),
				},
			} as never,
		})

		const ids = manager.queryElementIdsByExpandedRect(
			{ x: -500_000, y: -500_000, width: 1_000_000, height: 1_000_000 },
			0,
			{ elementIds: ["allowed"] },
		)

		expect(ids).toEqual(["allowed"])
		expect(getAllElementIdsCount).toBe(0)
	})

	it("keeps data-tree visibility filtering on the direct scan path", () => {
		const boundsById = new Map([
			["visible", { x: 0, y: 0, width: 100, height: 100 }],
			["hidden", { x: 10, y: 10, width: 100, height: 100 }],
		])
		const visibleIds = new Set(["visible"])
		const manager = new GeometryCacheManager({
			canvas: {
				elementManager: {
					getAllElementIds: () => Array.from(boundsById.keys()),
					isElementVisibleInDataTree: (id: string) => visibleIds.has(id),
					getElementInstance: (id: string) => ({
						getBoundingRect: () => boundsById.get(id) ?? null,
					}),
				},
			} as never,
		})

		const ids = manager.queryElementIdsByExpandedRect(
			{ x: -500_000, y: -500_000, width: 1_000_000, height: 1_000_000 },
			0,
			{ elementIds: ["visible", "hidden"] },
		)

		expect(ids).toEqual(["visible"])
	})

	it("updates indexed cells incrementally after an element moves", () => {
		const boundsById = new Map([
			["moving", { x: 0, y: 0, width: 100, height: 100 }],
			["stable", { x: 4_000, y: 4_000, width: 100, height: 100 }],
		])
		const elementIds = Array.from(boundsById.keys())
		const visibleIds = new Set(elementIds)
		let getAllElementIdsCount = 0
		const manager = new GeometryCacheManager({
			canvas: {
				elementManager: {
					getAllElementIds: () => {
						getAllElementIdsCount += 1
						return elementIds
					},
					isElementVisibleInDataTree: (id: string) => visibleIds.has(id),
					getElementInstance: (id: string) => ({
						getBoundingRect: () => boundsById.get(id) ?? null,
					}),
				},
			} as never,
		})

		expect(
			manager.queryElementIdsByExpandedRect({ x: 0, y: 0, width: 200, height: 200 }, 0),
		).toContain("moving")
		expect(getAllElementIdsCount).toBe(1)

		boundsById.set("moving", { x: 8_000, y: 8_000, width: 100, height: 100 })
		manager.invalidateElement("moving")

		expect(
			manager.queryElementIdsByExpandedRect({ x: 0, y: 0, width: 200, height: 200 }, 0),
		).not.toContain("moving")
		expect(
			manager.queryElementIdsByExpandedRect(
				{ x: 8_000, y: 8_000, width: 200, height: 200 },
				0,
			),
		).toContain("moving")
		expect(getAllElementIdsCount).toBe(1)
	})
})
