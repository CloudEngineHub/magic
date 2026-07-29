import Konva from "konva"
import { beforeAll, describe, expect, it, vi } from "vitest"
import type { Canvas } from "../../../core/Canvas"
import { ConnectionDragRenderer } from "../ConnectionDragRenderer"
import {
	CONNECTION_DRAG_INVALID_PREVIEW_STYLE,
	CONNECTION_DRAG_INVALID_TARGET_STYLE,
	CONNECTION_DRAG_PREVIEW_STYLE,
	CONNECTION_DRAG_VALID_PREVIEW_STYLE,
	CONNECTION_DRAG_VALID_TARGET_STYLE,
	CONNECTION_STROKE_SCALE_STYLE,
	resolveConnectionScreenStrokeWidth,
} from "../connectionStyle"

beforeAll(() => {
	Object.defineProperty(HTMLCanvasElement.prototype, "getContext", {
		configurable: true,
		value: vi.fn(() => ({
			clearRect: vi.fn(),
			fillRect: vi.fn(),
			fillText: vi.fn(),
			getImageData: vi.fn(() => ({ data: [0, 0, 0, 0] })),
			measureText: vi.fn(() => ({ width: 0 })),
		})),
	})
})

function createCanvasStub(scale = 1) {
	const controlsLayer = new Konva.Group()
	const requestLayerDraw = vi.fn()
	const canvas = {
		controlsLayer,
		stage: {
			scaleX: () => scale,
		},
		runtimeScheduler: {
			requestLayerDraw,
		},
	} as unknown as Canvas

	return { canvas, controlsLayer, requestLayerDraw }
}

function getPreviewPath(controlsLayer: Konva.Container): Konva.Path {
	const path = controlsLayer.findOne(`.${ConnectionDragRenderer.PREVIEW_PATH_NAME}`)
	if (!(path instanceof Konva.Path)) {
		throw new Error("Expected connection drag preview path")
	}
	return path
}

function getTargetFeedbackRect(controlsLayer: Konva.Container): Konva.Rect {
	const rect = controlsLayer.findOne(`.${ConnectionDragRenderer.TARGET_FEEDBACK_RECT_NAME}`)
	if (!(rect instanceof Konva.Rect)) {
		throw new Error("Expected connection drag target feedback rect")
	}
	return rect
}

