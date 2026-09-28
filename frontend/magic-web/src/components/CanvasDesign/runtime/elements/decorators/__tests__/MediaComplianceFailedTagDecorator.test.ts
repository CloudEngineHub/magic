import Konva from "konva"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { MediaComplianceFailedTagDecorator } from "../MediaComplianceFailedTagDecorator"
import { ElementTypeEnum } from "../../../document/types"

function createHarness(content?: {
	contentId?: string
	complianceStatus?: string
	assetId?: string
}) {
	const container = document.createElement("div")
	document.body.appendChild(container)
	const stage = new Konva.Stage({ container, width: 600, height: 400 })
	stage.scale({ x: 2, y: 2 })
	const layer = new Konva.Layer()
	stage.add(layer)
	const group = new Konva.Group({ width: 240, height: 160, scaleX: 0.5, scaleY: 0.5 })
	layer.add(group)
	const canvas = {
		permissionManager: { can: vi.fn(() => true) },
		getEffectiveContent: vi.fn(() => content ?? { contentId: "content-1" }),
		assetCompliancePollingManager: { getState: vi.fn(() => undefined) },
		assetResourceManager: { getCachedResource: vi.fn(() => undefined) },
		eventEmitter: {
			on: vi.fn(() => () => undefined),
			off: vi.fn(),
		},
		runtimeScheduler: {
			registerViewportScaleLayout: vi.fn(() => () => undefined),
		},
		t: vi.fn((_key: string, options: { defaultValue: string }) => options.defaultValue),
	}

	return { canvas, group, stage }
}

describe("MediaComplianceFailedTagDecorator", () => {
	beforeEach(() => {
		vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
			clearRect: vi.fn(),
			fillRect: vi.fn(),
			getImageData: vi.fn(() => ({ data: new Uint8ClampedArray([0, 0, 0, 0]) })),
			measureText: vi.fn((text: string) => ({ width: text.length * 8 })),
			scale: vi.fn(),
		} as unknown as CanvasRenderingContext2D)
	})

	afterEach(() => {
		vi.restoreAllMocks()
		document.body.innerHTML = ""
	})

	it.each(["image", "video"] as const)(
		"renders a centered bottom compliance-failed tag for failed %s",
		(type) => {
			const { canvas, group, stage } = createHarness({
				contentId: "content-1",
				complianceStatus: "FAILED",
			})
			const decorator = new MediaComplianceFailedTagDecorator(group, {
				canvas: canvas as never,
				width: 240,
				height: 160,
				data: {
					id: `${type}-1`,
					type: type === "image" ? ElementTypeEnum.Image : ElementTypeEnum.Video,
					width: 240,
					height: 160,
					contents: [{ contentId: "content-1", complianceStatus: "FAILED" }],
					activeContentId: "content-1",
				} as never,
			})

			decorator.create()
			const tag = group.findOne<Konva.Group>(".decorator-media-compliance-failed-tag")

			expect(tag).toBeTruthy()
			expect(tag?.findOne(".decorator-media-compliance-failed-title")?.text()).toBe(
				"合规校验未通过",
			)
			expect(tag?.findOne(".decorator-media-compliance-failed-hint")?.text()).toBe(
				type === "video" ? "请更换视频后重新认证" : "请更换图片后重新认证",
			)
			expect(tag?.visible()).toBe(true)
			const tagFootprintX = (tag?.width() ?? 0) / (stage.scaleX() * group.scaleX())
			const tagFootprintY = (tag?.height() ?? 0) / (stage.scaleY() * group.scaleY())
			expect(tag?.x()).toBeCloseTo((240 - tagFootprintX) / 2)
			expect(tag?.y()).toBeCloseTo(160 - tagFootprintY - 8)

			decorator.destroy()
			stage.destroy()
		},
	)

	it("does not render when compliance has not failed", () => {
		const { canvas, group, stage } = createHarness({
			contentId: "content-1",
			complianceStatus: "PROCESSING",
		})
		const decorator = new MediaComplianceFailedTagDecorator(group, {
			canvas: canvas as never,
			width: 240,
			height: 160,
			data: {
				id: "image-1",
				type: ElementTypeEnum.Image,
				width: 240,
				height: 160,
				contents: [{ contentId: "content-1", complianceStatus: "PROCESSING" }],
				activeContentId: "content-1",
			} as never,
		})

		decorator.create()
		expect(group.findOne(".decorator-media-compliance-failed-tag")).toBeUndefined()

		decorator.destroy()
		stage.destroy()
	})
})
