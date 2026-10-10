import { describe, expect, it } from "vitest"
import {
	markSourceNode,
	markSourceNodes,
	removeRuntimeNodes,
	SOURCE_NODE_ATTRIBUTE,
} from "../sourceNodes"

describe("sourceNodes", () => {
	it("keeps editor-inserted subtrees when runtime nodes are removed", () => {
		document.body.innerHTML = "<section><p>Fixed</p></section>"
		markSourceNodes(document)

		const inserted = document.createElement("div")
		inserted.innerHTML = "<img src='./images/inserted.png' />"
		document.querySelector("section")?.appendChild(inserted)
		markSourceNode(inserted)

		removeRuntimeNodes(document)

		expect(document.querySelector("img")).toBe(inserted.firstElementChild)
		expect(inserted.hasAttribute(SOURCE_NODE_ATTRIBUTE)).toBe(true)
		expect(inserted.firstElementChild?.hasAttribute(SOURCE_NODE_ATTRIBUTE)).toBe(true)
	})
})
