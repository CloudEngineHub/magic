import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import Konva from "konva"
import { complianceNameLabelIconResolver } from "../complianceNameLabelIconResolver"

function resolve(options: {
	status?: "UNVERIFIED" | "PROCESSING" | "PASS" | "FAILED"
	isAssetLibrary?: boolean
}) {
	return complianceNameLabelIconResolver({
		elementId: "image-1",
		element: { canvas: { isSeedanceComplianceEnabled: () => true } } as never,
		data: {} as never,
		selected: false,
		hovered: false,
		isAssetLibrary: options.isAssetLibrary ?? false,
		complianceStatus: options.status,
	})
}

describe("complianceNameLabelIconResolver", () => {
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

	it("prioritizes compliance over the asset-library icon", () => {
		expect(resolve({ status: "PROCESSING", isAssetLibrary: true })).toMatchObject({
			key: "compliance-processing",
		})
		expect(resolve({ status: "PASS", isAssetLibrary: true })).toMatchObject({
			key: "compliance-pass",
		})
	})

	it("falls back to the asset-library icon for unchecked or failed assets", () => {
		expect(resolve({ status: "UNVERIFIED", isAssetLibrary: true })).toMatchObject({
			key: "asset-library",
		})
		expect(resolve({ status: "FAILED", isAssetLibrary: true })).toMatchObject({
			key: "asset-library",
		})
	})

	it("does not show an icon for unbound media without compliance", () => {
		expect(resolve({ status: "UNVERIFIED" })).toBeNull()
		expect(resolve({ status: "FAILED" })).toBeNull()
	})

	it("creates non-hit-tested Konva icon nodes", () => {
		const descriptor = resolve({ status: "PASS" })
		const node = descriptor?.create({} as never)
		expect(node).toBeInstanceOf(Konva.Group)
		expect(node?.listening()).toBe(false)
		expect(descriptor).toMatchObject({ width: 16, height: 16 })
		const path = node?.findOne("Path") as Konva.Path | null
		expect(path?.x()).toBe(0)
		expect(path?.scaleX()).toBeCloseTo(2 / 3)
	})
})
