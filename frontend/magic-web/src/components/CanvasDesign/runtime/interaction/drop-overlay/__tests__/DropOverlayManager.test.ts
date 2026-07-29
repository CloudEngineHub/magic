import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { toast } from "sonner"
import type { LayerElement } from "../../../document/types"
import type { Canvas } from "../../../core/Canvas"
import { DropOverlayManager } from "../DropOverlayManager"

vi.mock("sonner", () => ({
	toast: {
		loading: vi.fn(() => "drop-toast-id"),
		dismiss: vi.fn(),
		error: vi.fn(),
		warning: vi.fn(),
	},
}))

interface Deferred<T> {
	promise: Promise<T>
	resolve: (value: T) => void
	reject: (error: unknown) => void
}

function createDeferred<T>(): Deferred<T> {
	let resolve!: (value: T) => void
	let reject!: (error: unknown) => void
	const promise = new Promise<T>((resolvePromise, rejectPromise) => {
		resolve = resolvePromise
		reject = rejectPromise
	})
	return { promise, resolve, reject }
}

function createDragEvent(type: string, dataTransfer?: Partial<DataTransfer>): DragEvent {
	const event = new Event(type, { bubbles: true, cancelable: true }) as DragEvent
	Object.defineProperty(event, "dataTransfer", {
		value: dataTransfer,
	})
	return event
}

function createDropHarness(options: {
	getFileInfo: ReturnType<typeof vi.fn>
	imageDimensions?: { width: number; height: number }
	videoDimensions?: { width: number; height: number }
}) {
	const elements = new Map<string, LayerElement>()
	const historyManager = {
		disable: vi.fn(),
		enable: vi.fn(),
		recordHistoryImmediate: vi.fn(),
	}
	const selectionManager = {
		selectMultiple: vi.fn(),
	}
	const elementManager = {
		getElementsDict: vi.fn(() => Object.fromEntries(elements)),
		getMaxZIndexInLevel: vi.fn(() => 0),
		create: vi.fn((element: LayerElement) => {
			elements.set(element.id, element)
		}),
	}
	const imageResourceManager = {
		primeCache: vi.fn(),
		loadResource: vi.fn(),
	}
	const videoResourceManager = {
		primeCache: vi.fn(),
		loadResource: vi.fn(),
	}
	const overlayHost = document.createElement("div")
	const canvasContainer = document.createElement("div")
	overlayHost.appendChild(canvasContainer)
	const canvas = {
		container: canvasContainer,
		elementManager,
		historyManager,
		selectionManager,
		imageResourceManager,
		videoResourceManager,
		magicConfigManager: {
			config: {
				methods: {
					getFileInfo: options.getFileInfo,
				},
			},
		},
		t: vi.fn((_key: string, fallback: string) => fallback),
	}
	const manager = Object.create(DropOverlayManager.prototype) as unknown as {
		canvas: typeof canvas
		handleCustomDragData: (
			filePaths: string[],
			anchorPosition: { x: number; y: number },
		) => Promise<void>
		getImageDimensionsFromUrl: (path: string) => Promise<{ width: number; height: number }>
		getVideoDimensionsFromUrl: (src: string) => Promise<{ width: number; height: number }>
		getOverlayHostElement: () => HTMLElement
		createOverlayElement: (text: string, centerX: number, centerY: number) => HTMLDivElement
	}
	manager.canvas = canvas
	manager.getImageDimensionsFromUrl = vi.fn(
		async () => options.imageDimensions ?? { width: 400, height: 200 },
	)
	manager.getVideoDimensionsFromUrl = vi.fn(
		async () => options.videoDimensions ?? { width: 1920, height: 1080 },
	)

	return {
		manager,
		canvas,
		elements,
		historyManager,
		selectionManager,
		overlayHost,
	}
}

