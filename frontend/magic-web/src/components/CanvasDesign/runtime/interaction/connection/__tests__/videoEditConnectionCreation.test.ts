import { afterEach, describe, expect, it, vi } from "vitest"
import type { Canvas } from "../../../core/Canvas"
import { ElementTypeEnum, type LayerElement } from "../../../document/types"
import {
	canCreateVideoEditFromFrameConnection,
	collectFrameVideoEditInputs,
	createVideoEditFromFrameConnection,
} from "../videoEditConnectionCreation"

function createElement(
	id: string,
	type: LayerElement["type"],
	children?: LayerElement[],
): LayerElement {
	const contentId = `${id}-content`
	return {
		id,
		type,
		contents: [{ contentId }],
		activeContentId: contentId,
		mainContentId: contentId,
		...(children ? { children } : {}),
	} as LayerElement
}

function createCanvasMock(options?: {
	frameChildren?: LayerElement[]
	connectionStatus?: "created" | "invalid"
}) {
	const elements = new Map<string, LayerElement>()
	const frame = createElement("frame-1", ElementTypeEnum.Frame, options?.frameChildren)
	const register = (element: LayerElement): void => {
		elements.set(element.id, element)
		if ("children" in element && Array.isArray(element.children)) {
			element.children.forEach(register)
		}
	}
	register(frame)

	const create = vi.fn((element: LayerElement) => elements.set(element.id, element))
	const remove = vi.fn((elementId: string) => elements.delete(elementId))
	const connectElements = vi.fn(() =>
		options?.connectionStatus === "invalid"
			? ({ status: "invalid", reason: "missing-element" } as const)
			: ({ status: "created", connectionId: "connection-1" } as const),
	)
	const select = vi.fn()
	const moveElementToViewport = vi.fn()
	const canvas = {
		elementManager: {
			getElementData: vi.fn((elementId: string) => elements.get(elementId)),
			getNextZIndexInLevel: vi.fn(() => 7),
			create,
			delete: remove,
			hasElement: vi.fn((elementId: string) => elements.has(elementId)),
		},
		connectionManager: { connectElements },
		selectionManager: { select },
		viewportController: {
			isElementInViewport: vi.fn(() => false),
			moveElementToViewport,
		},
	} as unknown as Canvas

	return { canvas, elements, create, remove, connectElements, select, moveElementToViewport }
}

describe("video edit connection creation", () => {
	afterEach(() => {
		vi.restoreAllMocks()
	})

	it("is available only from the right handle of a frame with video inputs", () => {
		const withVideo = createCanvasMock({
			frameChildren: [createElement("video-1", ElementTypeEnum.Video)],
		})
		const withoutVideo = createCanvasMock({
			frameChildren: [createElement("audio-1", ElementTypeEnum.Audio)],
		})

		expect(
			canCreateVideoEditFromFrameConnection(withVideo.canvas, {
				originElementId: "frame-1",
				originSide: "right",
			}),
		).toBe(true)
		expect(
			canCreateVideoEditFromFrameConnection(withVideo.canvas, {
				originElementId: "frame-1",
				originSide: "left",
			}),
		).toBe(false)
		expect(
			canCreateVideoEditFromFrameConnection(withoutVideo.canvas, {
				originElementId: "frame-1",
				originSide: "right",
			}),
		).toBe(false)
		expect(
			canCreateVideoEditFromFrameConnection(
				createCanvasMock({
					frameChildren: [createElement("video-1", ElementTypeEnum.Video)],
				}).canvas,
				{ originElementId: "missing-frame", originSide: "right" },
			),
		).toBe(false)
	})

	it("collects nested video and audio inputs in document order", () => {
		const { canvas } = createCanvasMock({
			frameChildren: [
				createElement("video-1", ElementTypeEnum.Video),
				createElement("group-1", ElementTypeEnum.Group, [
					createElement("audio-1", ElementTypeEnum.Audio),
					createElement("frame-2", ElementTypeEnum.Frame, [
						createElement("video-2", ElementTypeEnum.Video),
					]),
				]),
			],
		})

		expect(collectFrameVideoEditInputs(canvas, "frame-1")).toEqual({
			videoSequence: ["video-1", "video-2"],
			audioSequence: ["audio-1"],
		})
	})

	it("creates, connects, selects and focuses the video edit element", () => {
		vi.spyOn(globalThis, "requestAnimationFrame").mockImplementation((callback) => {
			callback(0)
			return 1
		})
		const { canvas, create, connectElements, select, moveElementToViewport } = createCanvasMock(
			{
				frameChildren: [
					createElement("video-1", ElementTypeEnum.Video),
					createElement("audio-1", ElementTypeEnum.Audio),
				],
			},
		)

		const elementId = createVideoEditFromFrameConnection(canvas, {
			originElementId: "frame-1",
			originSide: "right",
			x: 1200,
			y: 300,
		})

		expect(elementId).toMatch(/^element-/)
		expect(create).toHaveBeenCalledWith(
			expect.objectContaining({
				id: elementId,
				type: ElementTypeEnum.VideoEdit,
				x: 1200,
				y: 300,
				zIndex: 7,
				contents: [
					expect.objectContaining({
						videoSequence: ["video-1"],
						audioSequence: ["audio-1"],
					}),
				],
			}),
		)
		expect(connectElements).toHaveBeenCalledWith({
			sourceElementId: "frame-1",
			targetElementId: elementId,
		})
		expect(select).toHaveBeenCalledWith(elementId)
		expect(moveElementToViewport).toHaveBeenCalledWith([elementId], {
			animated: true,
			padding: { top: 50, right: 50, bottom: 50, left: 100 },
		})
	})

	it("removes the new element when the frame connection cannot be persisted", () => {
		const { canvas, remove, select } = createCanvasMock({
			frameChildren: [createElement("video-1", ElementTypeEnum.Video)],
			connectionStatus: "invalid",
		})

		const result = createVideoEditFromFrameConnection(canvas, {
			originElementId: "frame-1",
			originSide: "right",
			x: 1200,
			y: 300,
		})

		expect(result).toBeNull()
		expect(remove).toHaveBeenCalledWith(expect.stringMatching(/^element-/))
		expect(select).not.toHaveBeenCalled()
	})
})
