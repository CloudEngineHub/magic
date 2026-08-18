import { describe, expect, it, vi } from "vitest"
import type { Canvas } from "../../../core/Canvas"
import { EventEmitter } from "../../../core/EventEmitter"
import { ElementTypeEnum, type LayerElement } from "../../../document/types"
import { VideoCompositionManager } from "../VideoCompositionManager"

function createDeferred<T>() {
	let resolve!: (value: T) => void
	let reject!: (reason?: unknown) => void
	const promise = new Promise<T>((resolvePromise, rejectPromise) => {
		resolve = resolvePromise
		reject = rejectPromise
	})
	return { promise, resolve, reject }
}

function createVideo(id: string): LayerElement {
	return {
		id,
		type: ElementTypeEnum.Video,
		width: 320,
		height: 180,
		contents: [{ contentId: `${id}-content`, src: `./videos/${id}.mp4` }],
		activeContentId: `${id}-content`,
		mainContentId: `${id}-content`,
	} as LayerElement
}

function createEditor(id = "editor"): LayerElement {
	return {
		id,
		type: ElementTypeEnum.VideoEdit,
		width: 640,
		height: 360,
		contents: [{ contentId: `${id}-content`, videoSequence: ["video-1"] }],
		activeContentId: `${id}-content`,
		mainContentId: `${id}-content`,
	} as LayerElement
}

function createCanvas(
	elements: LayerElement[],
	prepareCanvasComposition?: () => Promise<{ ok: true } | { ok: false; errorMessage: string }>,
) {
	const eventEmitter = new EventEmitter()
	const elementMap = new Map(elements.map((element) => [element.id, element]))
	const canvas = {
		eventEmitter,
		magicConfigManager: {
			config: {
				methods: {
					prepareCanvasComposition,
				},
			},
		},
		t: (_key: string, fallback: string) => fallback,
		elementManager: {
			getElementData: vi.fn((id: string) => elementMap.get(id)),
			getAllElementIds: vi.fn(() => Array.from(elementMap.keys())),
			getNextZIndexInLevel: vi.fn(() => 1),
			hasElement: vi.fn((id: string) => elementMap.has(id)),
			isElementVisibleInDataTree: vi.fn((id: string) => elementMap.has(id)),
			getElementInstance: vi.fn(),
			createTemporaryElement: vi.fn((element: LayerElement) =>
				elementMap.set(element.id, element),
			),
			delete: vi.fn((id: string) => elementMap.delete(id)),
		},
		connectionManager: {
			getUpstreamConnections: vi.fn((id: string) =>
				id === "editor"
					? [{ id: "input", sourceElementId: "video-1", targetElementId: id }]
					: [],
			),
			connectRuntimeElements: vi.fn(() => ({
				status: "created",
				connectionId: "runtime-1",
			})),
			removeConnections: vi.fn(),
			promoteRuntimeConnection: vi.fn(),
		},
		geometryCacheManager: { getElementBounds: vi.fn(() => null) },
		historyManager: { runTransaction: vi.fn() },
	} as unknown as Canvas
	return canvas
}

describe("VideoCompositionManager", () => {
	it("keeps a stable idle snapshot and reports missing inputs", async () => {
		const canvas = createCanvas([createEditor()])
		const manager = new VideoCompositionManager({ canvas })

		expect(manager.getSnapshot("editor")).toEqual({
			status: "idle",
			progress: 0,
			issues: [],
		})
		expect(await manager.start("editor")).toBe(false)
		expect(manager.getSnapshot("editor").issues[0]?.code).toBe("missing-video")
		manager.destroy()
	})

	it("does not create a backend task when saving fails", async () => {
		const prepareCanvasComposition = vi.fn(async () => ({
			ok: false as const,
			errorMessage: "画布保存失败，未创建合并任务",
		}))
		const canvas = createCanvas(
			[createEditor(), createVideo("video-1")],
			prepareCanvasComposition,
		)
		const manager = new VideoCompositionManager({ canvas })

		expect(await manager.start("editor")).toBe(false)
		expect(prepareCanvasComposition).toHaveBeenCalledWith()
		expect(canvas.elementManager.createTemporaryElement).toHaveBeenCalledOnce()
		expect(canvas.elementManager.delete).toHaveBeenCalledOnce()
		expect(manager.getSnapshot("editor").issues[0]?.code).toBe("save-failed")
		manager.destroy()
	})

	it("shows the temporary result while the canvas is being saved", async () => {
		const save = createDeferred<{ ok: true }>()
		const prepareCanvasComposition = vi.fn(() => save.promise)
		const canvas = createCanvas(
			[createEditor(), createVideo("video-1")],
			prepareCanvasComposition,
		)
		const manager = new VideoCompositionManager({ canvas })

		const startPromise = manager.start("editor")
		await Promise.resolve()

		expect(prepareCanvasComposition).toHaveBeenCalledOnce()
		expect(canvas.elementManager.createTemporaryElement).toHaveBeenCalledOnce()
		expect(manager.getSnapshot("editor")).toMatchObject({
			status: "preparing",
			resultElementId: expect.any(String),
		})

		save.resolve({ ok: true })
		expect(await startPromise).toBe(false)
		manager.destroy()
	})
})
