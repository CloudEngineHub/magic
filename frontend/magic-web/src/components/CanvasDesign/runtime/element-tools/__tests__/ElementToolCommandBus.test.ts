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
	return {
		image,
		elementManager: {
			getElementData: vi.fn(() => image),
			getElementInstance: vi.fn(() => operations),
		},
		generationRuntimeManager: { isCurrent: vi.fn(() => true) },
		userActionRegistry: { execute: vi.fn() },
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
})
