import { describe, expect, it, vi } from "vitest"
import type { CanvasSpatialPerfDebugApi } from "../../shared/geometry/CanvasSpatialPerfDebug"
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

	it("collects query profiling only during an explicit debug session", () => {
		const manager = createManager(
			new Map([
				["visible", { x: 0, y: 0, width: 100, height: 100 }],
				["far", { x: 4_000, y: 4_000, width: 100, height: 100 }],
			]),
		)

		manager.queryElementIdsByExpandedRect({ x: 0, y: 0, width: 200, height: 200 }, 0, {
			elementIds: ["visible", "far"],
			debugSource: "before-start",
		})
		expect(manager.getSpatialQueryProfilingSnapshot()).toBeNull()

		manager.startSpatialQueryProfiling()
		manager.queryElementIdsByExpandedRect({ x: 0, y: 0, width: 200, height: 200 }, 0, {
			elementIds: ["visible", "far"],
			debugSource: "test:visible",
		})
		const snapshot = manager.stopSpatialQueryProfiling()

		expect(snapshot).toMatchObject({
			queryCount: 1,
			indexedQueryCount: 1,
			directScanQueryCount: 0,
			filterQueryCount: 1,
			copiedFilterQueryCount: 1,
			copiedFilterElementCount: 2,
			totalResultCount: 1,
			sources: {
				"test:visible": {
					queryCount: 1,
					indexedQueryCount: 1,
					directScanQueryCount: 0,
					totalResultCount: 1,
				},
			},
		})
		expect(manager.getSpatialQueryProfilingSnapshot()).toBeNull()
	})

	it("exposes opt-in console controls for a real Canvas target", () => {
		const consoleLogSpy = vi.spyOn(console, "log").mockImplementation(() => undefined)
		const boundsById = new Map([["visible", { x: 0, y: 0, width: 100, height: 100 }]])
		const elementIds = Array.from(boundsById.keys())
		const manager = new GeometryCacheManager({
			canvas: {
				id: "debug-canvas",
				elementManager: {
					getAllElementIds: () => elementIds,
					getElementInstance: (id: string) => ({
						getBoundingRect: () => boundsById.get(id) ?? null,
					}),
					isElementVisibleInDataTree: () => true,
				},
				runtimeScheduler: {
					getSnapshot: () => ({
						drawRequestCount: 10,
						drawnCount: 8,
						viewportScaleLayouts: {
							activeElementCount: 1,
							dispatchCount: 3,
							registeredElementCount: 1,
							totalCallbackCount: 3,
						},
					}),
				},
				stage: { scaleX: () => 0.5 },
				visibilityManager: {
					getSnapshot: () => ({
						lastQueryDurationMs: 0.2,
						nearAudioCount: 0,
						nearImageCount: 0,
						nearVideoCount: 0,
						queryCount: 4,
						registeredAudioCount: 0,
						registeredImageCount: 1,
						registeredVideoCount: 0,
						skippedViewportQueryCount: 2,
						visibleAudioCount: 0,
						visibleImageCount: 1,
						visibleVideoCount: 0,
					}),
				},
			} as never,
		})
		const debugGlobal = globalThis as typeof globalThis & {
			__MAGIC_CANVAS_SPATIAL_PERF__?: CanvasSpatialPerfDebugApi
		}

		try {
			const debugApi = debugGlobal.__MAGIC_CANVAS_SPATIAL_PERF__
			expect(debugApi).toBeDefined()
			debugApi?.start("debug-canvas")
			manager.queryElementIdsByExpandedRect({ x: 0, y: 0, width: 200, height: 200 }, 0, {
				debugSource: "test:console",
			})
			const result = debugApi?.stop("debug-canvas")

			expect(result).toMatchObject({
				event: "stop",
				canvasId: "debug-canvas",
				elementCount: 1,
				viewportScale: 0.5,
				profiling: {
					queryCount: 1,
					sources: { "test:console": { queryCount: 1 } },
				},
			})
			expect(consoleLogSpy).toHaveBeenCalledTimes(2)
			expect(consoleLogSpy.mock.calls[0]?.[0]).toMatch(/^\[CanvasSpatialPerf\] \{/)
			expect(consoleLogSpy.mock.calls[1]?.[0]).toMatch(/^\[CanvasSpatialPerf\] \{/)
		} finally {
			manager.destroy()
			consoleLogSpy.mockRestore()
		}
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

	it("reuses a candidate Set without copying it before an indexed query", () => {
		const manager = createManager(
			new Map([
				["allowed", { x: 0, y: 0, width: 100, height: 100 }],
				["excluded", { x: 20, y: 20, width: 100, height: 100 }],
			]),
		)
		const allowedIds = new Set(["allowed"])
		const iteratorSpy = vi.spyOn(allowedIds, Symbol.iterator)

		const ids = manager.queryElementIdsByExpandedRect(
			{ x: 0, y: 0, width: 200, height: 200 },
			0,
			{ elementIds: allowedIds },
		)

		expect(ids).toEqual(["allowed"])
		expect(iteratorSpy).not.toHaveBeenCalled()
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
