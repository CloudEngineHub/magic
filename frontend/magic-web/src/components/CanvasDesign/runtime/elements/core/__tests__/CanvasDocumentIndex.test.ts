import { describe, expect, it } from "vitest"
import type { LayerElement } from "../../../document/types"
import type { BaseElement } from "../BaseElement"
import { CanvasDocumentIndex } from "../CanvasDocumentIndex"

function createElement(data: LayerElement): BaseElement {
	return {
		getData: () => data,
	} as unknown as BaseElement
}

describe("CanvasDocumentIndex", () => {
	it("indexes root elements and direct parents", () => {
		const child: LayerElement = { id: "child", type: "image", x: 0, y: 0 }
		const frame: LayerElement = {
			id: "frame",
			type: "frame",
			children: [child],
		}
		const root: LayerElement = { id: "root", type: "image", x: 100, y: 100 }
		const elements = new Map<string, BaseElement>([
			["frame", createElement(frame)],
			["child", createElement(child)],
			["root", createElement(root)],
		])
		const index = new CanvasDocumentIndex()

		expect(index.getRootElementIds(elements)).toEqual(["frame", "root"])
		expect(index.getParentId(elements, "child")).toBe("frame")
		expect(index.hasParent(elements, "child")).toBe(true)
		expect(index.hasParent(elements, "root")).toBe(false)
		expect(index.getChildIds(elements, "frame")).toEqual(["child"])
	})

	it("rebuilds after topology changes are marked dirty", () => {
		let child: LayerElement = { id: "child", type: "image", x: 0, y: 0 }
		let frame: LayerElement = {
			id: "frame",
			type: "frame",
			children: [child],
		}
		const elements = new Map<string, BaseElement>([
			["frame", createElement(frame)],
			["child", createElement(child)],
		])
		const index = new CanvasDocumentIndex()

		expect(index.getParentId(elements, "child")).toBe("frame")

		child = { ...child, x: 300 }
		frame = { ...frame, children: [] }
		elements.set("frame", createElement(frame))
		elements.set("child", createElement(child))
		index.markDirty()

		expect(index.getParentId(elements, "child")).toBeUndefined()
		expect(index.getRootElementIds(elements)).toEqual(["frame", "child"])
	})

	it("keeps first parent wins semantics and ignores missing child instances", () => {
		const sharedChild: LayerElement = { id: "shared", type: "image", x: 0, y: 0 }
		const firstFrame: LayerElement = {
			id: "first-frame",
			type: "frame",
			children: [sharedChild, { id: "missing", type: "image" }],
		}
		const secondFrame: LayerElement = {
			id: "second-frame",
			type: "frame",
			children: [sharedChild],
		}
		const elements = new Map<string, BaseElement>([
			["first-frame", createElement(firstFrame)],
			["second-frame", createElement(secondFrame)],
			["shared", createElement(sharedChild)],
		])
		const index = new CanvasDocumentIndex()

		expect(index.getParentId(elements, "shared")).toBe("first-frame")
		expect(index.getParentId(elements, "missing")).toBeUndefined()
		expect(index.getChildIds(elements, "first-frame")).toEqual(["shared"])
	})
})
