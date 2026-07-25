import { describe, expect, it } from "vitest"
import type { CanvasConnection, CanvasDocument, LayerElement } from "../types"
import {
	mergeCanvasDocuments,
	refreshCanvasDocumentElementMergeConflictsFromRemote,
} from "../merge"

function rect(id: string, props: Partial<LayerElement> = {}): LayerElement {
	return {
		id,
		type: "rectangle",
		x: 0,
		y: 0,
		width: 100,
		height: 100,
		...props,
	}
}

function image(id: string, props: Partial<LayerElement> = {}): LayerElement {
	return {
		id,
		type: "image",
		x: 0,
		y: 0,
		width: 100,
		height: 100,
		...props,
	} as LayerElement
}

function video(id: string, props: Partial<LayerElement> = {}): LayerElement {
	return {
		id,
		type: "video",
		x: 0,
		y: 0,
		width: 100,
		height: 100,
		...props,
	} as LayerElement
}

function frame(id: string, children: LayerElement[] = [], props: Partial<LayerElement> = {}) {
	return {
		id,
		type: "frame",
		x: 0,
		y: 0,
		width: 300,
		height: 200,
		children,
		...props,
	} as LayerElement
}

function connection(
	id: string,
	sourceElementId = "source",
	targetElementId = "target",
): CanvasConnection {
	return { id, sourceElementId, targetElementId }
}

function canvas(elements: LayerElement[], connections?: CanvasConnection[]): CanvasDocument {
	return connections ? { elements, connections } : { elements }
}

