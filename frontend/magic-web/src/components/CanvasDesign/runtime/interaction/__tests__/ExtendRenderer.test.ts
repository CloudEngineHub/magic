import Konva from "konva"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { ExtendRenderer } from "../extend/ExtendRenderer"
import { getExtendResizeCursor } from "../extend/extendAnchorCursor"

describe("ExtendRenderer", () => {
	beforeEach(() => {
		vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
			clearRect: vi.fn(),
			fillRect: vi.fn(),
			getImageData: vi.fn(() => ({ data: new Uint8ClampedArray([0, 0, 0, 0]) })),
		} as unknown as CanvasRenderingContext2D)
	})

	afterEach(() => {
		vi.restoreAllMocks()
	})

	it("treats children of the extend overlay as extend overlay nodes", () => {
		const overlayGroup = new Konva.Group({ name: "extend-overlay" })
		const hitArea = new Konva.Rect({ name: "extend-frame-hit-area" })
		overlayGroup.add(hitArea)

		expect(ExtendRenderer.isExtendOverlayNode(hitArea)).toBe(true)
	})

	it("maps extend anchors to directional resize cursors", () => {
		expect(getExtendResizeCursor("top-center _anchor")).toBe("n-resize")
		expect(getExtendResizeCursor("middle-right _anchor")).toBe("e-resize")
		expect(getExtendResizeCursor("bottom-center _anchor")).toBe("s-resize")
		expect(getExtendResizeCursor("middle-left _anchor")).toBe("w-resize")
		expect(getExtendResizeCursor("top-left _anchor")).toBe("nw-resize")
		expect(getExtendResizeCursor("top-right _anchor")).toBe("ne-resize")
		expect(getExtendResizeCursor("bottom-right _anchor")).toBe("se-resize")
		expect(getExtendResizeCursor("bottom-left _anchor")).toBe("sw-resize")
	})
})
