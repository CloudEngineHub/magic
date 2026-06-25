import { describe, expect, it } from "vitest"
import type { CanvasDesignDataPatch } from "@/components/CanvasDesign/types"
import type { CanvasDocument, LayerElement } from "@/components/CanvasDesign/canvas/types"
import { applyCanvasDesignDataPatch } from "../canvasDesignDataPatch"

function rect(id: string, zIndex = 1): LayerElement {
	return {
		id,
		type: "rectangle",
		x: 0,
		y: 0,
		width: 100,
		height: 100,
		zIndex,
	}
}

function frame(id: string, children: LayerElement[] = []): LayerElement {
	return {
		id,
		type: "frame",
		x: 0,
		y: 0,
		width: 300,
		height: 200,
		children,
	}
}

function apply(canvas: CanvasDocument, patch: Partial<CanvasDesignDataPatch>): CanvasDocument {
	return applyCanvasDesignDataPatch(canvas, {
		upserts: patch.upserts ?? [],
		deletedElementIds: patch.deletedElementIds ?? [],
		changedElementIds: patch.changedElementIds ?? [],
	})
}

describe("applyCanvasDesignDataPatch", () => {
	it("replaces an existing top-level element without moving its position", () => {
		const canvas = { elements: [rect("a", 1), rect("b", 10)] }

		const next = apply(canvas, {
			upserts: [{ element: { ...rect("a", 20), x: 50 }, parentId: null }],
		})

		expect(next.elements?.map((element) => element.id)).toEqual(["a", "b"])
		expect(next.elements?.[0]).toEqual(expect.objectContaining({ id: "a", x: 50, zIndex: 20 }))
	})

	it("inserts new top-level elements by stable zIndex order", () => {
		const canvas = { elements: [rect("a", 10), rect("b", 30)] }

		const next = apply(canvas, {
			upserts: [{ element: rect("c", 20), parentId: null }],
		})

		expect(next.elements?.map((element) => element.id)).toEqual(["a", "c", "b"])
	})

	it("updates a frame child in place", () => {
		const canvas = { elements: [frame("frame-1", [rect("child-1"), rect("child-2")])] }

		const next = apply(canvas, {
			upserts: [{ element: { ...rect("child-1"), x: 88 }, parentId: "frame-1" }],
		})

		const nextFrame = next.elements?.[0] as LayerElement & { children: LayerElement[] }
		expect(nextFrame.children.map((element) => element.id)).toEqual(["child-1", "child-2"])
		expect(nextFrame.children[0]).toEqual(expect.objectContaining({ id: "child-1", x: 88 }))
	})

	it("moves an element across frames without leaving duplicates", () => {
		const canvas = {
			elements: [frame("frame-a", [rect("child-1")]), frame("frame-b", [])],
		}

		const next = apply(canvas, {
			upserts: [{ element: rect("child-1"), parentId: "frame-b" }],
		})

		const [frameA, frameB] = next.elements as Array<LayerElement & { children: LayerElement[] }>
		expect(frameA.children).toEqual([])
		expect(frameB.children.map((element) => element.id)).toEqual(["child-1"])
	})

	it("deletes nested and top-level elements", () => {
		const canvas = {
			elements: [frame("frame-1", [rect("child-1"), rect("child-2")]), rect("root-1")],
		}

		const next = apply(canvas, {
			deletedElementIds: ["child-1", "root-1"],
		})

		const nextFrame = next.elements?.[0] as LayerElement & { children: LayerElement[] }
		expect(next.elements?.map((element) => element.id)).toEqual(["frame-1"])
		expect(nextFrame.children.map((element) => element.id)).toEqual(["child-2"])
	})
})
