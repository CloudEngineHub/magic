import Konva from "konva"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { ExtendRenderer } from "../ExtendRenderer"

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
})
