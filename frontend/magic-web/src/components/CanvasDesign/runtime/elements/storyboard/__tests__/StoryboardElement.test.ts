import Konva from "konva"
import { afterEach, describe, expect, it, vi } from "vitest"
import type { Canvas } from "../../../core/Canvas"
import { exportCanvasDocument } from "../../../document/exportDocument"
import { ElementTypeEnum, type CanvasConnection } from "../../../document/types"
import { TransformBehavior } from "../../../interaction/transform/TransformManager"
import { ElementFactory } from "../../core/ElementFactory"
import { STORYBOARD_CONFIG } from "../StoryboardElement.config"
import {
	resolveStoryboardElementLayout,
	STORYBOARD_LAYOUT_DESIGN,
} from "../StoryboardElement.layout"
import { StoryboardElement } from "../StoryboardElement"

function createCanvasMock(
	modelIcon?: string,
	outputImageIds: string[] = [],
	connections: CanvasConnection[] = [],
): Canvas {
	const outputImageIdSet = new Set(outputImageIds)
	return {
		deviceInfo: {
			formFactor: "desktop",
			input: { touch: false, coarsePointer: false, hover: true },
			viewport: { width: 1280, height: 800 },
		},
		elementManager: {
			canDragElement: vi.fn(() => true),
			canListenElement: vi.fn(() => true),
			getElementData: vi.fn((elementId: string) =>
				outputImageIdSet.has(elementId)
					? { id: elementId, type: ElementTypeEnum.Image }
					: undefined,
			),
		},
		storyboardInteractionManager: {
			bindControl: vi.fn(() => vi.fn()),
			getModelIcon: vi.fn(() => modelIcon),
		},
		connectionManager: {
			hasConnection: vi.fn((sourceElementId: string, targetElementId: string) =>
				connections.some(
					(connection) =>
						connection.sourceElementId === sourceElementId &&
						connection.targetElementId === targetElementId,
				),
			),
			getDownstreamConnections: vi.fn((elementId: string) =>
				connections.filter((connection) => connection.sourceElementId === elementId),
			),
		},
	} as unknown as Canvas
}

