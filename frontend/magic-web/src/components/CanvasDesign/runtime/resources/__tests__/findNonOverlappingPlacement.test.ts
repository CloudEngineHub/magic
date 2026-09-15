import { describe, expect, it } from "vitest"

import { findGeneratedMediaGridPositions } from "../../shared/placement/findNonOverlappingPlacement"
import type { Rect } from "../../shared/ids"

const viewportRect: Rect = {
	x: 0,
	y: 0,
	width: 1000,
	height: 1000,
}

const sourceRect: Rect = {
	x: 100,
	y: 100,
	width: 100,
	height: 100,
}

const baseOptions = {
	elementWidth: 100,
	elementHeight: 100,
	viewportRect,
	sourceRect,
	spacing: 20,
	maxColumns: 6,
	maxSearchRings: 2,
}

describe("findGeneratedMediaGridPositions", () => {
	it("fills source-right slots from left to right for repeated single generations", () => {
		// 来源图右侧已有两个输出时，下一张应继续补同一行的下一个空位。
		const positions = findGeneratedMediaGridPositions(
			[
				sourceRect,
				{ x: 220, y: 100, width: 100, height: 100 },
				{ x: 340, y: 100, width: 100, height: 100 },
			],
			{
				...baseOptions,
				count: 1,
			},
		)

		expect(positions).toEqual([{ x: 460, y: 100 }])
	})

	it("keeps the first three generated items on the same top row", () => {
		// 6 列网格里，前三张先排在同一行，不应提前换行。
		const positions = findGeneratedMediaGridPositions(
			[
				sourceRect,
				{ x: 220, y: 100, width: 100, height: 100 },
				{ x: 340, y: 100, width: 100, height: 100 },
			],
			{
				...baseOptions,
				count: 3,
			},
		)

		expect(positions).toEqual([
			{ x: 460, y: 100 },
			{ x: 580, y: 100 },
			{ x: 700, y: 100 },
		])
	})

	it("keeps the same spacing when existing group items have different sizes", () => {
		// 同组历史输出尺寸不同，也要维持固定间距和顶部对齐。
		const positions = findGeneratedMediaGridPositions(
			[
				{ x: 100, y: 100, width: 100, height: 120 },
				{ x: 220, y: 100, width: 260, height: 180 },
			],
			{
				...baseOptions,
				count: 1,
				elementWidth: 300,
				elementHeight: 150,
				existingGridRects: [
					{ x: 100, y: 100, width: 100, height: 120 },
					{ x: 220, y: 100, width: 260, height: 180 },
				],
			},
		)

		expect(positions).toEqual([{ x: 500, y: 100 }])
	})

	it("keeps filling the source-right row even when the next slot is outside the current viewport", () => {
		// 来源图附近的对比布局优先级高于视口约束，后续会由 focusOnElements 带回视野。
		const positions = findGeneratedMediaGridPositions(
			[
				sourceRect,
				{ x: 220, y: 100, width: 100, height: 100 },
				{ x: 340, y: 100, width: 100, height: 100 },
			],
			{
				...baseOptions,
				viewportRect: {
					x: 0,
					y: 0,
					width: 430,
					height: 1000,
				},
				count: 1,
			},
		)

		expect(positions).toEqual([{ x: 460, y: 100 }])
	})

	it("wraps to the next row only after all six columns are occupied", () => {
		// 6 列都被占住后，才进入下一行。
		const positions = findGeneratedMediaGridPositions(
			[
				sourceRect,
				{ x: 220, y: 100, width: 100, height: 100 },
				{ x: 340, y: 100, width: 100, height: 100 },
				{ x: 460, y: 100, width: 100, height: 100 },
				{ x: 580, y: 100, width: 100, height: 100 },
				{ x: 700, y: 100, width: 100, height: 100 },
				{ x: 820, y: 100, width: 100, height: 100 },
			],
			{
				...baseOptions,
				count: 1,
			},
		)

		expect(positions).toEqual([{ x: 220, y: 220 }])
	})

	it("continues an existing no-source grid instead of following the shifted viewport anchor", () => {
		// 没有来源图但有同组历史输出时，要续接已有网格，而不是随视口中心重开一组。
		const existingGridRects = [
			{ x: 100, y: 100, width: 100, height: 100 },
			{ x: 220, y: 100, width: 100, height: 100 },
		]
		const positions = findGeneratedMediaGridPositions(existingGridRects, {
			count: 1,
			elementWidth: 100,
			elementHeight: 100,
			viewportRect,
			existingGridRects,
			anchor: { x: 800, y: 800 },
			spacing: 20,
			maxColumns: 6,
			maxSearchRings: 2,
		})

		expect(positions).toEqual([{ x: 340, y: 100 }])
	})
})