describe("DropOverlayManager custom attachment drops", () => {
	beforeEach(() => {
		vi.clearAllMocks()
		vi.spyOn(console, "log").mockImplementation(() => undefined)
		vi.spyOn(console, "warn").mockImplementation(() => undefined)
	})

	afterEach(() => {
		vi.restoreAllMocks()
	})

	it("shows a loading toast and creates elements only after preload completes", async () => {
		const imageInfo = createDeferred<{ src: string; fileName: string }>()
		const videoInfo = createDeferred<{ src: string; fileName: string }>()
		const getFileInfo = vi.fn((path: string) =>
			path.endsWith(".mp4") ? videoInfo.promise : imageInfo.promise,
		)
		const harness = createDropHarness({ getFileInfo })

		const dropPromise = harness.manager.handleCustomDragData(
			["/outside/photo.png", "/outside/clip.mp4"],
			{ x: 100, y: 200 },
		)

		expect(harness.elements.size).toBe(0)
		expect(toast.loading).toHaveBeenCalledWith("正在加载媒体文件，请稍候...")
		expect(harness.historyManager.recordHistoryImmediate).not.toHaveBeenCalled()

		imageInfo.resolve({ src: "https://example.test/photo.png", fileName: "photo.png" })
		videoInfo.resolve({ src: "https://example.test/clip.mp4", fileName: "clip.mp4" })
		await dropPromise

		const elements = Array.from(harness.elements.values())
		expect(elements).toHaveLength(2)
		expect(elements[0]).toMatchObject({
			width: 400,
			height: 200,
			src: "/outside/photo.png",
		})
		expect(elements[1]).toMatchObject({
			width: 1920,
			height: 1080,
			src: "/outside/clip.mp4",
		})
		expect(harness.selectionManager.selectMultiple).toHaveBeenCalledWith(
			elements.map(({ id }) => id),
		)
		expect(harness.historyManager.recordHistoryImmediate).toHaveBeenCalledTimes(1)
		expect(toast.dismiss).toHaveBeenCalledWith("drop-toast-id")
		expect(harness.canvas.imageResourceManager.primeCache).toHaveBeenCalledTimes(1)
		expect(harness.canvas.videoResourceManager.primeCache).toHaveBeenCalledTimes(1)
	})

	it("uses the requested fallback dimensions without a later resize", async () => {
		const harness = createDropHarness({
			getFileInfo: vi.fn(async () => ({
				src: "https://example.test/photo.png",
				fileName: "photo.png",
			})),
		})
		harness.manager.getImageDimensionsFromUrl = vi.fn(async () => {
			throw new Error("dimensions unavailable")
		})

		await harness.manager.handleCustomDragData(["/outside/photo.png"], {
			x: 100,
			y: 200,
		})

		const [element] = harness.elements.values()
		expect(element).toMatchObject({ width: 1024, height: 1024 })
		expect(toast.dismiss).toHaveBeenCalledWith("drop-toast-id")
	})

	it("shows an error toast and creates nothing when preload fails", async () => {
		const failure = new Error("file info failed")
		const harness = createDropHarness({
			getFileInfo: vi.fn(async () => Promise.reject(failure)),
		})

		await harness.manager.handleCustomDragData(["/outside/photo.png"], {
			x: 100,
			y: 200,
		})

		expect(harness.elements.size).toBe(0)
		expect(toast.error).toHaveBeenCalledWith("媒体文件加载失败，请重试", {
			id: "drop-toast-id",
		})
		expect(harness.historyManager.recordHistoryImmediate).not.toHaveBeenCalled()
	})

	it("mounts the drop overlay above the canvas stacking context", () => {
		const harness = createDropHarness({ getFileInfo: vi.fn() })
		const overlay = harness.manager.createOverlayElement("drop", 0, 0)

		expect(harness.manager.getOverlayHostElement()).toBe(harness.overlayHost)
		expect(overlay.style.zIndex).toBe("9999")
		expect(overlay.style.pointerEvents).toBe("none")
	})

	it("keeps the drop overlay visible when dragging from the canvas onto the element toolbar", () => {
		const overlayHost = document.createElement("div")
		const canvasContainer = document.createElement("div")
		const elementToolbar = document.createElement("div")
		overlayHost.append(canvasContainer, elementToolbar)

		const manager = new DropOverlayManager({
			canvas: {
				container: canvasContainer,
				readonly: false,
				viewportController: {
					getResolvedDefaultViewportPadding: vi.fn(() => ({
						left: 0,
						right: 0,
						top: 0,
						bottom: 0,
					})),
				},
				t: vi.fn((_key: string, fallback: string) => fallback),
			} as unknown as Canvas,
		})
		const dataTransfer = { types: ["text/plain"] } as Partial<DataTransfer>

		canvasContainer.dispatchEvent(createDragEvent("dragenter", dataTransfer))
		expect(overlayHost.children).toHaveLength(3)

		elementToolbar.dispatchEvent(createDragEvent("dragenter", dataTransfer))
		canvasContainer.dispatchEvent(createDragEvent("dragleave", dataTransfer))
		expect(overlayHost.children).toHaveLength(3)

		elementToolbar.dispatchEvent(createDragEvent("dragleave", dataTransfer))
		expect(overlayHost.children).toHaveLength(2)

		manager.destroy()
		canvasContainer.dispatchEvent(createDragEvent("dragenter", dataTransfer))
		expect(overlayHost.children).toHaveLength(2)
	})

	it("yields project-file drops to nested image and video editor drop surfaces", () => {
		const overlayHost = document.createElement("div")
		const canvasContainer = document.createElement("div")
		const editorDropSurface = document.createElement("div")
		editorDropSurface.setAttribute("data-canvas-resource-drop-surface", "")
		overlayHost.append(canvasContainer, editorDropSurface)
		const getDataTransferFileInfo = vi.fn()
		const nestedDropHandler = vi.fn((event: Event) => event.preventDefault())
		editorDropSurface.addEventListener("drop", nestedDropHandler)

		const manager = new DropOverlayManager({
			canvas: {
				container: canvasContainer,
				readonly: false,
				magicConfigManager: {
					config: { methods: { getDataTransferFileInfo } },
				},
			} as unknown as Canvas,
		})
		const dataTransfer = { types: ["text/plain"] } as Partial<DataTransfer>

		editorDropSurface.dispatchEvent(createDragEvent("dragenter", dataTransfer))
		expect(overlayHost.children).toHaveLength(2)

		editorDropSurface.dispatchEvent(createDragEvent("drop", dataTransfer))
		expect(nestedDropHandler).toHaveBeenCalledTimes(1)
		expect(getDataTransferFileInfo).not.toHaveBeenCalled()

		manager.destroy()
	})

	it("restores the canvas drop overlay after moving through a nested editor", () => {
		const overlayHost = document.createElement("div")
		const canvasContainer = document.createElement("div")
		const editorDropSurface = document.createElement("div")
		editorDropSurface.setAttribute("data-canvas-resource-drop-surface", "")
		overlayHost.append(canvasContainer, editorDropSurface)

		const manager = new DropOverlayManager({
			canvas: {
				container: canvasContainer,
				readonly: false,
				viewportController: {
					getResolvedDefaultViewportPadding: vi.fn(() => ({
						left: 0,
						right: 0,
						top: 0,
						bottom: 0,
					})),
				},
				t: vi.fn((_key: string, fallback: string) => fallback),
			} as unknown as Canvas,
		})
		const dataTransfer = { types: ["text/plain"] } as Partial<DataTransfer>

		canvasContainer.dispatchEvent(createDragEvent("dragenter", dataTransfer))
		expect(overlayHost.children).toHaveLength(3)

		editorDropSurface.dispatchEvent(createDragEvent("dragenter", dataTransfer))
		expect(overlayHost.children).toHaveLength(2)

		canvasContainer.dispatchEvent(createDragEvent("dragleave", dataTransfer))
		canvasContainer.dispatchEvent(createDragEvent("dragenter", dataTransfer))
		expect(overlayHost.children).toHaveLength(3)

		manager.destroy()
	})
})
