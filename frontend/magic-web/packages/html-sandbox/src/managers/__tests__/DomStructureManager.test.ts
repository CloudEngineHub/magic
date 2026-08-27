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

function findNodeId(id: string): string {
	const element = document.getElementById(id)
	if (!element) throw new Error(`Missing test element: ${id}`)
	const nodeId = element.getAttribute("data-magic-editor-node-id")
	if (!nodeId) throw new Error(`Missing editor node id: ${id}`)
	return nodeId
}
