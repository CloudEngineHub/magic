import Konva from "konva"
import { describe, expect, it } from "vitest"
import {
	resolveExpandedResultElementGeometry,
	resolveExtendedImageElementGeometry,
} from "../extend/extendElementGeometry"
import {
	getLocalRectRelativeTo,
	getNodeTransformRelativeTo,
} from "../../shared/geometry/nodeTransform"

describe("extend element geometry", () => {
	it("writes a transformed Frame child back in Frame-local coordinates", () => {
		const root = new Konva.Group()
		const contentLayer = new Konva.Group({
			x: 80,
			y: 45,
			scaleX: 1.35,
			scaleY: 0.9,
			rotation: 6,
		})
		const frame = new Konva.Group({
			x: 240,
			y: 130,
			scaleX: 1.4,
			scaleY: 0.8,
			rotation: 18,
		})
		const source = new Konva.Group({
			x: 35,
			y: 24,
			scaleX: 0.9,
			scaleY: 1.2,
			rotation: -7,
		})
		root.add(contentLayer)
		contentLayer.add(frame)
		frame.add(source)

		const proxyLocalOrigin = { x: 22, y: 14 }
		const imageOriginInContent = getNodeTransformRelativeTo(source, contentLayer).point(
			proxyLocalOrigin,
		)
		const imageRect = { x: 22, y: 14, width: 96, height: 64 }
		const result = resolveExtendedImageElementGeometry({
			contentLayer,
			parentNode: frame,
			imageOriginInContent,
			imageRect,
		})
		const expectedOriginInFrame = source.getTransform().point(proxyLocalOrigin)

		expect(result.x).toBeCloseTo(expectedOriginInFrame.x)
		expect(result.y).toBeCloseTo(expectedOriginInFrame.y)
		expect(result.width).toBe(imageRect.width)
		expect(result.height).toBe(imageRect.height)
	})

	it("uses the true image origin instead of a rotated AABB corner", () => {
		const root = new Konva.Group()
		const contentLayer = new Konva.Group()
		const source = new Konva.Group({ x: 160, y: 90, rotation: 32 })
		root.add(contentLayer)
		contentLayer.add(source)

		const imageRect = { x: 18, y: 12, width: 120, height: 70 }
		const imageOriginInContent = getNodeTransformRelativeTo(source, contentLayer).point({
			x: imageRect.x,
			y: imageRect.y,
		})
		const rotatedBounds = getLocalRectRelativeTo(source, contentLayer, imageRect)
		const result = resolveExtendedImageElementGeometry({
			contentLayer,
			imageOriginInContent,
			imageRect,
		})

		expect(rotatedBounds.x).not.toBeCloseTo(imageOriginInContent.x)
		expect(result.x).toBeCloseTo(imageOriginInContent.x)
		expect(result.y).toBeCloseTo(imageOriginInContent.y)
	})

	it("places a top-level expanded result beside transformed bounds without changing its ratio", () => {
		const frameBounds = { x: 125.5, y: 48.25, width: 420, height: 260 }
		const resultSize = { width: 320, height: 180 }

		expect(resolveExpandedResultElementGeometry(frameBounds, resultSize)).toEqual({
			x: 545.5,
			y: 48.25,
			width: 320,
			height: 180,
		})
	})
})
