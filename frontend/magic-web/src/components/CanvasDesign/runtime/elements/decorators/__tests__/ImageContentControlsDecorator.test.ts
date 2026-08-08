import Konva from "konva"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { ImageElement } from "../../../document/types"
import { COLORS } from "../../image/ImageElement.config"
import { ImageContentControlsDecorator } from "../ImageContentControlsDecorator"

function createEventEmitterMock() {
	type TestCanvasEvent = { data: { elementId: string | null } }
	type TestCanvasEventHandler = (event?: TestCanvasEvent) => void
	const handlers = new Map<string, TestCanvasEventHandler[]>()
	return {
		handlers,
		eventEmitter: {
			on: vi.fn((eventType: string, handler: TestCanvasEventHandler) => {
				const current = handlers.get(eventType) ?? []
				current.push(handler)
				handlers.set(eventType, current)
			}),
			off: vi.fn((eventType: string, handler: TestCanvasEventHandler) => {
				handlers.set(
					eventType,
					(handlers.get(eventType) ?? []).filter((item) => item !== handler),
				)
			}),
		},
	}
}

function createHarness(
	data: ImageElement,
	readonly = false,
	attachGroup = true,
	options: {
		width?: number
		height?: number
		bottomRightReservedScreenWidth?: number
	} = {},
) {
	const width = options.width ?? 240
	const height = options.height ?? 160
	const container = document.createElement("div")
	document.body.appendChild(container)
	const stage = new Konva.Stage({ container, width: 600, height: 400 })
	stage.scale({ x: 2, y: 2 })
	const layer = new Konva.Layer()
	stage.add(layer)
	const group = new Konva.Group({ width, height, scaleX: 0.5, scaleY: 0.5 })
	if (attachGroup) layer.add(group)

	const { handlers, eventEmitter } = createEventEmitterMock()
	let hoveredElementId: string | null = null
	let connectionDragging = false
	let selectionCount = 1
	let selectionAffordanceEnabled = true
	const cursorManager = {
		setTemporary: vi.fn(),
		restoreToolCursor: vi.fn(),
	}
	const canvas = {
		readonly,
		eventEmitter,
		cursorManager,
		hoverManager: {
			getHoveredElementId: vi.fn(() => hoveredElementId),
		},
		permissionManager: {
			canUseSelectionToolAffordance: vi.fn(() => selectionAffordanceEnabled),
		},
		connectionDragManager: {
			isDraggingConnection: vi.fn(() => connectionDragging),
		},
		selectionManager: {
			getSelectionCount: vi.fn(() => selectionCount),
		},
		t: (_key: string, options?: { defaultValue?: string }) =>
			options?.defaultValue ?? "设为主内容",
	}
	const onPrevious = vi.fn()
	const onNext = vi.fn()
	const onSetMain = vi.fn()
	const decorator = new ImageContentControlsDecorator(group, {
		elementId: data.id,
		canvas: canvas as never,
		width,
		height,
		data,
		bottomRightReservedScreenWidth: options.bottomRightReservedScreenWidth,
		onPrevious,
		onNext,
		onSetMain,
	})

	return {
		canvas,
		cursorManager,
		decorator,
		group,
		layer,
		handlers,
		onNext,
		onPrevious,
		onSetMain,
		setHoveredElementId: (elementId: string | null) => {
			hoveredElementId = elementId
		},
		setConnectionDragging: (dragging: boolean) => {
			connectionDragging = dragging
		},
		setSelectionCount: (count: number) => {
			selectionCount = count
		},
		setSelectionAffordanceEnabled: (enabled: boolean) => {
			selectionAffordanceEnabled = enabled
		},
		stage,
		width,
		height,
	}
}

function contentImage(activeContentId = "v2"): ImageElement {
	return {
		id: "image-1",
		type: "image",
		activeContentId,
		mainContentId: "v1",
		width: 240,
		height: 160,
		contents: [
			{ contentId: "v1", src: "./images/v1.png", status: "completed" },
			{ contentId: "v2", src: "./images/v2.png", status: "completed" },
			{ contentId: "v3", status: "processing" },
		],
	}
}

function click(node: Konva.Node): void {
	node.fire("click", { evt: { stopPropagation: vi.fn() } })
}

