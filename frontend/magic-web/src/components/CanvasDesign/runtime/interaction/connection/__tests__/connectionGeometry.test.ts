import { describe, expect, it } from "vitest"
import {
	doesConnectionGeometryIntersectRect,
	getConnectionGeometryPointAt,
	resolveConnectionGeometry,
} from "../connectionGeometry"

describe("resolveConnectionGeometry", () => {
	it("uses source right to target left when target is on the right", () => {
		const geometry = resolveConnectionGeometry(
			{ x: 0, y: 10, width: 100, height: 80 },
			{ x: 300, y: 20, width: 120, height: 60 },
		)

		expect(geometry).toEqual(
			expect.objectContaining({
				sourceSide: "right",
				targetSide: "left",
				start: { x: 100, y: 50 },
				end: { x: 300, y: 50 },
				points: [100, 50, 200, 50, 200, 50, 300, 50],
				pathData: "M 100 50 C 200 50 200 50 300 50",
			}),
		)
	})

	it("keeps source right to target left when target is visually on the left", () => {
		const geometry = resolveConnectionGeometry(
			{ x: 300, y: 20, width: 120, height: 60 },
			{ x: 0, y: 10, width: 100, height: 80 },
		)

		expect(geometry).toEqual(
			expect.objectContaining({
				sourceSide: "right",
				targetSide: "left",
				start: { x: 420, y: 50 },
				end: { x: 0, y: 50 },
				points: [420, 50, 630, 50, -210, 50, 0, 50],
				pathData: "M 420 50 C 630 50 -210 50 0 50",
			}),
		)
	})

	it("uses data direction for same-center x connections", () => {
		const geometry = resolveConnectionGeometry(
			{ x: 0, y: 0, width: 100, height: 100 },
			{ x: 0, y: 200, width: 100, height: 100 },
		)

		expect(geometry?.sourceSide).toBe("right")
		expect(geometry?.targetSide).toBe("left")
		expect(geometry?.pathData).toBe("M 100 50 C 160 50 -60 250 0 250")
	})

	it("uses half of long horizontal distance as the shared control offset", () => {
		const geometry = resolveConnectionGeometry(
			{ x: 0, y: 0, width: 100, height: 100 },
			{ x: 1100, y: 200, width: 100, height: 100 },
		)

		expect(geometry?.points).toEqual([100, 50, 600, 50, 600, 250, 1100, 250])
		expect(geometry?.pathData).toBe("M 100 50 C 600 50 600 250 1100 250")
	})

	it("resolves the visual midpoint on the cubic curve", () => {
		const geometry = resolveConnectionGeometry(
			{ x: 0, y: 0, width: 100, height: 40 },
			{ x: 220, y: 80, width: 100, height: 40 },
		)

		expect(geometry).not.toBeNull()
		if (!geometry) return
		expect(getConnectionGeometryPointAt(geometry, 0.5)).toEqual({ x: 160, y: 60 })
	})

	it("returns null for invalid bounds", () => {
		expect(
			resolveConnectionGeometry(
				{ x: 0, y: 0, width: 0, height: 100 },
				{ x: 100, y: 0, width: 100, height: 100 },
			),
		).toBeNull()
	})

	it("detects when a connection curve intersects a selection box", () => {
		const geometry = resolveConnectionGeometry(
			{ x: 0, y: 0, width: 100, height: 40 },
			{ x: 220, y: 0, width: 100, height: 40 },
		)

		expect(geometry).not.toBeNull()
		if (!geometry) return
		expect(
			doesConnectionGeometryIntersectRect(geometry, {
				x: 145,
				y: 10,
				width: 40,
				height: 20,
			}),
		).toBe(true)
		expect(
			doesConnectionGeometryIntersectRect(geometry, {
				x: 145,
				y: 120,
				width: 40,
				height: 20,
			}),
		).toBe(false)
	})
})