describe("StoryboardElement", () => {
	afterEach(() => {
		vi.restoreAllMocks()
		vi.unstubAllGlobals()
	})

	it("creates a stable default storyboard DSL element", () => {
		const element = StoryboardElement.createElementData({
			id: "storyboard-1",
			x: 10,
			y: 20,
		})

		expect(element).toMatchObject({
			id: "storyboard-1",
			type: ElementTypeEnum.Storyboard,
			x: 10,
			y: 20,
			width: STORYBOARD_CONFIG.DEFAULT_WIDTH,
			height: STORYBOARD_CONFIG.DEFAULT_HEIGHT,
			interactionConfig: { aspectRatioLocked: false },
		})
		expect(element.contents[0]?.shots).toHaveLength(1)
		expect(element.contents[0]?.shots?.[0]).toMatchObject({
			description: "",
		})
		expect(element.contents[0]?.shots?.[0]).not.toHaveProperty("durationSeconds")
		expect(element.contents[0]?.shots?.[0]).not.toHaveProperty("status")
		expect(element.contents[0]?.shots?.[0]?.id).toEqual(expect.any(String))
	})

	it("is created by the element factory and rejects resize transforms", () => {
		const canvas = createCanvasMock()
		const data = StoryboardElement.createElementData({ id: "storyboard-1", x: 0, y: 0 })
		const element = ElementFactory.create(data, canvas)

		expect(element).toBeInstanceOf(StoryboardElement)
		expect(element?.getTransformBehavior()).toBe(TransformBehavior.APPLY_TO_SIZE)
		expect(element?.supportsSizeEditing()).toBe(false)
		expect(element?.getTransformConstraints()).toEqual({
			enabledAnchors: [],
			minWidth: STORYBOARD_CONFIG.MIN_WIDTH,
			minHeight: STORYBOARD_CONFIG.MIN_HEIGHT,
		})
		expect(
			element?.applyTransform(
				{
					x: 24,
					y: 36,
					width: STORYBOARD_CONFIG.DEFAULT_WIDTH,
					height: STORYBOARD_CONFIG.DEFAULT_HEIGHT,
					scaleX: 0.5,
					scaleY: 0.5,
				},
				{
					isRealtime: true,
					isScaling: true,
					shouldKeepRatio: false,
				},
			),
		).toEqual({
			x: 24,
			y: 36,
			width: STORYBOARD_CONFIG.DEFAULT_WIDTH,
			height: STORYBOARD_CONFIG.DEFAULT_HEIGHT,
			scaleX: 1,
			scaleY: 1,
		})

		const extraShotData = {
			...data,
			contents: data.contents.map((content) => ({
				...content,
				shots: content.shots?.map((shot) => ({ ...shot, status: "generated" })),
			})),
		} as unknown as typeof data
		const elementWithExtraShotData = ElementFactory.create(extraShotData, canvas)
		expect(
			(elementWithExtraShotData?.getData() as typeof data).contents[0]?.shots?.[0],
		).not.toHaveProperty("status")
	})

	it("renders generation settings and shot state as a lightweight Konva card", () => {
		vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
			clearRect: vi.fn(),
			fillRect: vi.fn(),
			getImageData: vi.fn(() => ({ data: new Uint8ClampedArray([0, 0, 0, 0]) })),
			measureText: vi.fn((text: string) => ({ width: text.length * 8 })),
		} as unknown as CanvasRenderingContext2D)
		const element = new StoryboardElement(
			StoryboardElement.createElementData({
				id: "storyboard-1",
				x: 0,
				y: 0,
				generationConfig: {
					model_id: "gpt-image-2",
					size: "1080x1920",
					resolution: "1K",
					image_generation_config: { aspect_ratio: "9:16" },
				},
				shots: [
					{
						id: "shot-1",
						description: "雨后的森林小路，人物穿橙色冲锋衣进入画面。",
						outputImageElementId: "image-output",
					},
				],
			}),
			createCanvasMock(
				undefined,
				["image-output"],
				[
					{
						id: "storyboard-output",
						sourceElementId: "storyboard-1",
						targetElementId: "image-output",
					},
				],
			),
		)

		const group = element.render()
		const layout = resolveStoryboardElementLayout(
			STORYBOARD_CONFIG.DEFAULT_WIDTH,
			STORYBOARD_CONFIG.DEFAULT_HEIGHT,
			1,
		)
		const texts = group.find("Text").map((node) => (node as Konva.Text).text())
		const generateAll = group.findOne(".storyboard-generate-all") as Konva.Rect
		const shotBackground = group.findOne(".storyboard-shot-shot-1") as Konva.Rect
		const generateAgainIcon = group.findOne(".storyboard-generate-again-icon") as Konva.Path
		const modelHit = group.find(".storyboard-control-hit").find((node) => {
			const metadata = node.getAttr("storyboardControlMetadata") as
				{ action?: { type?: string } } | undefined
			return metadata?.action?.type === "select-model"
		})
		const modelMetadata = modelHit?.getAttr("storyboardControlMetadata") as
			{ selectPresentation?: Record<string, number> } | undefined

		expect(group.size()).toEqual({
			width: STORYBOARD_CONFIG.DEFAULT_WIDTH,
			height: STORYBOARD_CONFIG.DEFAULT_HEIGHT,
		})
		expect(group.clipFunc()).toEqual(expect.any(Function))
		expect(group.findOne(".hit-area")).toBeTruthy()
		expect(group.findOne(".storyboard-shot-shot-1")).toBeTruthy()
		expect(shotBackground.strokeWidth()).toBe(Math.max(1, layout.scale))
		expect(group.findOne(".storyboard-duration-background")).toBeUndefined()
		expect(group.find(".storyboard-control-hit").length).toBeGreaterThanOrEqual(8)
		expect(group.find(".storyboard-control-hit").every((node) => node.listening())).toBe(true)
		expect(texts).toEqual(
			expect.arrayContaining([
				"GPT Image 2",
				"9:16",
				"1K",
				"分镜 1",
				"已生成",
				"再次生成",
				"雨后的森林小路，人物穿橙色冲锋衣进入画面。",
			]),
		)
		expect(generateAgainIcon).toBeTruthy()
		expect(generateAgainIcon.data()).toBe(
			"M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8 M3 3v5h5",
		)
		expect(group.find(".storyboard-control-suffix")).toHaveLength(3)
		expect(group.findOne(".storyboard-points-cost")).toBeUndefined()
		expect(modelMetadata?.selectPresentation).toEqual({
			fontSize: 28,
			horizontalPadding: 20,
			suffixGap: 16,
			suffixIconSize: 20,
			modelIconUrl: undefined,
			modelIconSize: 32,
			modelIconGap: 16,
		})
		expect(generateAll.listening()).toBe(false)
		expect(generateAll.name().split(" ")).toEqual(
			expect.arrayContaining(["storyboard-control-background"]),
		)
		expect(generateAll.fill()).toBe(STORYBOARD_CONFIG.ACCENT)
	})

	it("shows a generated shot only while its output connection exists", () => {
		vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
			clearRect: vi.fn(),
			fillRect: vi.fn(),
			getImageData: vi.fn(() => ({ data: new Uint8ClampedArray([0, 0, 0, 0]) })),
			measureText: vi.fn((text: string) => ({ width: text.length * 8 })),
		} as unknown as CanvasRenderingContext2D)
		const connection: CanvasConnection = {
			id: "storyboard-output",
			sourceElementId: "storyboard-1",
			targetElementId: "image-output",
		}
		const data = StoryboardElement.createElementData({
			id: "storyboard-1",
			x: 0,
			y: 0,
			shots: [
				{
					id: "shot-1",
					description: "森林小路",
					outputImageElementId: "image-output",
				},
			],
		})
		const connections = [connection]
		const canvas = createCanvasMock(undefined, ["image-output"], connections)

		const connectedGroup = new StoryboardElement(data, canvas).render()
		expect(connectedGroup.find("Text").map((node) => (node as Konva.Text).text())).toEqual(
			expect.arrayContaining(["已生成", "再次生成"]),
		)

		connections.length = 0
		const disconnectedGroup = new StoryboardElement(data, canvas).render()
		expect(disconnectedGroup.find("Text").map((node) => (node as Konva.Text).text())).toEqual(
			expect.arrayContaining(["未生成", "生成"]),
		)
	})

	it("renders the selected model icon from runtime metadata without persisting it", () => {
		vi.stubGlobal(
			"Image",
			class {
				crossOrigin = ""
				onload: (() => void) | null = null

				set src(_value: string) {
					this.onload?.()
				}
			},
		)
		const iconUrl = "https://example.com/model-icon.png"
		const data = StoryboardElement.createElementData({
			id: "storyboard-model-icon",
			x: 0,
			y: 0,
			generationConfig: { model_id: "gpt-image-2" },
		})
		const element = new StoryboardElement(data, createCanvasMock(iconUrl))
		const group = element.render()
		const icon = group.findOne(".storyboard-model-icon") as Konva.Image
		const modelIconRect = resolveStoryboardElementLayout(
			STORYBOARD_CONFIG.DEFAULT_WIDTH,
			STORYBOARD_CONFIG.DEFAULT_HEIGHT,
			1,
		).parameterRows.model.modelIconRect

		expect(icon).toBeTruthy()
		expect(icon.width()).toBe(32)
		expect(icon.height()).toBe(32)
		expect(icon.x()).toBeCloseTo(modelIconRect?.x ?? 0)
		expect(icon.y()).toBeCloseTo(modelIconRect?.y ?? 0)
		expect(data.contents[0]?.generationConfig).toEqual({ model_id: "gpt-image-2" })
		expect(JSON.stringify(data)).not.toContain(iconUrl)
	})

	it("expands coarse-pointer hit targets without changing the permanent visuals", () => {
		vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
			clearRect: vi.fn(),
			fillRect: vi.fn(),
			getImageData: vi.fn(() => ({ data: new Uint8ClampedArray([0, 0, 0, 0]) })),
			measureText: vi.fn((text: string) => ({ width: text.length * 8 })),
		} as unknown as CanvasRenderingContext2D)
		const canvas = createCanvasMock()
		canvas.deviceInfo.input = { touch: true, coarsePointer: true, hover: false }
		const element = new StoryboardElement(
			StoryboardElement.createElementData({
				id: "storyboard-touch-hit",
				x: 0,
				y: 0,
				shots: [
					{
						id: "shot-1",
						description: "",
					},
				],
			}),
			canvas,
		)
		const group = element.render()
		element.onMounted()
		const background = group.findOne(".storyboard-background") as Konva.Rect
		const parameterLabel = group.findOne(".storyboard-control-label") as Konva.Text
		const closeIcons = group.find(".storyboard-control-icon")
		const deleteHit = group.find(".storyboard-control-hit").find((node) => {
			const metadata = node.getAttr("storyboardControlMetadata") as
				{ action?: { type?: string } } | undefined
			return metadata?.action?.type === "delete-shot"
		}) as Konva.Rect | undefined
		const deleteBackground = group.findOne(".storyboard-control-background")

		expect(deleteHit?.width()).toBe(
			Math.max(
				STORYBOARD_LAYOUT_DESIGN.shotDeleteSize,
				STORYBOARD_CONFIG.COARSE_POINTER_MIN_HIT_SIZE,
			),
		)
		expect(deleteHit?.height()).toBe(
			Math.max(
				STORYBOARD_LAYOUT_DESIGN.shotDeleteSize,
				STORYBOARD_CONFIG.COARSE_POINTER_MIN_HIT_SIZE,
			),
		)
		expect(deleteBackground?.listening()).toBe(false)
		expect(background.cornerRadius()).toBe(0)
		expect(parameterLabel.x()).toBeGreaterThan(30)
		expect(closeIcons).toHaveLength(2)
	})

	it("keeps transformer bounds aligned through viewport transforms", () => {
		vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
			clearRect: vi.fn(),
			fillRect: vi.fn(),
			getImageData: vi.fn(() => ({ data: new Uint8ClampedArray([0, 0, 0, 0]) })),
			measureText: vi.fn((text: string) => ({ width: text.length * 8 })),
		} as unknown as CanvasRenderingContext2D)
		const element = new StoryboardElement(
			StoryboardElement.createElementData({
				id: "storyboard-transformer-bounds",
				x: 320,
				y: 240,
			}),
			createCanvasMock(),
		)
		const root = new Konva.Group()
		const viewport = new Konva.Group({ x: 150, y: 90, scaleX: 0.5, scaleY: 0.5 })
		const group = element.render()
		root.add(viewport)
		viewport.add(group)

		expect(group.getClientRect({ relativeTo: root, skipStroke: true })).toEqual({
			x: 310,
			y: 210,
			width: STORYBOARD_CONFIG.DEFAULT_WIDTH * 0.5,
			height: STORYBOARD_CONFIG.DEFAULT_HEIGHT * 0.5,
		})
	})

	it("keeps internal logical geometry unchanged when the canvas zooms the Konva tree", () => {
		const element = new StoryboardElement(
			StoryboardElement.createElementData({
				id: "storyboard-zoom-layout",
				x: 0,
				y: 0,
			}),
			createCanvasMock(),
		)
		const group = element.render()
		const background = group.findOne(".storyboard-background") as Konva.Rect
		const shotList = group.findOne(".storyboard-shot-list-region") as Konva.Group
		const before = {
			background: {
				width: background.width(),
				height: background.height(),
			},
			shotList: {
				x: shotList.x(),
				y: shotList.y(),
				width: shotList.width(),
				height: shotList.height(),
			},
		}
		const viewport = new Konva.Group({ scaleX: 0.35, scaleY: 0.35 })
		viewport.add(group)

		expect(background.width()).toBe(before.background.width)
		expect(background.height()).toBe(before.background.height)
		expect(shotList.x()).toBe(before.shotList.x)
		expect(shotList.y()).toBe(before.shotList.y)
		expect(shotList.width()).toBe(before.shotList.width)
		expect(shotList.height()).toBe(before.shotList.height)
		expect(group.getAbsoluteScale().x).toBeCloseTo(0.35)
		expect(group.getAbsoluteScale().y).toBeCloseTo(0.35)
	})

	it("exports a deep-cloned formal storyboard DSL", () => {
		const source = StoryboardElement.createElementData({
			id: "storyboard-1",
			x: 10,
			y: 20,
			generationConfig: {
				model_id: "gpt-image-2",
				image_generation_config: { aspect_ratio: "9:16" },
			},
			shots: [
				{
					id: "shot-1",
					description: "森林小路",
				},
			],
		})

		const [exported] = exportCanvasDocument([source]).elements ?? []

		expect(exported).toEqual(source)
		expect(exported).not.toBe(source)
		if (exported?.type !== ElementTypeEnum.Storyboard) {
			throw new Error("Expected storyboard element")
		}
		expect(exported.contents[0]?.shots).not.toBe(source.contents[0]?.shots)
		expect(exported.contents[0]?.generationConfig).not.toBe(
			source.contents[0]?.generationConfig,
		)

		const legacySource = {
			...source,
			contents: source.contents.map((content) => ({
				...content,
				shots: content.shots?.map((shot) => ({ ...shot, status: "generated" })),
			})),
		} as unknown as typeof source
		const [legacyExported] = exportCanvasDocument([legacySource]).elements ?? []
		if (legacyExported?.type !== ElementTypeEnum.Storyboard) {
			throw new Error("Expected legacy storyboard element")
		}
		expect(legacyExported.contents[0]?.shots?.[0]).not.toHaveProperty("status")
	})

	it("auto-grows the node and renders every shot without an overflow summary", () => {
		vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
			clearRect: vi.fn(),
			fillRect: vi.fn(),
			getImageData: vi.fn(() => ({ data: new Uint8ClampedArray([0, 0, 0, 0]) })),
			measureText: vi.fn((text: string) => ({ width: text.length * 8 })),
		} as unknown as CanvasRenderingContext2D)
		const shots = Array.from({ length: 20 }, (_, index) => ({
			id: `shot-${index + 1}`,
			description: `镜头 ${index + 1}`,
		}))
		const element = new StoryboardElement(
			StoryboardElement.createElementData({
				id: "storyboard-overflow",
				x: 0,
				y: 0,
				shots,
			}),
			createCanvasMock(),
		)

		const group = element.render()
		const renderedCards = shots.filter((shot) =>
			Boolean(group.findOne(`.storyboard-shot-${shot.id}`)),
		)

		expect(renderedCards.length).toBe(shots.length)
		expect(group.findOne(".storyboard-overflow-count")).toBeUndefined()
		expect(group.height()).toBeGreaterThan(STORYBOARD_CONFIG.DEFAULT_HEIGHT)
	})
})
