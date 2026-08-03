import { describe, expect, it, vi } from "vitest"
import type { Canvas } from "../../../../runtime/core/Canvas"
import { ElementTypeEnum } from "../../../../runtime/document/types"
import {
	collectMinimapScene,
	getMinimapSceneSubtreeIds,
	getMinimapSceneStationaryBounds,
	refreshMinimapSceneItems,
	translateMinimapSceneItems,
} from "../minimapScene"

describe("minimap scene", () => {
	it("collects visible geometry, classifies containers, and ignores connections", () => {
		let boundsById: Record<string, { x: number; y: number; width: number; height: number }> = {
			frame: { x: 0, y: 0, width: 200, height: 120 },
			group: { x: 20, y: 20, width: 80, height: 60 },
			image: { x: 30, y: 30, width: 40, height: 20 },
			invalid: { x: 0, y: 0, width: 0, height: 20 },
		}
		const getElementBounds = vi.fn((elementId: string) => boundsById[elementId])
		const canvas = {
			elementManager: {
				getAllElements: () => [
					{
						id: "frame",
						type: ElementTypeEnum.Frame,
						children: [
							{
								id: "group",
								type: ElementTypeEnum.Group,
								children: [{ id: "image", type: ElementTypeEnum.Image }],
							},
							{ id: "invalid", type: ElementTypeEnum.Image },
							{
								id: "hidden",
								type: ElementTypeEnum.Frame,
								visible: false,
								children: [{ id: "hidden-child", type: ElementTypeEnum.Image }],
							},
						],
					},
				],
			},
			geometryCacheManager: { getElementBounds },
			get connectionManager() {
				throw new Error("connections must not be read by the minimap")
			},
		} as unknown as Canvas

		const scene = collectMinimapScene(canvas)

		expect(scene.items).toEqual([
			{
				id: "frame",
				kind: "container",
				bounds: { x: 0, y: 0, width: 200, height: 120 },
			},
			{
				id: "group",
				kind: "container",
				bounds: { x: 20, y: 20, width: 80, height: 60 },
			},
			{
				id: "image",
				kind: "element",
				bounds: { x: 30, y: 30, width: 40, height: 20 },
			},
		])
		expect(scene.contentBounds).toEqual({ x: 0, y: 0, width: 200, height: 120 })
		expect(getMinimapSceneSubtreeIds(scene, ["frame"])).toEqual(["frame", "group", "image"])
		expect(getMinimapSceneSubtreeIds(scene, ["group"])).toEqual(["group", "image"])
		expect(getElementBounds).not.toHaveBeenCalledWith("hidden")
		expect(getElementBounds).not.toHaveBeenCalledWith("hidden-child")

		const stationaryBounds = getMinimapSceneStationaryBounds(scene, ["frame"])
		expect(stationaryBounds).toBeNull()
		translateMinimapSceneItems(scene, ["frame"], 10, 5, stationaryBounds)
		expect(scene.itemsById.get("frame")?.bounds).toEqual({
			x: 10,
			y: 5,
			width: 200,
			height: 120,
		})
		expect(scene.itemsById.get("group")?.bounds).toEqual({
			x: 30,
			y: 25,
			width: 80,
			height: 60,
		})
		expect(scene.itemsById.get("image")?.bounds).toEqual({
			x: 40,
			y: 35,
			width: 40,
			height: 20,
		})
		expect(scene.contentBounds).toEqual({ x: 10, y: 5, width: 200, height: 120 })

		boundsById = {
			...boundsById,
			group: { x: 40, y: 35, width: 90, height: 70 },
			image: { x: 55, y: 50, width: 45, height: 25 },
		}
		getElementBounds.mockClear()
		refreshMinimapSceneItems(canvas, scene, ["group"])

		expect(getElementBounds).toHaveBeenCalledTimes(2)
		expect(getElementBounds).toHaveBeenCalledWith("group")
		expect(getElementBounds).toHaveBeenCalledWith("image")
		expect(getElementBounds).not.toHaveBeenCalledWith("frame")
		expect(scene.itemsById.get("group")?.bounds).toEqual(boundsById.group)
		expect(scene.itemsById.get("image")?.bounds).toEqual(boundsById.image)
	})
})