describe("mergeCanvasDocuments", () => {
	it("merges local and remote changes on different elements", () => {
		const baseCanvas = canvas([rect("local"), rect("remote")])
		const localCanvas = canvas([rect("local", { x: 10 }), rect("remote")])
		const remoteCanvas = canvas([rect("local"), rect("remote", { x: 20 })])

		const result = mergeCanvasDocuments({ baseCanvas, localCanvas, remoteCanvas })

		expect(result.ok).toBe(true)
		if (!result.ok) return
		const elementsById = new Map(
			result.mergedCanvas.elements?.map((element) => [element.id, element]),
		)
		expect(elementsById.get("local")).toEqual(expect.objectContaining({ id: "local", x: 10 }))
		expect(elementsById.get("remote")).toEqual(expect.objectContaining({ id: "remote", x: 20 }))
	})

	it("merges local layout fields with remote generation fields on the same element", () => {
		const baseCanvas = canvas([
			image("same", {
				status: "pending",
				src: "./images/base.png",
				generateImageRequest: { prompt: "base" },
			} as Partial<LayerElement>),
		])
		const localCanvas = canvas([
			image("same", {
				x: 10,
				y: 20,
				status: "pending",
				src: "./images/base.png",
				generateImageRequest: { prompt: "base" },
			} as Partial<LayerElement>),
		])
		const remoteCanvas = canvas([
			image("same", {
				status: "completed",
				src: "./images/result.png",
				imageGenerationTaskMeta: {
					type: "generate",
					file_path: "./images/result.png",
				},
				generateImageRequest: {
					prompt: "base",
					reference_images: ["./images/ref.png"],
				},
			} as Partial<LayerElement>),
		])

		const result = mergeCanvasDocuments({ baseCanvas, localCanvas, remoteCanvas })

		expect(result.ok).toBe(true)
		if (!result.ok) return
		expect(result.mergedCanvas.elements).toEqual([
			expect.objectContaining({
				id: "same",
				x: 10,
				y: 20,
				status: "completed",
				src: "./images/result.png",
				imageGenerationTaskMeta: expect.objectContaining({
					file_path: "./images/result.png",
				}),
				generateImageRequest: expect.objectContaining({
					reference_images: ["./images/ref.png"],
				}),
			}),
		])
	})

	it("merges local layout fields with remote video generation request on the same element", () => {
		const baseCanvas = canvas([
			video("same", {
				status: "pending",
				src: "./videos/base.mp4",
				generateVideoRequest: { prompt: "base" },
			} as Partial<LayerElement>),
		])
		const localCanvas = canvas([
			video("same", {
				width: 160,
				height: 90,
				status: "pending",
				src: "./videos/base.mp4",
				generateVideoRequest: { prompt: "base" },
			} as Partial<LayerElement>),
		])
		const remoteCanvas = canvas([
			video("same", {
				status: "completed",
				src: "./videos/result.mp4",
				generateVideoRequest: {
					prompt: "base",
					video_id: "video-task-1",
					inputs: {
						reference_videos: [{ path: "./videos/ref.mp4" }],
					},
				},
			} as Partial<LayerElement>),
		])

		const result = mergeCanvasDocuments({ baseCanvas, localCanvas, remoteCanvas })

		expect(result.ok).toBe(true)
		if (!result.ok) return
		expect(result.mergedCanvas.elements).toEqual([
			expect.objectContaining({
				id: "same",
				width: 160,
				height: 90,
				status: "completed",
				src: "./videos/result.mp4",
				generateVideoRequest: expect.objectContaining({
					video_id: "video-task-1",
					inputs: expect.objectContaining({
						reference_videos: [{ path: "./videos/ref.mp4" }],
					}),
				}),
			}),
		])
	})

	it("returns an element-level conflict when both sides change the same field", () => {
		const baseCanvas = canvas([rect("same")])
		const localCanvas = canvas([rect("same", { x: 10 })])
		const remoteCanvas = canvas([rect("same", { x: 20 })])

		const result = mergeCanvasDocuments({ baseCanvas, localCanvas, remoteCanvas })

		expect(result).toEqual(
			expect.objectContaining({
				ok: false,
				isElementLevelConflict: true,
				reason: "same-element-changed",
				conflictElementIds: ["same"],
			}),
		)
		if (result.ok || !result.isElementLevelConflict) return
		expect(result.elementConflicts).toEqual([
			expect.objectContaining({
				elementId: "same",
				reason: "same-element-changed",
				baseElement: expect.objectContaining({ id: "same", x: 0 }),
				localElement: expect.objectContaining({ id: "same", x: 10 }),
				remoteElement: expect.objectContaining({ id: "same", x: 20 }),
				baseParentId: null,
				localParentId: null,
				remoteParentId: null,
			}),
		])
		expect(result.mergedCanvas?.elements).toEqual([
			expect.objectContaining({ id: "same", x: 20 }),
		])
	})

	it("reports duplicate element ids before attempting a merge", () => {
		const baseCanvas = canvas([rect("a")])
		const localCanvas = canvas([rect("a"), rect("a", { x: 10 })])
		const remoteCanvas = canvas([rect("a")])

		const result = mergeCanvasDocuments({ baseCanvas, localCanvas, remoteCanvas })

		expect(result).toEqual(
			expect.objectContaining({
				ok: false,
				reason: "duplicate-element-id",
				conflictElementIds: ["a"],
			}),
		)
	})

	it("returns an element-level conflict when one side deletes and the other updates", () => {
		const baseCanvas = canvas([rect("target"), rect("local")])
		const localCanvas = canvas([rect("target", { y: 10 }), rect("local", { y: 20 })])
		const remoteCanvas = canvas([rect("local")])

		const result = mergeCanvasDocuments({ baseCanvas, localCanvas, remoteCanvas })

		expect(result).toEqual(
			expect.objectContaining({
				ok: false,
				isElementLevelConflict: true,
				reason: "delete-update-conflict",
				conflictElementIds: ["target"],
			}),
		)
		if (result.ok || !result.isElementLevelConflict) return
		expect(result.elementConflicts).toEqual([
			expect.objectContaining({
				elementId: "target",
				reason: "delete-update-conflict",
				localElement: expect.objectContaining({ id: "target", y: 10 }),
				remoteElement: null,
			}),
		])
		expect(result.mergedCanvas?.elements).toEqual([
			expect.objectContaining({ id: "local", y: 20 }),
		])
	})

	it("merges pure additions under the same parent", () => {
		const baseCanvas = canvas([frame("frame", [])])
		const localCanvas = canvas([frame("frame", [rect("local-new")])])
		const remoteCanvas = canvas([frame("frame", [rect("remote-new")])])

		const result = mergeCanvasDocuments({ baseCanvas, localCanvas, remoteCanvas })

		expect(result.ok).toBe(true)
		if (!result.ok) return
		const mergedFrame = result.mergedCanvas?.elements?.[0] as LayerElement & {
			children?: LayerElement[]
		}
		expect(mergedFrame).toEqual(expect.objectContaining({ id: "frame" }))
		expect(mergedFrame.children?.map((child) => child.id).sort()).toEqual([
			"local-new",
			"remote-new",
		])
	})

	it("returns an element-level conflict when parent structure changes include a move", () => {
		const baseCanvas = canvas([frame("frame", [rect("child")])])
		const localCanvas = canvas([frame("frame", []), rect("child")])
		const remoteCanvas = canvas([frame("frame", [rect("child"), rect("remote-new")])])

		const result = mergeCanvasDocuments({ baseCanvas, localCanvas, remoteCanvas })

		expect(result).toEqual(
			expect.objectContaining({
				ok: false,
				isElementLevelConflict: true,
				reason: "parent-structure-conflict",
				conflictElementIds: ["child", "remote-new"],
			}),
		)
		if (result.ok || !result.isElementLevelConflict) return
		expect(result.elementConflicts).toEqual([
			expect.objectContaining({
				elementId: "child",
				reason: "parent-structure-conflict",
				localParentId: null,
				remoteParentId: "frame",
			}),
			expect.objectContaining({
				elementId: "remote-new",
				reason: "parent-structure-conflict",
				localElement: null,
				remoteElement: expect.objectContaining({ id: "remote-new" }),
			}),
		])
	})

	it("refreshes conflict remote candidates from a newer remote canvas", () => {
		const result = refreshCanvasDocumentElementMergeConflictsFromRemote({
			elementConflicts: [
				{
					elementId: "same",
					reason: "same-element-changed",
					baseElement: rect("same"),
					localElement: rect("same", { y: 10 }),
					remoteElement: rect("same", { x: 20 }),
					baseParentId: null,
					localParentId: null,
					remoteParentId: null,
				},
			],
			remoteCanvas: canvas([rect("same", { x: 30 })]),
		})

		expect(result).toEqual([
			expect.objectContaining({
				elementId: "same",
				localElement: expect.objectContaining({ id: "same", y: 10 }),
				remoteElement: expect.objectContaining({ id: "same", x: 30 }),
				remoteParentId: null,
			}),
		])
	})

	it("merges local and remote connection additions", () => {
		const elements = [rect("source"), rect("target"), rect("other")]
		const baseCanvas = canvas(elements)
		const localCanvas = canvas(elements, [connection("local", "source", "target")])
		const remoteCanvas = canvas(elements, [connection("remote", "target", "other")])

		const result = mergeCanvasDocuments({ baseCanvas, localCanvas, remoteCanvas })

		expect(result.ok).toBe(true)
		if (!result.ok) return
		expect(result.mergedCanvas.connections?.map((item) => item.id).sort()).toEqual([
			"local",
			"remote",
		])
	})

	it("reports duplicate connection ids as a connection-level conflict", () => {
		const elements = [rect("source"), rect("target"), rect("other")]
		const baseCanvas = canvas(elements)
		const localCanvas = canvas(elements, [
			connection("edge", "source", "target"),
			connection("edge", "target", "other"),
		])
		const remoteCanvas = baseCanvas

		const result = mergeCanvasDocuments({ baseCanvas, localCanvas, remoteCanvas })

		expect(result).toEqual(
			expect.objectContaining({
				ok: false,
				isConnectionLevelConflict: true,
				reason: "duplicate-connection-id",
				connectionConflictIds: ["edge"],
				connectionConflicts: [
					expect.objectContaining({
						connectionId: "edge",
						reason: "duplicate-connection-id",
					}),
				],
			}),
		)
	})

	it("applies local connection deletion and update over unchanged remote", () => {
		const elements = [rect("source"), rect("target"), rect("other")]
		const baseCanvas = canvas(elements, [
			connection("delete-me", "source", "target"),
			connection("update-me", "source", "target"),
		])
		const localCanvas = canvas(elements, [connection("update-me", "target", "other")])
		const remoteCanvas = baseCanvas

		const result = mergeCanvasDocuments({ baseCanvas, localCanvas, remoteCanvas })

		expect(result.ok).toBe(true)
		if (!result.ok) return
		expect(result.mergedCanvas.connections).toEqual([
			connection("update-me", "target", "other"),
		])
	})

	it("returns a connection conflict when both sides update the same connection differently", () => {
		const elements = [rect("source"), rect("target"), rect("other")]
		const baseCanvas = canvas(elements, [connection("edge", "source", "target")])
		const localCanvas = canvas(elements, [connection("edge", "target", "other")])
		const remoteCanvas = canvas(elements, [connection("edge", "other", "source")])

		const result = mergeCanvasDocuments({ baseCanvas, localCanvas, remoteCanvas })

		expect(result).toEqual(
			expect.objectContaining({
				ok: false,
				isConnectionLevelConflict: true,
				reason: "same-connection-changed",
				connectionConflictIds: ["edge"],
			}),
		)
	})

	it("returns a connection delete-update conflict", () => {
		const elements = [rect("source"), rect("target"), rect("other")]
		const baseCanvas = canvas(elements, [connection("edge", "source", "target")])
		const localCanvas = canvas(elements)
		const remoteCanvas = canvas(elements, [connection("edge", "target", "other")])

		const result = mergeCanvasDocuments({ baseCanvas, localCanvas, remoteCanvas })

		expect(result).toEqual(
			expect.objectContaining({
				ok: false,
				isConnectionLevelConflict: true,
				reason: "connection-delete-update-conflict",
				connectionConflictIds: ["edge"],
			}),
		)
	})

	it("removes connections whose endpoint is deleted by the element merge", () => {
		const baseCanvas = canvas(
			[rect("source"), rect("target")],
			[connection("edge", "source", "target")],
		)
		const localCanvas = canvas([rect("source")], [connection("edge", "source", "target")])
		const remoteCanvas = baseCanvas

		const result = mergeCanvasDocuments({ baseCanvas, localCanvas, remoteCanvas })

		expect(result.ok).toBe(true)
		if (!result.ok) return
		expect(result.mergedCanvas.connections).toBeUndefined()
	})
})
