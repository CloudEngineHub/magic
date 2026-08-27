import { describe, expect, it, vi } from "vitest"
import { ElementToolTypeEnum } from "../../../public/props"
import { CanvasElementToolCommandBus } from "../commands/ElementToolCommandBus"

function createCanvas() {
	const image = {
		id: "image-1",
		type: "image",
		activeContentId: "content-a",
		mainContentId: "content-a",
		contents: [{ contentId: "content-a", src: "a.png" }],
	}
	const operations = {
		switchActiveContent: vi.fn(),
		setMainContent: vi.fn(),
		deleteActiveContent: vi.fn(),
	}
	const textElement = {
		id: "text-1",
		type: "text",
		activeContentId: "text-content",
		mainContentId: "text-content",
		contents: [{ contentId: "text-content", content: [] }],
	}
	const textFormattingManager = {
		getToolbarState: vi.fn(() => ({ selectedTextElement: textElement })),
		setFillColor: vi.fn(),
		setFontFamily: vi.fn(),
		setFontSize: vi.fn(),
		setTextAlign: vi.fn(),
		setBold: vi.fn(),
		setItalic: vi.fn(),
		setFontWeight: vi.fn(),
		setUnderline: vi.fn(),
		setStrikethrough: vi.fn(),
		setLineHeight: vi.fn(),
		setLetterSpacing: vi.fn(),
		setListType: vi.fn(),
	}
	return {
		image,
		textElement,
		elementManager: {
			getElementData: vi.fn(() => image),
			getElementInstance: vi.fn(() => operations),
			update: vi.fn(),
		},
		generationRuntimeManager: { isCurrent: vi.fn(() => true) },
		userActionRegistry: { canExecute: vi.fn(() => true), execute: vi.fn() },
		textFormattingManager,
		eventEmitter: { emit: vi.fn() },
		cropManager: { enterCropMode: vi.fn() },
		extendManager: { enterExtendMode: vi.fn() },
		eraserManager: { enterEraserMode: vi.fn() },
	}
}

