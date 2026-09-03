import { describe, expect, it, vi } from "vitest"
import { Canvas } from "../Canvas"
import { ElementTypeEnum, type LayerElement } from "../../document/types"
import { exportCanvasDocument } from "../../document/exportDocument"

function createPreviewCanvas(element: LayerElement) {
	const previewContentIds = new Map<string, string>()
	const rerender = vi.fn()
	const emit = vi.fn()
	const canvas = Object.create(Canvas.prototype) as Canvas
	Object.assign(canvas, {
		previewContentIds,
		permissionManager: {
			can: vi.fn(
				(capability: string) =>
					capability === "interaction.switchContent" || capability === "document.read",
			),
		},
		elementManager: {
			getElementData: vi.fn(() => element),
			getElementInstance: vi.fn(() => ({ rerender })),
			updateAllElementsDraggable: vi.fn(),
		},
		eventEmitter: { emit },
	})
	return { canvas, previewContentIds, rerender, emit }
}

describe("Canvas Content preview isolation", () => {
	it.each([
		[ElementTypeEnum.Image, "image-content-2", "/images/preview.png"],
		[ElementTypeEnum.Video, "video-content-2", "/videos/preview.mp4"],
		[ElementTypeEnum.Audio, "audio-content-2", "/audios/preview.mp3"],
	])(
		"projects %s preview content without mutating document data",
		(type, previewContentId, previewSrc) => {
			const element = {
				id: `${type}-1`,
				type,
				activeContentId: `${type}-content-1`,
				mainContentId: `${type}-content-1`,
				contents: [
					{ contentId: `${type}-content-1`, src: `/media/${type}/document` },
					{ contentId: previewContentId, src: previewSrc },
				],
			} as unknown as LayerElement
			const original = JSON.stringify(element)
			const { canvas, rerender, emit } = createPreviewCanvas(element)

			expect(canvas.setPreviewContent(element.id, previewContentId)).toBe(true)
			expect(canvas.getEffectiveContentId(element.id)).toBe(previewContentId)
			expect(canvas.getEffectiveContent(element.id)).toMatchObject({
				contentId: previewContentId,
				src: previewSrc,
			})
			expect(canvas.getElementForContentView(element)).toMatchObject({
				activeContentId: previewContentId,
			})
			expect(JSON.stringify(element)).toBe(original)
			expect(exportCanvasDocument([element]).elements[0].activeContentId).toBe(
				`${type}-content-1`,
			)
			expect(rerender).toHaveBeenCalledWith()
			expect(emit).toHaveBeenCalledWith({
				type: "content:previewChanged",
				data: { elementId: element.id, contentId: previewContentId },
			})

			canvas.clearPreviewContent(element.id)
			expect(canvas.getEffectiveContentId(element.id)).toBe(`${type}-content-1`)
			expect(JSON.stringify(element)).toBe(original)
			expect(rerender).toHaveBeenCalledTimes(2)
		},
	)

	it("clears session preview when write access is restored", () => {
		let canWrite = false
		const element = {
			id: "image-1",
			type: ElementTypeEnum.Image,
			activeContentId: "content-1",
			mainContentId: "content-1",
			contents: [
				{ contentId: "content-1", src: "one.png" },
				{ contentId: "content-2", src: "two.png" },
			],
		} as unknown as LayerElement
		const { canvas, previewContentIds } = createPreviewCanvas(element)
		canvas.permissionManager = {
			can: vi.fn((capability: string) =>
				capability === "document.write" ? canWrite : capability === "document.read",
			),
			setAccessContext: vi.fn(() => true),
			getContext: vi.fn(() => ({ mode: "edit", capabilities: new Set(), can: () => true })),
		} as never
		Object.assign(canvas, {
			mediaPlaybackCoordinator: { pauseAll: vi.fn() },
			cropManager: { cancelCrop: vi.fn() },
			extendManager: { cancelExtend: vi.fn() },
			eraserManager: { cancelEraser: vi.fn() },
			mediaReplaceController: { cancel: vi.fn() },
			elementRenameManager: { cancelRename: vi.fn() },
			toolManager: { setActiveToolByType: vi.fn() },
			selectionManager: { deselectAll: vi.fn() },
		})
		previewContentIds.set(element.id, "content-2")
		canWrite = true

		Canvas.prototype.setAccessContext.call(canvas, { mode: "edit" })

		expect(previewContentIds).toEqual(new Map())
	})
})