describe("ConnectionDragRenderer", () => {
	it("renders a non-listening free preview path", () => {
		const { canvas, controlsLayer, requestLayerDraw } = createCanvasStub()
		const renderer = new ConnectionDragRenderer({ canvas })

		renderer.render({
			originRect: { x: 10, y: 20, width: 100, height: 40 },
			originSide: "right",
			pointerCanvasPoint: { x: 180, y: 120 },
		})

		const group = controlsLayer.findOne(`.${ConnectionDragRenderer.PREVIEW_GROUP_NAME}`)
		expect(group).toBeInstanceOf(Konva.Group)
		expect(group?.listening()).toBe(false)
		const path = getPreviewPath(controlsLayer)
		expect(path.listening()).toBe(false)
		expect(path.data()).toBe("M 110 40 C 170 40 120 120 180 120")
		expect(path.stroke()).toBe(CONNECTION_DRAG_PREVIEW_STYLE.stroke)
		expect(path.opacity()).toBe(CONNECTION_DRAG_PREVIEW_STYLE.opacity)
		expect(path.strokeWidth()).toBe(CONNECTION_DRAG_PREVIEW_STYLE.strokeWidth)
		expect(path.shadowBlur()).toBe(CONNECTION_DRAG_PREVIEW_STYLE.shadowBlur)
		expect(path.dash()).toEqual([...CONNECTION_DRAG_PREVIEW_STYLE.dash])
		expect(requestLayerDraw).toHaveBeenCalledWith("controls", {
			source: "ConnectionDragRenderer",
			reason: "render",
			priority: "input",
		})
	})

	it("keeps preview stroke metrics stable when viewport scales", () => {
		const { canvas, controlsLayer } = createCanvasStub(2)
		const renderer = new ConnectionDragRenderer({ canvas })

		renderer.render({
			originRect: { x: 10, y: 20, width: 100, height: 40 },
			originSide: "left",
			pointerCanvasPoint: { x: -100, y: 80 },
		})

		const path = getPreviewPath(controlsLayer)
		expect(path.strokeWidth() * 2).toBeCloseTo(CONNECTION_DRAG_PREVIEW_STYLE.strokeWidth)
		expect(path.shadowBlur() * 2).toBeCloseTo(CONNECTION_DRAG_PREVIEW_STYLE.shadowBlur)
		expect(path.dash().map((value) => value * 2)).toEqual([
			...CONNECTION_DRAG_PREVIEW_STYLE.dash,
		])
	})

	it("thins preview stroke after the viewport shrinks past the threshold", () => {
		const scale = CONNECTION_STROKE_SCALE_STYLE.shrinkStartScale / 2
		const { canvas, controlsLayer } = createCanvasStub(scale)
		const renderer = new ConnectionDragRenderer({ canvas })

		renderer.render({
			originRect: { x: 10, y: 20, width: 100, height: 40 },
			originSide: "left",
			pointerCanvasPoint: { x: -100, y: 80 },
		})

		const path = getPreviewPath(controlsLayer)
		const screenStrokeWidth = path.strokeWidth() * scale
		expect(screenStrokeWidth).toBeCloseTo(
			resolveConnectionScreenStrokeWidth(CONNECTION_DRAG_PREVIEW_STYLE.strokeWidth, scale),
		)
		expect(screenStrokeWidth).toBeLessThan(CONNECTION_DRAG_PREVIEW_STYLE.strokeWidth)
		expect(path.dash().map((value) => value * scale)).toEqual([
			...CONNECTION_DRAG_PREVIEW_STYLE.dash,
		])
	})

	it("uses final connection geometry when a valid target is supplied", () => {
		const { canvas, controlsLayer } = createCanvasStub()
		const renderer = new ConnectionDragRenderer({ canvas })

		renderer.render({
			originRect: { x: 10, y: 20, width: 100, height: 40 },
			originSide: "right",
			pointerCanvasPoint: { x: 220, y: 40 },
			state: "valid",
			sourceRect: { x: 10, y: 20, width: 100, height: 40 },
			targetRect: { x: 220, y: 20, width: 100, height: 40 },
			targetFeedbackRect: { x: 220, y: 20, width: 100, height: 40 },
			targetElementId: "target",
		})

		const path = getPreviewPath(controlsLayer)
		expect(path.data()).toBe("M 110 40 C 170 40 160 40 220 40")
		expect(path.stroke()).toBe(CONNECTION_DRAG_VALID_PREVIEW_STYLE.stroke)
		expect(path.opacity()).toBe(CONNECTION_DRAG_VALID_PREVIEW_STYLE.opacity)
		expect(path.getAttr("connectionDragPreviewData")).toEqual({
			targetElementId: "target",
			originSide: "right",
			state: "valid",
			validationReason: null,
			sourceSide: "right",
			targetSide: "left",
		})

		const targetRect = getTargetFeedbackRect(controlsLayer)
		expect(targetRect.x()).toBe(220)
		expect(targetRect.y()).toBe(20)
		expect(targetRect.width()).toBe(100)
		expect(targetRect.height()).toBe(40)
		expect(targetRect.stroke()).toBe(CONNECTION_DRAG_VALID_TARGET_STYLE.stroke)
		expect(targetRect.strokeWidth()).toBe(CONNECTION_DRAG_VALID_TARGET_STYLE.strokeWidth)
		expect(targetRect.dash()).toEqual([...CONNECTION_DRAG_VALID_TARGET_STYLE.dash])
		expect(targetRect.cornerRadius()).toBe(CONNECTION_DRAG_VALID_TARGET_STYLE.cornerRadius)
		expect(targetRect.getAttr("connectionDragTargetFeedbackData")).toEqual({
			targetElementId: "target",
			state: "valid",
			validationReason: null,
		})
	})

	it("renders invalid targets without snapping the preview line", () => {
		const { canvas, controlsLayer } = createCanvasStub()
		const renderer = new ConnectionDragRenderer({ canvas })

		renderer.render({
			originRect: { x: 10, y: 20, width: 100, height: 40 },
			originSide: "right",
			pointerCanvasPoint: { x: 40, y: 50 },
			state: "invalid",
			sourceRect: { x: 10, y: 20, width: 100, height: 40 },
			targetRect: { x: 10, y: 20, width: 100, height: 40 },
			targetFeedbackRect: { x: 10, y: 20, width: 100, height: 40 },
			targetElementId: "origin",
			validationReason: "self",
		})

		const path = getPreviewPath(controlsLayer)
		expect(path.data()).toBe("M 110 40 C 170 40 -20 50 40 50")
		expect(path.stroke()).toBe(CONNECTION_DRAG_INVALID_PREVIEW_STYLE.stroke)
		expect(path.opacity()).toBe(CONNECTION_DRAG_INVALID_PREVIEW_STYLE.opacity)
		expect(path.dash()).toEqual([...CONNECTION_DRAG_INVALID_PREVIEW_STYLE.dash])
		expect(path.getAttr("connectionDragPreviewData")).toEqual({
			targetElementId: "origin",
			originSide: "right",
			state: "invalid",
			validationReason: "self",
			sourceSide: null,
			targetSide: null,
		})

		const targetRect = getTargetFeedbackRect(controlsLayer)
		expect(targetRect.stroke()).toBe(CONNECTION_DRAG_INVALID_TARGET_STYLE.stroke)
		expect(targetRect.dash()).toEqual([...CONNECTION_DRAG_INVALID_TARGET_STYLE.dash])
		expect(targetRect.cornerRadius()).toBe(CONNECTION_DRAG_INVALID_TARGET_STYLE.cornerRadius)
		expect(targetRect.getAttr("connectionDragTargetFeedbackData")).toEqual({
			targetElementId: "origin",
			state: "invalid",
			validationReason: "self",
		})
	})
})