describe("CanvasElementToolCommandBus", () => {
	it("executes a command against its captured Content target", () => {
		const canvas = createCanvas()
		const bus = new CanvasElementToolCommandBus(canvas as never)
		const execute = vi.fn()
		bus.register({ elementId: "image-1", toolId: ElementToolTypeEnum.ContentCrop }, execute, {
			available: true,
		})

		bus.execute({
			toolId: ElementToolTypeEnum.ContentCrop,
			elementId: "image-1",
			contentId: "content-a",
		})
		expect(execute).toHaveBeenCalledWith({
			toolId: ElementToolTypeEnum.ContentCrop,
			elementId: "image-1",
			contentId: "content-a",
		})
	})

	it("drops commands for deleted Content and stale generation attempts", () => {
		const canvas = createCanvas()
		const bus = new CanvasElementToolCommandBus(canvas as never)
		const execute = vi.fn()
		bus.register({ elementId: "image-1", toolId: ElementToolTypeEnum.ContentCrop }, execute)

		canvas.image.contents = []
		bus.execute({
			toolId: ElementToolTypeEnum.ContentCrop,
			elementId: "image-1",
			contentId: "content-a",
		})
		expect(execute).not.toHaveBeenCalled()

		canvas.image.contents = [{ contentId: "content-a", src: "a.png" }]
		canvas.generationRuntimeManager.isCurrent = vi.fn(() => false)
		bus.execute({
			toolId: ElementToolTypeEnum.GenerationGenerateAgain,
			elementId: "image-1",
			contentId: "content-a",
			generationId: "stale-generation",
		})
		expect(execute).not.toHaveBeenCalled()
	})

	it("does not delete a different active Content from a stale version command", () => {
		const canvas = createCanvas()
		canvas.image.contents = [
			{ contentId: "content-a", src: "a.png" },
			{ contentId: "content-b", src: "b.png" },
		]
		canvas.image.activeContentId = "content-b"
		const operations = canvas.elementManager.getElementInstance()
		const bus = new CanvasElementToolCommandBus(canvas as never)

		bus.execute({
			toolId: ElementToolTypeEnum.VersionDelete,
			elementId: "image-1",
			contentId: "content-a",
		})

		expect(operations.deleteActiveContent).not.toHaveBeenCalled()
	})

	it("routes an unmounted generation editor through a target-safe fallback event", () => {
		const canvas = createCanvas()
		const bus = new CanvasElementToolCommandBus(canvas as never)

		bus.execute({
			toolId: ElementToolTypeEnum.GenerationGenerateAgain,
			elementId: "image-1",
			contentId: "content-a",
		})

		expect(canvas.eventEmitter.emit).toHaveBeenCalledWith({
			type: "element:image:toolCommand",
			data: {
				elementId: "image-1",
				contentId: "content-a",
				toolId: ElementToolTypeEnum.GenerationGenerateAgain,
			},
		})
	})

	it.each([
		[ElementToolTypeEnum.FrameCreate, "frame.create"],
		[ElementToolTypeEnum.FrameRemove, "frame.remove"],
	])("routes %s through its UserAction fallback", (toolId, actionId) => {
		const canvas = createCanvas()
		const bus = new CanvasElementToolCommandBus(canvas as never)

		bus.execute({
			toolId,
			elementId: "image-1",
		})

		expect(canvas.userActionRegistry.canExecute).toHaveBeenCalledWith(actionId)
		expect(canvas.userActionRegistry.execute).toHaveBeenCalledWith(actionId, {})
	})

	it("does not query UserActionRegistry with an undefined action id", () => {
		const canvas = createCanvas()
		const bus = new CanvasElementToolCommandBus(canvas as never)

		bus.execute({
			toolId: ElementToolTypeEnum.ContentEnhance,
			elementId: "image-1",
			contentId: "content-a",
		})

		expect(canvas.userActionRegistry.canExecute).not.toHaveBeenCalledWith(undefined)
		expect(canvas.userActionRegistry.execute).not.toHaveBeenCalled()
	})

	it("drops a generation fallback after the active Content changed", () => {
		const canvas = createCanvas()
		canvas.image.contents = [
			{ contentId: "content-a", src: "a.png" },
			{ contentId: "content-b", src: "b.png" },
		]
		canvas.image.activeContentId = "content-b"
		const bus = new CanvasElementToolCommandBus(canvas as never)

		bus.execute({
			toolId: ElementToolTypeEnum.GenerationQuickEdit,
			elementId: "image-1",
			contentId: "content-a",
		})

		expect(canvas.eventEmitter.emit).not.toHaveBeenCalled()
	})

	it("passes the captured Content target into image editing sessions", () => {
		const canvas = createCanvas()
		const bus = new CanvasElementToolCommandBus(canvas as never)

		bus.execute({
			toolId: ElementToolTypeEnum.ContentCrop,
			elementId: "image-1",
			contentId: "content-a",
		})

		expect(canvas.cropManager.enterCropMode).toHaveBeenCalledWith("image-1", "content-a")
	})

	it("updates dimensions for image and video media original size commands", () => {
		const canvas = createCanvas()
		const bus = new CanvasElementToolCommandBus(canvas as never)
		bus.execute({
			toolId: ElementToolTypeEnum.ContentMediaOriginalSize,
			elementId: "image-1",
			contentId: "content-a",
			payload: { width: 300, height: 200 },
		})
		expect(canvas.elementManager.update).toHaveBeenCalledWith("image-1", {
			width: 300,
			height: 200,
		})

		const video = { ...canvas.image, id: "video-1", type: "video" }
		canvas.elementManager.getElementData = vi.fn(() => video)
		bus.execute({
			toolId: ElementToolTypeEnum.ContentMediaOriginalSize,
			elementId: "video-1",
			contentId: "content-a",
			payload: { width: 400, height: 225 },
		})
		expect(canvas.elementManager.update).toHaveBeenLastCalledWith("video-1", {
			width: 400,
			height: 225,
		})
	})

	it("drops a stale active-content download command", () => {
		const canvas = createCanvas()
		canvas.image.contents = [
			{ contentId: "content-a", src: "a.png" },
			{ contentId: "content-b", src: "b.png" },
		]
		canvas.image.activeContentId = "content-b"
		const bus = new CanvasElementToolCommandBus(canvas as never)

		bus.execute({
			toolId: ElementToolTypeEnum.ContentDownload,
			elementId: "image-1",
			contentId: "content-a",
		})

		expect(canvas.userActionRegistry.execute).not.toHaveBeenCalled()
	})

	it("isolates registered runtime state by Content target", () => {
		const canvas = createCanvas()
		const bus = new CanvasElementToolCommandBus(canvas as never)
		bus.register(
			{
				elementId: "image-1",
				toolId: ElementToolTypeEnum.GenerationGenerateAgain,
				contentId: "content-a",
			},
			vi.fn(),
			{ loading: true },
		)
		bus.register(
			{
				elementId: "image-1",
				toolId: ElementToolTypeEnum.GenerationGenerateAgain,
				contentId: "content-b",
			},
			vi.fn(),
			{ disabled: true },
		)

		expect(
			bus
				.getElementToolStates("image-1", "content-a")
				.get(ElementToolTypeEnum.GenerationGenerateAgain),
		).toEqual(expect.objectContaining({ loading: true }))
		expect(
			bus
				.getElementToolStates("image-1", "content-b")
				.get(ElementToolTypeEnum.GenerationGenerateAgain),
		).toEqual(expect.objectContaining({ disabled: true }))
	})

	it("coalesces registration notifications and ignores handler-only refreshes", async () => {
		const canvas = createCanvas()
		const bus = new CanvasElementToolCommandBus(canvas as never)
		const listener = vi.fn()
		bus.subscribeElement("image-1", "content-a", listener)

		bus.register(
			{
				elementId: "image-1",
				toolId: ElementToolTypeEnum.GenerationGenerateAgain,
				contentId: "content-a",
			},
			vi.fn(),
			{ available: true },
		)
		bus.register(
			{
				elementId: "image-1",
				toolId: ElementToolTypeEnum.GenerationGenerateAgain,
				contentId: "content-a",
			},
			vi.fn(),
			{ available: true },
		)

		expect(listener).not.toHaveBeenCalled()
		await Promise.resolve()
		expect(listener).toHaveBeenCalledTimes(1)
	})

	it("drops a command whose captured Content revision is stale", () => {
		const canvas = createCanvas()
		canvas.image.contents = [{ contentId: "content-a", src: "a.png", revision: 2 }]
		const bus = new CanvasElementToolCommandBus(canvas as never)
		const execute = vi.fn()
		bus.register({ elementId: "image-1", toolId: ElementToolTypeEnum.ContentCrop }, execute)

		bus.execute({
			toolId: ElementToolTypeEnum.ContentCrop,
			elementId: "image-1",
			contentId: "content-a",
			contentRevision: 1,
		})

		expect(execute).not.toHaveBeenCalled()
	})

	it("routes text formatting commands through TextFormattingManager", () => {
		const canvas = createCanvas()
		canvas.elementManager.getElementData = vi.fn(() => canvas.textElement)
		const bus = new CanvasElementToolCommandBus(canvas as never)

		bus.execute({
			toolId: ElementToolTypeEnum.TextFontSize,
			elementId: "text-1",
			contentId: "text-content",
			payload: { fontSize: 24 },
		})
		bus.execute({
			toolId: ElementToolTypeEnum.TextFontStyle,
			elementId: "text-1",
			contentId: "text-content",
			payload: { bold: true },
		})

		expect(canvas.textFormattingManager.setFontSize).toHaveBeenCalledWith(24)
		expect(canvas.textFormattingManager.setBold).toHaveBeenCalledWith(true)
	})

	it("drops text optimization results after the editing context changes", () => {
		const canvas = createCanvas()
		canvas.elementManager.getElementData = vi.fn(() => canvas.textElement)
		canvas.textFormattingManager.getToolbarState = vi.fn(() => ({
			selectedTextElement: { id: "another-text" },
		}))
		const bus = new CanvasElementToolCommandBus(canvas as never)

		bus.execute({
			toolId: ElementToolTypeEnum.TextContentOptimization,
			elementId: "text-1",
			contentId: "text-content",
			payload: { action: "apply", content: [{ type: "paragraph", children: [] }] },
		})

		expect(canvas.elementManager.update).not.toHaveBeenCalled()
	})

	it("routes shape updates through the captured element target", () => {
		const canvas = createCanvas()
		const shape = {
			id: "shape-1",
			type: "rectangle",
			contents: [{ contentId: "shape-content" }],
			activeContentId: "shape-content",
		}
		canvas.elementManager.getElementData = vi.fn(() => shape)
		const bus = new CanvasElementToolCommandBus(canvas as never)

		bus.execute({
			toolId: ElementToolTypeEnum.ShapeStyle,
			elementId: "shape-1",
			payload: { updates: { opacity: 0.5, sides: 6 } },
		})

		expect(canvas.elementManager.update).toHaveBeenCalledWith("shape-1", {
			opacity: 0.5,
			sides: 6,
		})
	})
})