describe("ImageContentControlsDecorator", () => {
	beforeEach(() => {
		vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
			clearRect: vi.fn(),
			fillRect: vi.fn(),
			getImageData: vi.fn(() => ({ data: new Uint8ClampedArray([0, 0, 0, 0]) })),
			scale: vi.fn(),
			measureText: vi.fn(() => ({ width: 10 })),
		} as unknown as CanvasRenderingContext2D)
	})

	afterEach(() => {
		vi.restoreAllMocks()
		document.body.innerHTML = ""
	})

	it("shows the current index, fixed screen scale, navigation, and set-main action", () => {
		const harness = createHarness(contentImage())
		harness.decorator.create()
		harness.setHoveredElementId("image-1")
		harness.handlers.get("element:hover")?.[0]?.({ data: { elementId: "image-1" } })

		const root = harness.group.findOne<Konva.Group>(".image-content-controls")
		expect(root).toBeTruthy()
		expect(root?.scale()).toEqual({ x: 1, y: 1 })
		expect(root?.getChildren()).toHaveLength(2)
		const panel = root?.getChildren()[0] as Konva.Group
		const panelBackground = panel.getChildren()[0] as Konva.Rect
		expect(panelBackground.height()).toBe(24)
		expect(panelBackground.fill()).toBe(COLORS.BUTTON_BG)
		expect((panel.getChildren()[1] as Konva.Group).width()).toBe(24)
		expect((panel.getChildren()[2] as Konva.Text).text()).toBe("2 / 3")
		expect((panel.getChildren()[2] as Konva.Text).fontSize()).toBe(12)

		click(panel.getChildren()[1])
		click(panel.getChildren()[3])
		click(root?.getChildren()[1] as Konva.Group)
		expect(harness.onPrevious).toHaveBeenCalledTimes(1)
		expect(harness.onNext).toHaveBeenCalledTimes(1)
		expect(harness.onSetMain).toHaveBeenCalledTimes(1)

		harness.decorator.destroy()
		harness.stage.destroy()
	})

	it("shows a fixed-size main-content tag at the shared top-left offset", () => {
		const harness = createHarness(contentImage("v1"))
		harness.decorator.create()
		const tag = harness.group.findOne<Konva.Group>(".image-content-main-tag")
		const background = tag?.findOne<Konva.Rect>(".image-content-main-tag-background")
		const label = tag?.findOne<Konva.Text>(".image-content-main-tag-label")

		expect(tag).toBeTruthy()
		expect(tag?.listening()).toBe(false)
		expect(tag?.height()).toBe(24)
		expect(background?.fill()).toBe(COLORS.BUTTON_BG)
		expect(label?.text()).toBe("主内容")
		expect(label?.fill()).toBe("#FFFFFF")
		expect(label?.fontSize()).toBe(12)

		const cases = [
			{ stageScale: 0.5, expectedOffset: 4 },
			{ stageScale: 1.5, expectedOffset: 6 },
			{ stageScale: 3, expectedOffset: 8 },
		]
		cases.forEach(({ stageScale, expectedOffset }) => {
			harness.stage.scale({ x: stageScale, y: stageScale })
			harness.handlers.get("viewport:scale")?.[0]?.()
			const absoluteScale = harness.group.getAbsoluteScale()
			expect((tag?.x() ?? 0) * absoluteScale.x).toBeCloseTo(expectedOffset)
			expect((tag?.y() ?? 0) * absoluteScale.y).toBeCloseTo(expectedOffset)
			expect((tag?.height() ?? 0) * tag!.scaleY() * absoluteScale.y).toBeCloseTo(24)
		})

		harness.decorator.destroy()
		harness.stage.destroy()
	})

	it("updates main-content tag visibility when active Content changes", () => {
		const harness = createHarness(contentImage("v2"))
		harness.decorator.create()
		expect(harness.group.findOne(".image-content-main-tag")).toBeUndefined()

		harness.decorator.updateConfig({ data: contentImage("v1") })
		expect(harness.group.findOne(".image-content-main-tag")).toBeTruthy()

		harness.decorator.updateConfig({ data: contentImage("v2") })
		expect(harness.group.findOne(".image-content-main-tag")).toBeUndefined()

		harness.decorator.destroy()
		harness.stage.destroy()
	})

	it("recomputes its position after a rerendered image group is mounted", () => {
		const harness = createHarness(contentImage(), false, false)
		harness.decorator.create()
		const root = harness.group.findOne<Konva.Group>(".image-content-controls")
		expect(root?.getStage()).toBeNull()

		harness.layer.add(harness.group)
		harness.decorator.refreshLayout()
		expect(root?.getStage()).toBe(harness.stage)
		expect(root?.x()).toBeGreaterThan(0)
		expect(root?.y()).toBeGreaterThan(0)

		harness.decorator.destroy()
		harness.stage.destroy()
	})

	it("matches the corner-action 4-8px screen offset across zoom levels", () => {
		const harness = createHarness(contentImage())
		harness.decorator.create()
		const root = harness.group.findOne<Konva.Group>(".image-content-controls")
		expect(root).toBeTruthy()

		const cases = [
			{ stageScale: 0.5, expectedOffset: 4 },
			{ stageScale: 1.5, expectedOffset: 6 },
			{ stageScale: 3, expectedOffset: 8 },
		]
		cases.forEach(({ stageScale, expectedOffset }) => {
			harness.stage.scale({ x: stageScale, y: stageScale })
			harness.handlers.get("viewport:scale")?.[0]?.()
			const absoluteScale = harness.group.getAbsoluteScale()
			const screenOffsetX = (root?.x() ?? 0) * absoluteScale.x
			const screenOffsetY = (160 - (root?.y() ?? 0) - 24 / absoluteScale.y) * absoluteScale.y
			expect(screenOffsetX).toBeCloseTo(expectedOffset)
			expect(screenOffsetY).toBeCloseTo(expectedOffset)
		})

		harness.decorator.destroy()
		harness.stage.destroy()
	})

	it("hides the complete Content controls below the minimum screen size", () => {
		const harness = createHarness(contentImage())
		harness.decorator.create()
		harness.setHoveredElementId("image-1")
		harness.handlers.get("element:hover")?.[0]?.({ data: { elementId: "image-1" } })
		const root = harness.group.findOne<Konva.Group>(".image-content-controls")
		expect(root?.visible()).toBe(true)

		harness.stage.scale({ x: 1.5, y: 1.5 })
		harness.handlers.get("viewport:scale")?.[0]?.()
		expect(root?.visible()).toBe(false)

		harness.stage.scale({ x: 2, y: 2 })
		harness.handlers.get("viewport:scale")?.[0]?.()
		expect(root?.visible()).toBe(true)

		harness.decorator.destroy()
		harness.stage.destroy()
	})

	it("hides the main-content tag together with controls below the minimum screen size", () => {
		const harness = createHarness(contentImage("v1"))
		harness.decorator.create()
		const tag = harness.group.findOne<Konva.Group>(".image-content-main-tag")
		expect(tag?.visible()).toBe(true)

		harness.stage.scale({ x: 1.5, y: 1.5 })
		harness.handlers.get("viewport:scale")?.[0]?.()
		expect(tag?.visible()).toBe(false)

		harness.stage.scale({ x: 2, y: 2 })
		harness.handlers.get("viewport:scale")?.[0]?.()
		expect(tag?.visible()).toBe(true)

		harness.decorator.destroy()
		harness.stage.destroy()
	})

	it("keeps navigation visible while hiding set-main when reserved space does not fit", () => {
		const harness = createHarness(contentImage(), false, true, {
			width: 180,
			height: 180,
			bottomRightReservedScreenWidth: 24,
		})
		harness.decorator.create()
		harness.setHoveredElementId("image-1")
		harness.handlers.get("element:hover")?.[0]?.({ data: { elementId: "image-1" } })
		const root = harness.group.findOne<Konva.Group>(".image-content-controls")
		const mainButton = root?.findOne<Konva.Group>(".image-content-button-set-main")

		expect(root?.visible()).toBe(true)
		expect(root?.findOne(".image-content-navigation")?.visible()).toBe(true)
		expect(mainButton?.visible()).toBe(false)

		harness.decorator.destroy()
		harness.stage.destroy()
	})

	it("shows set-main when navigation, reserved action, gaps, and offsets all fit", () => {
		const harness = createHarness(contentImage(), false, true, {
			width: 240,
			height: 180,
			bottomRightReservedScreenWidth: 24,
		})
		harness.decorator.create()
		harness.setHoveredElementId("image-1")
		harness.handlers.get("element:hover")?.[0]?.({ data: { elementId: "image-1" } })
		const root = harness.group.findOne<Konva.Group>(".image-content-controls")
		const mainButton = root?.findOne<Konva.Group>(".image-content-button-set-main")

		expect(root?.visible()).toBe(true)
		expect(mainButton?.visible()).toBe(true)

		harness.decorator.destroy()
		harness.stage.destroy()
	})

	it("does not hide navigation when switching from main to a non-main Content", () => {
		const harness = createHarness(contentImage("v1"), false, true, {
			width: 180,
			height: 180,
			bottomRightReservedScreenWidth: 24,
		})
		harness.decorator.create()
		harness.setHoveredElementId("image-1")
		harness.handlers.get("element:hover")?.[0]?.({ data: { elementId: "image-1" } })
		expect(harness.group.findOne<Konva.Group>(".image-content-controls")?.visible()).toBe(true)

		harness.decorator.updateConfig({ data: contentImage("v2") })
		const nextRoot = harness.group.findOne<Konva.Group>(".image-content-controls")
		expect(nextRoot?.visible()).toBe(true)
		expect(nextRoot?.findOne<Konva.Group>(".image-content-button-set-main")?.visible()).toBe(
			false,
		)

		harness.decorator.destroy()
		harness.stage.destroy()
	})

	it("shows version navigation and set-main only while the image element is hovered", () => {
		const harness = createHarness(contentImage(), false, true, {
			width: 240,
			height: 180,
			bottomRightReservedScreenWidth: 24,
		})
		harness.decorator.create()
		const root = harness.group.findOne<Konva.Group>(".image-content-controls")
		const mainButton = root?.findOne<Konva.Group>(".image-content-button-set-main")

		expect(root?.visible()).toBe(false)
		expect(mainButton?.visible()).toBe(false)

		harness.setHoveredElementId("image-1")
		harness.handlers.get("element:hover")?.[0]?.({ data: { elementId: "image-1" } })
		expect(mainButton?.visible()).toBe(true)

		harness.setHoveredElementId("another-image")
		harness.handlers.get("element:hover")?.[0]?.({ data: { elementId: "another-image" } })
		expect(mainButton?.visible()).toBe(false)
		expect(root?.visible()).toBe(false)

		harness.decorator.destroy()
		harness.stage.destroy()
	})

	it("hides Content controls when the pointer leaves the image for a connection handle", () => {
		const harness = createHarness(contentImage("v1"))
		harness.decorator.create()
		harness.setHoveredElementId("image-1")
		harness.handlers.get("element:hover")?.[0]?.({ data: { elementId: "image-1" } })
		const root = harness.group.findOne<Konva.Group>(".image-content-controls")
		const mainTag = harness.group.findOne<Konva.Group>(".image-content-main-tag")
		expect(root?.visible()).toBe(true)

		// 连线 Handle 仍携带当前 elementId，但位于图片 Group 之外。
		harness.group.fire("mouseleave")
		expect(harness.canvas.hoverManager.getHoveredElementId()).toBe("image-1")
		expect(root?.visible()).toBe(false)
		expect(mainTag?.visible()).toBe(true)

		harness.group.fire("mouseenter")
		expect(root?.visible()).toBe(true)

		harness.decorator.destroy()
		harness.stage.destroy()
	})

	it("matches corner actions during connection drag, multi-selection, and tool gating", () => {
		const harness = createHarness(contentImage())
		harness.decorator.create()
		harness.setHoveredElementId("image-1")
		harness.handlers.get("element:hover")?.[0]?.({ data: { elementId: "image-1" } })
		const root = harness.group.findOne<Konva.Group>(".image-content-controls")
		expect(root?.visible()).toBe(true)

		harness.setConnectionDragging(true)
		harness.handlers.get("element:hover")?.[0]?.({ data: { elementId: "image-1" } })
		expect(root?.visible()).toBe(false)

		harness.setConnectionDragging(false)
		harness.setSelectionCount(2)
		harness.handlers.get("element:select")?.[0]?.()
		expect(root?.visible()).toBe(false)

		harness.setSelectionCount(1)
		harness.setSelectionAffordanceEnabled(false)
		harness.handlers.get("element:select")?.[0]?.()
		expect(root?.visible()).toBe(false)

		harness.setSelectionAffordanceEnabled(true)
		harness.handlers.get("element:select")?.[0]?.()
		expect(root?.visible()).toBe(true)

		harness.decorator.destroy()
		harness.stage.destroy()
	})

	it("disables boundary navigation and hides set-main for processing Contents", () => {
		const firstHarness = createHarness(contentImage("v1"))
		firstHarness.decorator.create()
		const firstRoot = firstHarness.group.findOne<Konva.Group>(".image-content-controls")
		const firstPanel = firstRoot?.getChildren()[0] as Konva.Group
		const firstPreviousButton = firstPanel.getChildren()[1] as Konva.Group
		const firstPreviousVisual = firstPreviousButton.findOne<Konva.Group>(
			".image-content-button-previous-visual",
		)
		const firstPreviousBackground = firstPreviousVisual?.getChildren()[0] as Konva.Rect
		firstPreviousButton.fire("mouseenter")
		expect(firstPreviousBackground.fill()).not.toBe("rgba(0, 0, 0, 0.70)")
		expect(firstHarness.cursorManager.setTemporary).toHaveBeenCalledWith("not-allowed")
		click(firstPreviousButton)
		expect(firstHarness.onPrevious).not.toHaveBeenCalled()
		firstHarness.decorator.destroy()
		firstHarness.stage.destroy()

		const processingHarness = createHarness(contentImage("v3"))
		processingHarness.decorator.create()
		const processingRoot =
			processingHarness.group.findOne<Konva.Group>(".image-content-controls")
		expect(processingRoot?.getChildren()).toHaveLength(1)
		processingHarness.decorator.destroy()
		processingHarness.stage.destroy()
	})

	it("shows hover and pressed feedback on enabled navigation", () => {
		const harness = createHarness(contentImage())
		harness.decorator.create()
		const root = harness.group.findOne<Konva.Group>(".image-content-controls")
		const panel = root?.getChildren()[0] as Konva.Group
		const nextButton = panel.getChildren()[3] as Konva.Group
		const visual = nextButton.findOne<Konva.Group>(".image-content-button-next-visual")
		const background = visual?.getChildren()[0] as Konva.Rect
		const chevron = visual?.getChildren()[1] as Konva.Shape
		const idleChevronStroke = chevron.stroke()
		expect(background.fill()).toBe("rgba(0,0,0,0)")

		nextButton.fire("mouseenter")
		expect(background.fill()).toBe("rgba(0,0,0,0)")
		expect(chevron.stroke()).not.toBe(idleChevronStroke)
		expect(harness.cursorManager.setTemporary).toHaveBeenCalledWith("pointer")

		nextButton.fire("mousedown", { evt: { stopPropagation: vi.fn() } })
		expect(visual?.scaleX()).toBeLessThan(1)
		expect(background.fill()).toBe("rgba(0,0,0,0)")

		nextButton.fire("mouseup", { evt: { stopPropagation: vi.fn() } })
		expect(visual?.scaleX()).toBe(1)
		nextButton.fire("mouseleave")
		expect(harness.cursorManager.restoreToolCursor).toHaveBeenCalled()

		harness.decorator.destroy()
		harness.stage.destroy()
	})

	it("remains visible but blocks interaction in readonly mode", () => {
		const harness = createHarness(contentImage(), true)
		harness.decorator.create()
		harness.setHoveredElementId("image-1")
		harness.handlers.get("element:hover")?.[0]?.({ data: { elementId: "image-1" } })
		const root = harness.group.findOne<Konva.Group>(".image-content-controls")
		const panel = root?.getChildren()[0] as Konva.Group

		expect(root?.opacity()).toBe(0.55)
		click(panel.getChildren()[3])
		expect(harness.onNext).not.toHaveBeenCalled()

		harness.canvas.readonly = false
		harness.handlers.get("canvas:readonly")?.[0]?.()
		expect(root?.opacity()).toBe(1)

		harness.decorator.destroy()
		harness.stage.destroy()
	})
})
