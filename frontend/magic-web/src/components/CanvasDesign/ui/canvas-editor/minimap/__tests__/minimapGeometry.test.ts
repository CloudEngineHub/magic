import { describe, expect, it } from "vitest"
import {
	createMinimapTransform,
	isPointInsideMinimapRect,
	mergeMinimapRects,
	projectMinimapRect,
	unprojectMinimapPoint,
} from "../minimapGeometry"

describe("minimap geometry", () => {
	it("merges element and viewport bounds across negative coordinates", () => {
		expect(
			mergeMinimapRects([
				{ x: -100, y: 20, width: 40, height: 50 },
				{ x: 80, y: -30, width: 120, height: 90 },
			]),
		).toEqual({ x: -100, y: -30, width: 300, height: 100 })
	})

	it("centers world bounds while preserving their aspect ratio", () => {
		const transform = createMinimapTransform(
			{ x: 0, y: 0, width: 200, height: 100 },
			{ width: 200, height: 150 },
			10,
		)

		expect(transform).toEqual({ scale: 0.9, offsetX: 10, offsetY: 30 })
		expect(projectMinimapRect({ x: 0, y: 0, width: 200, height: 100 }, transform!)).toEqual({
			x: 10,
			y: 30,
			width: 180,
			height: 90,
		})
	})

	it("keeps tiny elements visible without moving their center", () => {
		const projected = projectMinimapRect(
			{ x: 10, y: 20, width: 1, height: 1 },
			{ scale: 0.1, offsetX: 0, offsetY: 0 },
			2,
		)

		expect(projected.width).toBe(2)
		expect(projected.height).toBe(2)
		expect(projected.x).toBeCloseTo(0.05)
		expect(projected.y).toBeCloseTo(1.05)
		expect(projected.x + projected.width / 2).toBeCloseTo(1.05)
		expect(projected.y + projected.height / 2).toBeCloseTo(2.05)
	})

	it("maps pointer coordinates back to canvas coordinates and detects the viewport", () => {
		const transform = { scale: 0.5, offsetX: 20, offsetY: 30 }

		expect(unprojectMinimapPoint({ x: 70, y: 80 }, transform)).toEqual({ x: 100, y: 100 })
		expect(
			isPointInsideMinimapRect({ x: 70, y: 80 }, { x: 60, y: 70, width: 20, height: 20 }),
		).toBe(true)
		expect(
			isPointInsideMinimapRect({ x: 81, y: 80 }, { x: 60, y: 70, width: 20, height: 20 }),
		).toBe(false)
	})
})
