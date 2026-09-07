import { beforeEach, describe, expect, it, vi } from "vitest"
import { CommandHistory } from "../../core/CommandHistory"
import { DomStructureManager } from "../DomStructureManager"
import { findNodeById } from "../../features/domTree"

describe("DomStructureManager clipboard commands", () => {
	let history: CommandHistory
	let manager: DomStructureManager
	let selector: {
		selectElement: ReturnType<typeof vi.fn>
		clearSelection: ReturnType<typeof vi.fn>
	}

	beforeEach(() => {
		document.body.innerHTML = `
			<section id="source"><p>Copied text</p></section>
			<section id="target"></section>
		`
		history = new CommandHistory()
		selector = { selectElement: vi.fn(), clearSelection: vi.fn() }
		manager = new DomStructureManager(history, selector as never)
		manager.getTree()
	})

	it("pastes a copied node repeatedly and supports undo/redo", async () => {
		const sourceId = findNodeId("source")
		const targetId = findNodeId("target")

		manager.copyNode(sourceId)
		await manager.pasteNode(targetId)
		await manager.pasteNode(targetId)

		const target = findNodeById(targetId)
		expect(target.children).toHaveLength(2)
		expect(document.querySelectorAll("#source")).toHaveLength(1)
		expect(document.querySelector("#source-copy")).toBeTruthy()
		expect(document.querySelector("#source-copy-2")).toBeTruthy()
		expect(history.getUndoStackSize()).toBe(2)

		const undo = history.undo()
		expect(undo && manager.restoreCommand(undo)).toBe(true)
		expect(target.children).toHaveLength(1)

		const redo = history.redo()
		expect(redo && manager.applyCommand(redo)).toBe(true)
		expect(target.children).toHaveLength(2)
	})

	it("keeps a cut node restorable through undo and redo", async () => {
		const sourceId = findNodeId("source")

		await manager.cutNode(sourceId)
		expect(document.querySelector("#source")).toBeNull()
		expect(history.getUndoStackSize()).toBe(1)

		const undo = history.undo()
		expect(undo && manager.restoreCommand(undo)).toBe(true)
		expect(document.querySelector("#source")).toBeTruthy()

		const redo = history.redo()
		expect(redo && manager.applyCommand(redo)).toBe(true)
		expect(document.querySelector("#source")).toBeNull()
		expect(document.querySelector("#target")).toBeTruthy()
	})

	it("rejects copying root nodes", () => {
		const rootId = manager.getTree().root.nodeId
		expect(() => manager.copyNode(rootId)).toThrow("根节点不可移动或删除")
	})
})

describe("DomStructureManager move preview", () => {
	let history: CommandHistory
	let manager: DomStructureManager
	let selector: {
		selectElement: ReturnType<typeof vi.fn>
		clearSelection: ReturnType<typeof vi.fn>
	}

	beforeEach(() => {
		document.body.innerHTML = `
			<section id="source">Source</section>
			<section id="middle">Middle</section>
			<section id="last">Last</section>
			<div id="target"><p id="existing">Existing</p></div>
		`
		history = new CommandHistory()
		selector = { selectElement: vi.fn(), clearSelection: vi.fn() }
		manager = new DomStructureManager(history, selector as never)
		manager.getTree()
	})

	it("updates the live DOM without recording history and restores it on cancel", () => {
		const sourceId = findNodeId("source")
		const lastId = findNodeId("last")

		manager.beginMovePreview(sourceId)
		manager.previewMove(sourceId, lastId, "after")

		expect(getBodyElementIds()).toEqual(["middle", "last", "source", "target"])
		expect(history.getUndoStackSize()).toBe(0)

		manager.cancelMovePreview()

		expect(getBodyElementIds()).toEqual(["source", "middle", "last", "target"])
		expect(history.getUndoStackSize()).toBe(0)
	})

	it("uses the current DOM position for repeated previews", () => {
		const sourceId = findNodeId("source")
		const middleId = findNodeId("middle")
		const lastId = findNodeId("last")

		manager.beginMovePreview(sourceId)
		manager.previewMove(sourceId, lastId, "after")
		manager.previewMove(sourceId, middleId, "before")
		manager.previewMove(sourceId, lastId, "after")

		expect(getBodyElementIds()).toEqual(["middle", "last", "source", "target"])
		expect(history.getUndoStackSize()).toBe(0)
	})

	it("keeps the preview session after an invalid stale target", () => {
		document.body.innerHTML = `
			<section id="source"><p id="child">Child</p></section>
			<section id="target"><span id="target-child">Target child</span></section>
			<section id="last">Last</section>
		`
		manager = new DomStructureManager(history, selector as never)
		manager.getTree()

		const sourceId = findNodeId("source")
		const childId = findNodeId("child")
		const targetId = findNodeId("target")
		const lastId = findNodeId("last")

		manager.beginMovePreview(sourceId)
		manager.previewMove(sourceId, targetId, "inside")

		expect(manager.previewMove(sourceId, childId, "before")).toBe(false)
		manager.previewMove(sourceId, lastId, "after")

		expect(getBodyElementIds()).toEqual(["target", "last", "source"])
	})

	it("commits the final preview as one undoable move", () => {
		const sourceId = findNodeId("source")
		const targetId = findNodeId("target")

		manager.beginMovePreview(sourceId)
		manager.previewMove(sourceId, targetId, "inside")
		manager.commitMovePreview()

		expect(
			Array.from(document.getElementById("target")?.children ?? []).map((item) => item.id),
		).toEqual(["existing", "source"])
		expect(history.getUndoStackSize()).toBe(1)
		expect(selector.selectElement).toHaveBeenCalledWith(document.getElementById("source"))

		const undo = history.undo()
		expect(undo && manager.restoreCommand(undo)).toBe(true)
		expect(getBodyElementIds()).toEqual(["source", "middle", "last", "target"])

		const redo = history.redo()
		expect(redo && manager.applyCommand(redo)).toBe(true)
		expect(
			Array.from(document.getElementById("target")?.children ?? []).map((item) => item.id),
		).toEqual(["existing", "source"])
	})

	it("does not record a no-op preview", () => {
		const sourceId = findNodeId("source")
		const middleId = findNodeId("middle")

		manager.beginMovePreview(sourceId)
		manager.previewMove(sourceId, middleId, "before")
		manager.commitMovePreview()

		expect(getBodyElementIds()).toEqual(["source", "middle", "last", "target"])
		expect(history.getUndoStackSize()).toBe(0)
	})
})

function findNodeId(id: string): string {
	const element = document.getElementById(id)
	if (!element) throw new Error(`Missing test element: ${id}`)
	const nodeId = element.getAttribute("data-magic-editor-node-id")
	if (!nodeId) throw new Error(`Missing editor node id: ${id}`)
	return nodeId
}

function getBodyElementIds(): string[] {
	return Array.from(document.body.children).map((element) => element.id)
}
