import { describe, expect, it } from "vitest"
import type { CanvasDocument, LayerElement } from "../../canvas/types"
import {
	mergeCanvasDocumentsByElement,
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

function canvas(elements: LayerElement[]): CanvasDocument {
	return { elements }
}

describe("mergeCanvasDocumentsByElement", () => {
	it("merges local and remote changes on different elements", () => {
		const baseCanvas = canvas([rect("local"), rect("remote")])
		const localCanvas = canvas([rect("local", { x: 10 }), rect("remote")])
		const remoteCanvas = canvas([rect("local"), rect("remote", { x: 20 })])

		const result = mergeCanvasDocumentsByElement({ baseCanvas, localCanvas, remoteCanvas })

		expect(result.ok).toBe(true)
		if (!result.ok) return
		const elementsById = new Map(
			result.mergedCanvas.elements?.map((element) => [element.id, element]),
		)
		expect(elementsById.get("local")).toEqual(expect.objectContaining({ id: "local", x: 10 }))
		expect(elementsById.get("remote")).toEqual(expect.objectContaining({ id: "remote", x: 20 }))
	})

	it("returns an element-level conflict when both sides change the same element", () => {
		const baseCanvas = canvas([rect("same")])
		const localCanvas = canvas([rect("same", { x: 10 })])
		const remoteCanvas = canvas([rect("same", { x: 20 })])

		const result = mergeCanvasDocumentsByElement({ baseCanvas, localCanvas, remoteCanvas })

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

		const result = mergeCanvasDocumentsByElement({ baseCanvas, localCanvas, remoteCanvas })

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

		const result = mergeCanvasDocumentsByElement({ baseCanvas, localCanvas, remoteCanvas })

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

	it("returns an element-level conflict when both sides change the same parent structure", () => {
		const baseCanvas = canvas([frame("frame", [])])
		const localCanvas = canvas([frame("frame", [rect("local-new")])])
		const remoteCanvas = canvas([frame("frame", [rect("remote-new")])])

		const result = mergeCanvasDocumentsByElement({ baseCanvas, localCanvas, remoteCanvas })

		expect(result).toEqual(
			expect.objectContaining({
				ok: false,
				isElementLevelConflict: true,
				reason: "parent-structure-conflict",
				conflictElementIds: ["local-new", "remote-new"],
			}),
		)
		if (result.ok || !result.isElementLevelConflict) return
		expect(result.elementConflicts).toEqual([
			expect.objectContaining({
				elementId: "local-new",
				reason: "parent-structure-conflict",
				localElement: expect.objectContaining({ id: "local-new" }),
				remoteElement: null,
			}),
			expect.objectContaining({
				elementId: "remote-new",
				reason: "parent-structure-conflict",
				localElement: null,
				remoteElement: expect.objectContaining({ id: "remote-new" }),
			}),
		])
		expect(result.mergedCanvas?.elements).toEqual([
			expect.objectContaining({
				id: "frame",
				children: [expect.objectContaining({ id: "remote-new" })],
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
})
