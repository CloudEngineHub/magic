import { act, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { ElementTypeEnum } from "../../../../runtime/document/types"
import { ImageElement } from "../../../../runtime/elements/image/ImageElement"
import ImageEraserPanelRender from "../ImageEraserPanelRender"

const mocks = vi.hoisted(() => ({
	canvas: undefined as unknown,
	methods: undefined as unknown,
	erasingElementId: "source-image" as string | undefined,
	createEraserMaskFile: vi.fn(),
	flattenEraserStrokes: vi.fn(),
}))

vi.mock("../../../../app/hooks/canvas", () => ({
	useCanvasEvent: vi.fn(),
}))

vi.mock("../../../../app/hooks/layout/useElementPositionEffect", () => ({
	default: () => ({ containerRef: { current: null } }),
}))

vi.mock("../../../../app/hooks/layout/useFloatingComponent", () => ({
	useFloatingComponent: () => ({ containerRef: { current: null } }),
}))

vi.mock("../../../../app/providers/CanvasProvider", () => ({
	useCanvas: () => ({ canvas: mocks.canvas }),
}))

vi.mock("../../../../app/providers/CanvasUIProvider", () => ({
	useCanvasModeUI: () => ({ erasingElementId: mocks.erasingElementId }),
}))

vi.mock("../../../../app/providers/I18nProvider", () => ({
	useCanvasDesignI18n: () => ({
		t: (_key: string, fallback: string) => fallback,
	}),
}))

vi.mock("../../../../app/providers/MagicProvider", () => ({
	useMagic: () => ({ methods: mocks.methods }),
}))

vi.mock("../../../../runtime/elements/core/ElementFactory", () => ({
	ElementFactory: {
		createElementData: vi.fn(() => ({
			id: "created-image",
			activeContentId: "created-content",
			mainContentId: "created-content",
			contents: [{ contentId: "created-content" }],
		})),
	},
}))

vi.mock("../../../../runtime/elements/image/ImageElement", () => ({
	ImageElement: class ImageElement {},
}))

vi.mock("../../../../runtime/resources/image/eraserMaskComposer", () => ({
	createEraserMaskFile: (...args: unknown[]) => mocks.createEraserMaskFile(...args),
}))

vi.mock("../../../../runtime/resources/image/eraserStrokeTransfer", () => ({
	flattenEraserStrokes: (...args: unknown[]) => mocks.flattenEraserStrokes(...args),
}))

vi.mock("../../../../runtime/resources/image/imageCropUtils", () => ({
	buildReferenceImageOptions: vi.fn(() => []),
	getImageProcessRequestPayload: vi.fn(() => ({ size: "640x480" })),
}))

vi.mock("../../../../runtime/resources/image/imageGenerationTaskMeta", () => ({
	createEraserTaskMeta: vi.fn(() => ({})),
}))

vi.mock("../../../../runtime/shared/ids", () => ({
	generateElementId: vi.fn(() => "created-image"),
	generateUUID: vi.fn(() => "generated-id"),
}))

vi.mock("../../../../runtime/shared/placement/placementEngine", () => ({
	resolveDerivedRightPlacement: vi.fn(() => ({ x: 300, y: 20 })),
}))

interface MockImageElementInstance {
	getImageInfo: ReturnType<typeof vi.fn>
	getRenderName: ReturnType<typeof vi.fn>
	getHTMLImageElement: ReturnType<typeof vi.fn>
	eraser: ReturnType<typeof vi.fn>
}

function createImageElementInstance(): MockImageElementInstance {
	const ImageElementMock = ImageElement as unknown as new () => MockImageElementInstance
	const instance = new ImageElementMock()
	instance.getImageInfo = vi.fn(() => ({ naturalWidth: 640, naturalHeight: 480 }))
	instance.getRenderName = vi.fn(() => "Source image")
	instance.getHTMLImageElement = vi.fn()
	instance.eraser = vi.fn(async () => true)
	return instance
}

describe("ImageEraserPanelRender", () => {
	beforeEach(() => {
		vi.clearAllMocks()
		mocks.erasingElementId = "source-image"

		const sourceImageInstance = createImageElementInstance()
		const createdImageInstance = createImageElementInstance()
		const createEraserMaskInWorker = vi.fn(async () => ({
			blob: new Blob(["mask"], { type: "image/png" }),
			sourceDimensions: { width: 640, height: 480 },
		}))
		const eraserManager = {
			getRadius: vi.fn(() => 24),
			getRadiusRange: vi.fn(() => ({ min: 1, max: 100 })),
			canUndo: vi.fn(() => true),
			canRedo: vi.fn(() => false),
			getStrokes: vi.fn(() => [{ points: [{ x: 10, y: 10 }], radius: 12 }]),
			setRadius: vi.fn(),
			undoLastStroke: vi.fn(),
			redoLastStroke: vi.fn(),
			cancelEraser: vi.fn(),
			exitEraserMode: vi.fn(),
		}

		mocks.canvas = {
			eraserManager,
			elementManager: {
				getElementData: vi.fn(() => ({
					id: "source-image",
					type: ElementTypeEnum.Image,
					name: "Source image",
					width: 640,
					height: 480,
					activeContentId: "source-content",
					mainContentId: "source-content",
					contents: [{ contentId: "source-content", src: "source.png" }],
				})),
				getElementInstance: vi.fn((elementId: string) =>
					elementId === "source-image" ? sourceImageInstance : createdImageInstance,
				),
				getNextZIndexInLevel: vi.fn(() => 2),
				createTemporaryElement: vi.fn(),
			},
			generationRuntimeManager: {
				beginAttempt: vi.fn(() => "attempt-1"),
			},
			generationAttemptCoordinator: {
				rejectAttempt: vi.fn(),
				resolveDetachedPlaceholderFailure: vi.fn(),
			},
			selectionManager: { select: vi.fn() },
			submitImageWorkerManager: { createEraserMaskInWorker },
		}
		mocks.methods = {
			uploadPrivateFiles: vi.fn(async () => [{ path: "design-mark/mask.png" }]),
		}
		mocks.flattenEraserStrokes.mockReturnValue({
			meta: new Uint32Array([0, 1, 12]),
			points: new Float32Array([10, 10]),
		})
		mocks.createEraserMaskFile.mockResolvedValue(
			new File(["mask"], "mask.png", { type: "image/png" }),
		)
	})

	it("starts unchecked and resets when the panel remounts without changing eraser history", () => {
		const { unmount } = render(<ImageEraserPanelRender />)
		const checkbox = screen.getByRole("checkbox", { name: "反向擦除" })
		const canvas = mocks.canvas as {
			eraserManager: {
				getStrokes: ReturnType<typeof vi.fn>
				undoLastStroke: ReturnType<typeof vi.fn>
				redoLastStroke: ReturnType<typeof vi.fn>
			}
		}

		expect(checkbox).not.toBeChecked()
		fireEvent.click(checkbox)
		expect(checkbox).toBeChecked()
		fireEvent.click(checkbox)
		expect(checkbox).not.toBeChecked()
		fireEvent.click(checkbox)
		expect(checkbox).toBeChecked()
		expect(canvas.eraserManager.getStrokes).not.toHaveBeenCalled()
		expect(canvas.eraserManager.undoLastStroke).not.toHaveBeenCalled()
		expect(canvas.eraserManager.redoLastStroke).not.toHaveBeenCalled()

		unmount()
		render(<ImageEraserPanelRender />)
		expect(screen.getByRole("checkbox", { name: "反向擦除" })).not.toBeChecked()
	})

	it("forwards the default normal mode to the worker", async () => {
		render(<ImageEraserPanelRender />)
		fireEvent.click(screen.getByRole("button", { name: "确定" }))

		const canvas = mocks.canvas as {
			submitImageWorkerManager: {
				createEraserMaskInWorker: ReturnType<typeof vi.fn>
			}
		}
		await waitFor(() => {
			expect(canvas.submitImageWorkerManager.createEraserMaskInWorker).toHaveBeenCalledWith(
				expect.objectContaining({ eraseOutside: false }),
			)
		})
	})

	it("forwards inverted mode to both the worker request and fallback composer", async () => {
		const canvas = mocks.canvas as {
			submitImageWorkerManager: {
				createEraserMaskInWorker: ReturnType<typeof vi.fn>
			}
		}
		canvas.submitImageWorkerManager.createEraserMaskInWorker.mockResolvedValue(null)

		render(<ImageEraserPanelRender />)
		fireEvent.click(screen.getByRole("checkbox", { name: "反向擦除" }))
		fireEvent.click(screen.getByRole("button", { name: "确定" }))

		await waitFor(() => {
			expect(canvas.submitImageWorkerManager.createEraserMaskInWorker).toHaveBeenCalledWith(
				expect.objectContaining({ eraseOutside: true }),
			)
			expect(mocks.createEraserMaskFile).toHaveBeenCalledWith(
				expect.objectContaining({ eraseOutside: true }),
			)
		})
	})

	it("does not submit an inverted erase without painted strokes", () => {
		const canvas = mocks.canvas as {
			eraserManager: { getStrokes: ReturnType<typeof vi.fn> }
			submitImageWorkerManager: {
				createEraserMaskInWorker: ReturnType<typeof vi.fn>
			}
		}
		canvas.eraserManager.getStrokes.mockReturnValue([])

		render(<ImageEraserPanelRender />)
		fireEvent.click(screen.getByRole("checkbox", { name: "反向擦除" }))
		fireEvent.click(screen.getByRole("button", { name: "确定" }))

		expect(canvas.submitImageWorkerManager.createEraserMaskInWorker).not.toHaveBeenCalled()
		expect(mocks.createEraserMaskFile).not.toHaveBeenCalled()
	})

	it("disables the checkbox while a submission is pending", async () => {
		let resolveWorker: ((value: null) => void) | undefined
		const canvas = mocks.canvas as {
			submitImageWorkerManager: {
				createEraserMaskInWorker: ReturnType<typeof vi.fn>
			}
		}
		canvas.submitImageWorkerManager.createEraserMaskInWorker.mockImplementation(
			() =>
				new Promise<null>((resolve) => {
					resolveWorker = resolve
				}),
		)

		render(<ImageEraserPanelRender />)
		const checkbox = screen.getByRole("checkbox", { name: "反向擦除" })
		fireEvent.click(screen.getByRole("button", { name: "确定" }))

		await waitFor(() => expect(checkbox).toBeDisabled())
		await act(async () => resolveWorker?.(null))
		await waitFor(() => expect(checkbox).not.toBeDisabled())
	})
})
