import { describe, expect, it, vi } from "vitest"
import { drawMinimap } from "../minimapRenderer"

describe("minimap renderer", () => {
	it("draws containers first, solid elements second, and the viewport last", () => {
		const operations: Array<{ type: string; alpha: number; color?: string }> = []
		const context = {
			globalAlpha: 1,
			fillStyle: "",
			strokeStyle: "",
			lineWidth: 1,
			clearRect: () => operations.push({ type: "clear", alpha: 1 }),
			save: () => undefined,
			restore: () => undefined,
			fillRect() {
				operations.push({
					type: "fill",
					alpha: this.globalAlpha,
					color: this.fillStyle,
				})
			},
			strokeRect() {
				operations.push({
					type: "stroke",
					alpha: this.globalAlpha,
					color: this.strokeStyle,
				})
			},
		} as unknown as CanvasRenderingContext2D

		drawMinimap({
			context,
			panelSize: { width: 200, height: 150 },
			items: [
				{ id: "image", kind: "element", bounds: { x: 20, y: 20, width: 20, height: 20 } },
				{ id: "frame", kind: "container", bounds: { x: 0, y: 0, width: 100, height: 80 } },
				{
					id: "selected-image",
					kind: "element",
					bounds: { x: 50, y: 20, width: 20, height: 20 },
				},
				{
					id: "selected-frame",
					kind: "container",
					bounds: { x: 0, y: 0, width: 50, height: 40 },
				},
			],
			selectedElementIds: new Set(["selected-image", "selected-frame"]),
			contentBounds: { x: 0, y: 0, width: 100, height: 80 },
			viewportRect: { x: -20, y: -10, width: 160, height: 100 },
			theme: {
				elementFill: "#737373",
				containerFill: "#0a0a0a",
				selectedFill: "#3b82f6",
				viewportStroke: "#0a0a0a",
			},
		})

		expect(operations).toEqual([
			{ type: "clear", alpha: 1 },
			{ type: "fill", alpha: 0.14, color: "#0a0a0a" },
			{ type: "fill", alpha: 0.14, color: "#3b82f6" },
			{ type: "fill", alpha: 1, color: "#737373" },
			{ type: "fill", alpha: 1, color: "#3b82f6" },
			{ type: "stroke", alpha: 0.55, color: "#0a0a0a" },
		])
	})

	it("uses the cached content bounds instead of rescanning item bounds", () => {
		const fillRect = vi.fn()
		const context = {
			globalAlpha: 1,
			fillStyle: "",
			strokeStyle: "",
			lineWidth: 1,
			clearRect: vi.fn(),
			save: vi.fn(),
			restore: vi.fn(),
			fillRect,
			strokeRect: vi.fn(),
		} as unknown as CanvasRenderingContext2D

		drawMinimap({
			context,
			panelSize: { width: 100, height: 100 },
			items: [
				{ id: "image", kind: "element", bounds: { x: 0, y: 0, width: 10, height: 10 } },
			],
			selectedElementIds: new Set(),
			contentBounds: { x: 0, y: 0, width: 100, height: 100 },
			viewportRect: null,
			theme: {
				elementFill: "#737373",
				containerFill: "#0a0a0a",
				selectedFill: "#3b82f6",
				viewportStroke: "#0a0a0a",
			},
		})

		expect(fillRect).toHaveBeenCalledWith(12, 12, 7.6, 7.6)
	})
})
