import { createEvent, fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { useState } from "react"
import { DOMTreePanel } from "../DOMTreePanel"

const toastMocks = vi.hoisted(() => ({
	success: vi.fn(),
}))

const translationMocks = vi.hoisted(() => ({
	useTranslation: vi.fn(() => ({
		t: (key: string) => key,
	})),
}))

vi.mock("react-i18next", () => ({
	useTranslation: translationMocks.useTranslation,
}))

vi.mock("@/components/base/MagicToaster/utils", () => ({
	default: toastMocks,
}))

function createDataTransfer() {
	return {
		effectAllowed: "",
		dropEffect: "",
		setData: vi.fn(),
		setDragImage: vi.fn(),
	}
}

describe("DOMTreePanel", () => {
	beforeEach(() => {
		vi.clearAllMocks()
	})

	it("expands every node after loading the tree", async () => {
		const getDomTree = vi.fn().mockResolvedValue({
			root: {
				nodeId: "root",
				tagName: "html",
				label: "html",
				children: [
					{
						nodeId: "body",
						tagName: "body",
						label: "body",
						children: [
							{
								nodeId: "section",
								tagName: "section",
								label: "section",
								children: [],
								editable: true,
								canHaveChildren: true,
								canDelete: true,
								canMove: true,
							},
						],
						editable: false,
						canHaveChildren: true,
						canDelete: false,
						canMove: false,
					},
				],
				editable: false,
				canHaveChildren: true,
				canDelete: false,
				canMove: false,
			},
		})
		render(<DOMTreePanel editorRef={{ current: { getDomTree } } as never} visible />)

		await waitFor(() => {
			expect(screen.getByTestId("dom-tree-node-root")).toBeInTheDocument()
			expect(screen.getByTestId("dom-tree-node-body")).toBeInTheDocument()
			expect(screen.getByTestId("dom-tree-node-section")).toBeInTheDocument()
		})
	})

	it("renders a thumbnail beside image-backed nodes", async () => {
		const getDomTree = vi.fn().mockResolvedValue({
			root: {
				nodeId: "root",
				tagName: "body",
				label: "body",
				children: [
					{
						nodeId: "hero",
						tagName: "section",
						label: "section.hero",
						thumbnailUrl: "https://cdn.example.com/hero.webp",
						children: [],
						editable: true,
						canHaveChildren: true,
						canDelete: true,
						canMove: true,
					},
				],
				editable: false,
				canHaveChildren: true,
				canDelete: false,
				canMove: false,
			},
		})

		render(<DOMTreePanel editorRef={{ current: { getDomTree } } as never} visible />)

		const thumbnail = await screen.findByTestId("dom-tree-thumbnail-hero")
		expect(thumbnail.querySelector("img")).toHaveAttribute(
			"src",
			"https://cdn.example.com/hero.webp",
		)
	})

	it("virtualizes a large visible tree", async () => {
		const children = Array.from({ length: 220 }, (_, index) => ({
			nodeId: `node-${index}`,
			tagName: "section",
			label: `section-${index}`,
			children: [],
			editable: true,
			canHaveChildren: true,
			canDelete: true,
			canMove: true,
		}))
		const getDomTree = vi.fn().mockResolvedValue({
			root: {
				nodeId: "root",
				tagName: "body",
				label: "body",
				children,
				editable: false,
				canHaveChildren: true,
				canDelete: false,
				canMove: false,
			},
		})

		render(<DOMTreePanel editorRef={{ current: { getDomTree } } as never} visible />)

		await waitFor(() => expect(screen.getByTestId("dom-tree-virtual-list")).toBeInTheDocument())
		const mountedRows = screen.getAllByRole("treeitem")
		expect(mountedRows.length).toBeLessThan(children.length + 1)
	})

	it("searches nodes and jumps to the selected result", async () => {
		const getDomTree = vi.fn().mockResolvedValue({
			root: {
				nodeId: "body",
				tagName: "body",
				label: "body",
				children: [
					{
						nodeId: "section",
						tagName: "section",
						label: "hero-section",
						selector: "section.hero",
						textContent: "Welcome",
						children: [],
						editable: true,
						canHaveChildren: true,
						canDelete: true,
						canMove: true,
					},
				],
				editable: false,
				canHaveChildren: true,
				canDelete: false,
				canMove: false,
			},
		})
		const selectDomNode = vi.fn().mockResolvedValue(undefined)
		const scrollToDomNode = vi.fn().mockResolvedValue(undefined)

		render(
			<DOMTreePanel
				editorRef={{ current: { getDomTree, selectDomNode, scrollToDomNode } } as never}
				visible
			/>,
		)

		const input = await screen.findByTestId("dom-tree-search-input")
		fireEvent.change(input, { target: { value: "hero" } })

		const result = await screen.findByTestId("dom-tree-search-result-section")
		expect(result).toBeInTheDocument()
		fireEvent.click(result)

		await waitFor(() => {
			expect(selectDomNode).toHaveBeenCalledWith("section")
			expect(scrollToDomNode).toHaveBeenCalledWith("section")
		})
	})

	it("expands collapsed ancestors before jumping to a search result", async () => {
		const getDomTree = vi.fn().mockResolvedValue({
			root: {
				nodeId: "body",
				tagName: "body",
				label: "body",
				children: [
					{
						nodeId: "section",
						tagName: "section",
						label: "hero-section",
						children: [],
						editable: true,
						canHaveChildren: true,
						canDelete: true,
						canMove: true,
					},
				],
				editable: false,
				canHaveChildren: true,
				canDelete: false,
				canMove: false,
			},
		})
		const selectDomNode = vi.fn().mockResolvedValue(undefined)

		render(
			<DOMTreePanel
				editorRef={{ current: { getDomTree, selectDomNode } } as never}
				visible
			/>,
		)

		const children = await screen.findByTestId("dom-tree-children-body")
		fireEvent.click(screen.getByTestId("dom-tree-toggle-body"))
		expect(children).toHaveAttribute("aria-hidden", "true")

		fireEvent.change(await screen.findByTestId("dom-tree-search-input"), {
			target: { value: "hero" },
		})
		fireEvent.click(await screen.findByTestId("dom-tree-search-result-section"))

		await waitFor(() => expect(children).toHaveAttribute("aria-hidden", "false"))
	})

	it("cycles through search results with Enter and Shift+Enter", async () => {
		const getDomTree = vi.fn().mockResolvedValue({
			root: {
				nodeId: "body",
				tagName: "body",
				label: "body",
				children: [
					{
						nodeId: "first",
						tagName: "section",
						label: "item-first",
						children: [],
						editable: true,
						canHaveChildren: true,
						canDelete: true,
						canMove: true,
					},
					{
						nodeId: "second",
						tagName: "section",
						label: "item-second",
						children: [],
						editable: true,
						canHaveChildren: true,
						canDelete: true,
						canMove: true,
					},
				],
				editable: false,
				canHaveChildren: true,
				canDelete: false,
				canMove: false,
			},
		})
		const selectDomNode = vi.fn().mockResolvedValue(undefined)
		const scrollToDomNode = vi.fn().mockResolvedValue(undefined)

		render(
			<DOMTreePanel
				editorRef={{ current: { getDomTree, selectDomNode, scrollToDomNode } } as never}
				visible
			/>,
		)

		const input = await screen.findByTestId("dom-tree-search-input")
		fireEvent.change(input, { target: { value: "item" } })
		await screen.findByTestId("dom-tree-search-result-first")

		fireEvent.keyDown(input, { key: "Enter" })
		await waitFor(() => expect(selectDomNode).toHaveBeenLastCalledWith("second"))
		fireEvent.keyDown(input, { key: "Enter", shiftKey: true })
		await waitFor(() => expect(selectDomNode).toHaveBeenLastCalledWith("first"))
	})

	it("clears the search with the clear button or Escape", async () => {
		const getDomTree = vi.fn().mockResolvedValue({
			root: {
				nodeId: "body",
				tagName: "body",
				label: "body",
				children: [],
				editable: false,
				canHaveChildren: true,
				canDelete: false,
				canMove: false,
			},
		})

		render(<DOMTreePanel editorRef={{ current: { getDomTree } } as never} visible />)
		const input = await screen.findByTestId("dom-tree-search-input")
		fireEvent.change(input, { target: { value: "missing" } })
		expect(
			(await screen.findAllByText("stylePanel.domTree.searchNoResults")).length,
		).toBeGreaterThan(0)

		fireEvent.change(input, { target: { value: "body" } })
		await screen.findByTestId("dom-tree-search-clear")
		fireEvent.click(screen.getByTestId("dom-tree-search-clear"))
		expect(input).toHaveValue("")

		fireEvent.change(input, { target: { value: "body" } })
		fireEvent.keyDown(input, { key: "Escape" })
		expect(input).toHaveValue("")
	})

	it("does not render indent guide lines in a deep virtual tree", async () => {
		let nestedNode: {
			nodeId: string
			tagName: string
			label: string
			children: unknown[]
			editable: boolean
			canHaveChildren: boolean
			canDelete: boolean
			canMove: boolean
		} = {
			nodeId: "node-219",
			tagName: "section",
			label: "section-219",
			children: [],
			editable: true,
			canHaveChildren: true,
			canDelete: true,
			canMove: true,
		}
		for (let index = 218; index >= 0; index -= 1) {
			nestedNode = {
				nodeId: `node-${index}`,
				tagName: "section",
				label: `section-${index}`,
				children: [nestedNode],
				editable: true,
				canHaveChildren: true,
				canDelete: true,
				canMove: true,
			}
		}
		const getDomTree = vi.fn().mockResolvedValue({
			root: {
				nodeId: "root",
				tagName: "body",
				label: "body",
				children: [nestedNode],
				editable: false,
				canHaveChildren: true,
				canDelete: false,
				canMove: false,
			},
		})

		const { container } = render(
			<DOMTreePanel editorRef={{ current: { getDomTree } } as never} visible />,
		)

		await screen.findByTestId("dom-tree-virtual-list")
		const guideLayers = container.querySelectorAll('[data-testid^="dom-tree-indent-guides-"]')

		expect(guideLayers).toHaveLength(0)
	})

	it("skips the recursive tree when an unrelated zoom state changes", async () => {
		const getDomTree = vi.fn().mockResolvedValue({
			root: {
				nodeId: "body",
				tagName: "body",
				label: "body",
				children: [
					{
						nodeId: "section",
						tagName: "section",
						label: "section",
						children: [],
						editable: true,
						canHaveChildren: true,
						canDelete: true,
						canMove: true,
					},
				],
				editable: false,
				canHaveChildren: true,
				canDelete: false,
				canMove: false,
			},
		})
		const editorRef = { current: { getDomTree } } as never
		const onClose = vi.fn()

		function ZoomHarness() {
			const [, setScale] = useState(1)
			return (
				<>
					<button
						type="button"
						data-testid="zoom-trigger"
						onClick={() => setScale((value) => value + 0.1)}
					>
						Zoom
					</button>
					<DOMTreePanel editorRef={editorRef} visible onClose={onClose} />
				</>
			)
		}

		render(<ZoomHarness />)
		await screen.findByTestId("dom-tree-node-section")
		const renderCountAfterLoad = translationMocks.useTranslation.mock.calls.length

		fireEvent.click(screen.getByTestId("zoom-trigger"))
		expect(translationMocks.useTranslation).toHaveBeenCalledTimes(renderCountAfterLoad)
	})

	it("animates child rows when a node is collapsed and expanded", async () => {
		const getDomTree = vi.fn().mockResolvedValue({
			root: {
				nodeId: "root",
				tagName: "html",
				label: "html",
				children: [
					{
						nodeId: "body",
						tagName: "body",
						label: "body",
						children: [
							{
								nodeId: "section",
								tagName: "section",
								label: "section",
								children: [],
								editable: true,
								canHaveChildren: true,
								canDelete: true,
								canMove: true,
							},
						],
						editable: false,
						canHaveChildren: true,
						canDelete: false,
						canMove: false,
					},
				],
				editable: false,
				canHaveChildren: true,
				canDelete: false,
				canMove: false,
			},
		})

		render(<DOMTreePanel editorRef={{ current: { getDomTree } } as never} visible />)

		const children = await screen.findByTestId("dom-tree-children-body")
		expect(children.className).toContain("grid-rows-[1fr]")
		expect(children).toHaveAttribute("aria-hidden", "false")
		expect(children).not.toHaveAttribute("data-inert")

		fireEvent.click(screen.getByTestId("dom-tree-toggle-body"))
		await waitFor(() => expect(children.className).toContain("grid-rows-[0fr]"))
		expect(children).toHaveAttribute("aria-hidden", "true")
		expect(children).toHaveAttribute("data-inert", "true")
		expect(screen.getByTestId("dom-tree-node-section")).toBeInTheDocument()
		fireEvent.keyDown(screen.getByTestId("dom-tree-node-content-body"), { key: "ArrowRight" })
		await waitFor(() => expect(children.className).toContain("grid-rows-[1fr]"))
		fireEvent.keyDown(screen.getByTestId("dom-tree-node-content-body"), { key: "ArrowLeft" })
		await waitFor(() => expect(children.className).toContain("grid-rows-[0fr]"))
		fireEvent.click(screen.getByRole("button", { name: "stylePanel.domTree.refresh" }))
		await waitFor(() => expect(getDomTree).toHaveBeenCalledTimes(2))
		expect(children.className).toContain("grid-rows-[0fr]")

		fireEvent.click(screen.getByTestId("dom-tree-toggle-body"))
		await waitFor(() => expect(children.className).toContain("grid-rows-[1fr]"))
	})

	it("shows a retryable error instead of staying in the loading state when the bridge request fails", async () => {
		const getDomTree = vi.fn().mockRejectedValue(new Error("bridge unavailable"))

		render(<DOMTreePanel editorRef={{ current: { getDomTree } } as never} visible />)

		await waitFor(() => {
			expect(screen.getByTestId("html-dom-tree-load-error")).toBeInTheDocument()
			expect(screen.getByTestId("html-dom-tree-retry-button")).toBeInTheDocument()
		})
		expect(screen.queryByText("stylePanel.domTree.loading")).not.toBeInTheDocument()
	})

	it("uses a separate hover bridge without selecting the node", async () => {
		const getDomTree = vi.fn().mockResolvedValue({
			root: {
				nodeId: "root",
				tagName: "body",
				label: "body",
				children: [
					{
						nodeId: "section",
						tagName: "section",
						label: "section.hero",
						children: [],
						editable: true,
						canHaveChildren: true,
						canDelete: true,
						canMove: true,
					},
				],
				editable: false,
				canHaveChildren: true,
				canDelete: false,
				canMove: false,
			},
		})
		const hoverDomNode = vi.fn().mockResolvedValue(undefined)
		const clearHoveredDomNode = vi.fn().mockResolvedValue(undefined)
		const selectDomNode = vi.fn().mockResolvedValue(undefined)

		render(
			<DOMTreePanel
				editorRef={
					{
						current: { getDomTree, hoverDomNode, clearHoveredDomNode, selectDomNode },
					} as never
				}
				visible
			/>,
		)

		const row = await screen.findByTestId("dom-tree-node-section")
		fireEvent.mouseEnter(row)
		await waitFor(() => expect(hoverDomNode).toHaveBeenCalledWith("section"))
		expect(selectDomNode).not.toHaveBeenCalled()

		fireEvent.mouseLeave(row)
		await waitFor(() => expect(clearHoveredDomNode).toHaveBeenCalled())
	})

	it("shows the current drop placement while dragging", async () => {
		const getDomTree = vi.fn().mockResolvedValue({
			root: {
				nodeId: "root",
				tagName: "body",
				label: "body",
				children: [
					{
						nodeId: "section",
						tagName: "section",
						label: "section.hero",
						children: [],
						editable: true,
						canHaveChildren: true,
						canDelete: true,
						canMove: true,
					},
				],
				editable: false,
				canHaveChildren: true,
				canDelete: false,
				canMove: false,
			},
		})
		const dataTransfer = createDataTransfer()

		render(<DOMTreePanel editorRef={{ current: { getDomTree } } as never} visible />)

		const sourceHandle = await screen.findByTestId("dom-tree-drag-handle-section")
		fireEvent.dragStart(sourceHandle, { dataTransfer })
		expect(dataTransfer.setDragImage).toHaveBeenCalled()
		expect(screen.getByTestId("dom-tree-node-section")).toHaveAttribute("data-dragging", "true")
		expect(screen.getByRole("button", { name: "stylePanel.domTree.refresh" })).toBeDisabled()
		await waitFor(() =>
			expect(screen.getByRole("status")).toHaveTextContent("stylePanel.domTree.dragging"),
		)

		const rootRow = screen.getByTestId("dom-tree-node-root")
		Object.defineProperty(rootRow, "getBoundingClientRect", {
			configurable: true,
			value: () => ({ top: 0, height: 32 }),
		})
		fireEvent.dragOver(rootRow, { clientY: 16, dataTransfer })

		await waitFor(() =>
			expect(screen.getByRole("status")).toHaveTextContent(
				/stylePanel\.domTree\.drop(Before|Inside|After)/,
			),
		)
	})

	it("marks descendants as invalid drop targets", async () => {
		const getDomTree = vi.fn().mockResolvedValue({
			root: {
				nodeId: "body",
				tagName: "body",
				label: "body",
				children: [
					{
						nodeId: "section",
						tagName: "section",
						label: "section.hero",
						children: [
							{
								nodeId: "text",
								tagName: "p",
								label: "p",
								children: [],
								editable: true,
								canHaveChildren: true,
								canDelete: true,
								canMove: true,
							},
						],
						editable: true,
						canHaveChildren: true,
						canDelete: true,
						canMove: true,
					},
				],
				editable: false,
				canHaveChildren: true,
				canDelete: false,
				canMove: false,
			},
		})
		const moveDomNode = vi.fn().mockResolvedValue(undefined)
		const dataTransfer = createDataTransfer()

		render(
			<DOMTreePanel editorRef={{ current: { getDomTree, moveDomNode } } as never} visible />,
		)

		fireEvent.dragStart(await screen.findByTestId("dom-tree-drag-handle-section"), {
			dataTransfer,
		})
		const descendantRow = screen.getByTestId("dom-tree-node-text")
		fireEvent.dragOver(descendantRow, { clientY: 16, dataTransfer })

		await waitFor(() => {
			expect(descendantRow).toHaveAttribute("data-drop-invalid", "true")
			expect(screen.getByRole("status")).toHaveTextContent("stylePanel.domTree.dropInvalid")
		})
		expect(dataTransfer.dropEffect).toBe("none")

		fireEvent.drop(descendantRow, { dataTransfer })
		expect(moveDomNode).not.toHaveBeenCalled()
	})

	it("ignores a drop when the rendered target no longer matches the active target", async () => {
		const getDomTree = vi.fn().mockResolvedValue({
			root: {
				nodeId: "body",
				tagName: "body",
				label: "body",
				children: [
					{
						nodeId: "section",
						tagName: "section",
						label: "section",
						children: [],
						editable: true,
						canHaveChildren: true,
						canDelete: true,
						canMove: true,
					},
					{
						nodeId: "aside",
						tagName: "aside",
						label: "aside",
						children: [],
						editable: true,
						canHaveChildren: true,
						canDelete: true,
						canMove: true,
					},
				],
				editable: false,
				canHaveChildren: true,
				canDelete: false,
				canMove: false,
			},
		})
		const moveDomNode = vi.fn().mockResolvedValue(undefined)
		const dataTransfer = createDataTransfer()

		render(
			<DOMTreePanel editorRef={{ current: { getDomTree, moveDomNode } } as never} visible />,
		)

		fireEvent.dragStart(await screen.findByTestId("dom-tree-drag-handle-section"), {
			dataTransfer,
		})
		const bodyRow = screen.getByTestId("dom-tree-node-body")
		Object.defineProperty(bodyRow, "getBoundingClientRect", {
			configurable: true,
			value: () => ({ top: 0, height: 32 }),
		})
		fireEvent.dragOver(bodyRow, { clientY: 16, dataTransfer })
		await waitFor(() => expect(bodyRow).toHaveAttribute("data-drop-position", "inside"))

		fireEvent.drop(screen.getByTestId("dom-tree-node-aside"), { dataTransfer })
		expect(moveDomNode).not.toHaveBeenCalled()
	})

	it("keeps row actions pinned inside the visible tree width", async () => {
		const getDomTree = vi.fn().mockResolvedValue({
			root: {
				nodeId: "root",
				tagName: "body",
				label: "body",
				children: [
					{
						nodeId: "section",
						tagName: "section",
						label: "section.with-a-very-long-class-name",
						textContent: "A long preview that must not push actions outside the panel",
						children: [],
						editable: true,
						canHaveChildren: true,
						canDelete: true,
						canMove: true,
					},
				],
				editable: false,
				canHaveChildren: true,
				canDelete: false,
				canMove: false,
			},
		})
		render(<DOMTreePanel editorRef={{ current: { getDomTree } } as never} visible />)

		expect(screen.getByTestId("html-dom-tree-panel")).toHaveClass(
			"h-full",
			"border-l",
			"min-h-0",
			"bg-background/95",
		)
		await screen.findByTestId("dom-tree-node-section")
		expect(screen.getByText("stylePanel.domTree.nodeCount")).toHaveClass("rounded-md")
		expect(
			screen
				.getByTestId("html-dom-tree-panel")
				.querySelector('[data-slot="scroll-area-viewport"]'),
		).toHaveClass("bg-muted/10", "pr-4")

		const row = await screen.findByTestId("dom-tree-node-section")
		const actions = screen.getByTestId("dom-tree-actions-section")
		const content = screen.getByTestId("dom-tree-node-content-section")
		expect(row).toHaveClass("w-full", "max-w-full", "overflow-hidden", "pr-1")
		expect(row.className).toContain("grid-cols-[20px_20px_minmax(0,1fr)]")
		expect(content).toHaveClass("items-center", "gap-1")
		expect(actions).toHaveClass(
			"absolute",
			"inset-y-1",
			"right-1",
			"w-max",
			"rounded-md",
			"border",
			"bg-background/95",
			"px-1",
		)
		expect(actions).not.toHaveClass("shadow-xl")
		expect(screen.getByRole("button", { name: "stylePanel.domTree.delete" })).toHaveClass(
			"h-5",
			"w-5",
			"rounded-sm",
		)
	})

	it("keeps the row and hover action surface at a stable height", async () => {
		const getDomTree = vi.fn().mockResolvedValue({
			root: {
				nodeId: "body",
				tagName: "body",
				label: "body",
				children: [
					{
						nodeId: "section",
						tagName: "section",
						label: "section",
						children: [],
						editable: true,
						canHaveChildren: true,
						canDelete: true,
						canMove: true,
					},
				],
				editable: false,
				canHaveChildren: true,
				canDelete: false,
				canMove: false,
			},
		})

		render(<DOMTreePanel editorRef={{ current: { getDomTree } } as never} visible />)

		const row = await screen.findByTestId("dom-tree-node-section")
		const actions = screen.getByTestId("dom-tree-actions-section")
		expect(row).toHaveClass("h-8", "min-h-8", "max-h-8")
		expect(row).toHaveClass("rounded-none")
		expect(screen.getByTestId("dom-tree-toggle-body")).toHaveClass("h-full", "w-5")
		expect(screen.getByTestId("dom-tree-drag-handle-section")).toHaveClass("h-full", "w-5")
		expect(actions).toHaveClass("absolute", "inset-y-1", "w-max", "translate-x-1")
		expect(actions).toHaveClass("rounded-md", "border", "bg-background/95", "px-1")
	})

	it("supports keyboard navigation through visible tree rows", async () => {
		const getDomTree = vi.fn().mockResolvedValue({
			root: {
				nodeId: "body",
				tagName: "body",
				label: "body",
				children: [
					{
						nodeId: "first",
						tagName: "section",
						label: "first",
						children: [],
						editable: true,
						canHaveChildren: true,
						canDelete: true,
						canMove: true,
					},
					{
						nodeId: "second",
						tagName: "section",
						label: "second",
						children: [],
						editable: true,
						canHaveChildren: true,
						canDelete: true,
						canMove: true,
					},
				],
				editable: false,
				canHaveChildren: true,
				canDelete: false,
				canMove: false,
			},
		})

		render(<DOMTreePanel editorRef={{ current: { getDomTree } } as never} visible />)

		const first = await screen.findByTestId("dom-tree-node-content-first")
		const second = screen.getByTestId("dom-tree-node-content-second")
		first.focus()
		fireEvent.keyDown(first, { key: "ArrowDown" })
		expect(second).toHaveFocus()
		fireEvent.keyDown(second, { key: "Home" })
		expect(screen.getByTestId("dom-tree-node-content-body")).toHaveFocus()
	})

	it("shows tooltips for panel and node actions", async () => {
		const getDomTree = vi.fn().mockResolvedValue({
			root: {
				nodeId: "body",
				tagName: "body",
				label: "body",
				children: [
					{
						nodeId: "first",
						tagName: "section",
						label: "first",
						children: [],
						editable: true,
						canHaveChildren: true,
						canDelete: true,
						canMove: true,
					},
					{
						nodeId: "second",
						tagName: "section",
						label: "second",
						children: [],
						editable: true,
						canHaveChildren: true,
						canDelete: true,
						canMove: true,
					},
				],
				editable: false,
				canHaveChildren: true,
				canDelete: false,
				canMove: false,
			},
		})

		render(<DOMTreePanel editorRef={{ current: { getDomTree } } as never} visible />)

		await screen.findByTestId("dom-tree-node-first")
		const refreshButton = await screen.findByRole("button", {
			name: "stylePanel.domTree.refresh",
		})
		fireEvent.focus(refreshButton)
		await screen.findByRole("tooltip")

		const moveDownButton = screen.getAllByRole("button", {
			name: "stylePanel.domTree.moveDown",
		})[0]
		fireEvent.mouseEnter(moveDownButton)
		fireEvent.focus(moveDownButton)
		await waitFor(() =>
			expect(
				screen
					.getAllByRole("tooltip")
					.some((node) => node.textContent?.includes("stylePanel.domTree.moveDown")),
			).toBe(true),
		)
	})

	it("shows node details only after clicking the semantic tag", async () => {
		const getDomTree = vi.fn().mockResolvedValue({
			root: {
				nodeId: "body",
				tagName: "body",
				label: "body",
				children: [
					{
						nodeId: "section",
						tagName: "section",
						label: "section.hero",
						textContent: "Hero content",
						children: [],
						editable: true,
						canHaveChildren: true,
						canDelete: true,
						canMove: true,
					},
				],
				editable: false,
				canHaveChildren: true,
				canDelete: false,
				canMove: false,
			},
		})

		render(<DOMTreePanel editorRef={{ current: { getDomTree } } as never} visible />)

		const tag = await screen.findByTestId("dom-tree-node-tag-section")
		fireEvent.mouseEnter(tag)
		expect(screen.queryByRole("tooltip")).not.toBeInTheDocument()

		fireEvent.click(tag)
		expect(await screen.findByText("section.hero")).toBeInTheDocument()
	})

	it("keeps disabled row actions discoverable through tooltips", async () => {
		const getDomTree = vi.fn().mockResolvedValue({
			root: {
				nodeId: "body",
				tagName: "body",
				label: "body",
				children: [
					{
						nodeId: "first",
						tagName: "section",
						label: "first",
						children: [],
						editable: true,
						canHaveChildren: true,
						canDelete: true,
						canMove: true,
					},
					{
						nodeId: "second",
						tagName: "section",
						label: "second",
						children: [],
						editable: true,
						canHaveChildren: true,
						canDelete: true,
						canMove: true,
					},
				],
				editable: false,
				canHaveChildren: true,
				canDelete: false,
				canMove: false,
			},
		})

		render(<DOMTreePanel editorRef={{ current: { getDomTree } } as never} visible />)

		const moveUpButton = (
			await screen.findAllByRole("button", {
				name: "stylePanel.domTree.moveUp",
			})
		)[0]
		expect(moveUpButton).toBeDisabled()
		const trigger = moveUpButton.parentElement
		expect(trigger).toHaveAttribute("tabindex", "0")
		fireEvent.focus(trigger as HTMLElement)
		await waitFor(() =>
			expect(screen.getByRole("tooltip")).toHaveTextContent("stylePanel.domTree.moveUp"),
		)
	})

	it("shows a tooltip for the add-node action", async () => {
		const getDomTree = vi.fn().mockResolvedValue({
			root: {
				nodeId: "body",
				tagName: "body",
				label: "body",
				children: [
					{
						nodeId: "section",
						tagName: "section",
						label: "section",
						children: [],
						editable: true,
						canHaveChildren: true,
						canDelete: true,
						canMove: true,
					},
				],
				editable: false,
				canHaveChildren: true,
				canDelete: false,
				canMove: false,
			},
		})

		render(<DOMTreePanel editorRef={{ current: { getDomTree } } as never} visible />)

		await screen.findByTestId("dom-tree-node-section")
		const addInsideButton = screen
			.getAllByTestId("dom-tree-add-button")
			.find((element) => element.dataset.nodeId === "section")
		if (!addInsideButton) throw new Error("Missing section add button")
		expect(addInsideButton).toHaveAttribute("data-node-id", "section")
		fireEvent.pointerMove(addInsideButton.parentElement as HTMLElement)
		await waitFor(() =>
			expect(screen.getByRole("tooltip")).toHaveTextContent(
				"stylePanel.domTree.addInsideAction",
			),
		)
	})

	it("intercepts the browser context menu on tree rows", async () => {
		const getDomTree = vi.fn().mockResolvedValue({
			root: {
				nodeId: "body",
				tagName: "body",
				label: "body",
				children: [],
				editable: false,
				canHaveChildren: true,
				canDelete: false,
				canMove: false,
			},
		})

		render(<DOMTreePanel editorRef={{ current: { getDomTree } } as never} visible />)

		const row = await screen.findByTestId("dom-tree-node-body")
		const event = createEvent.contextMenu(row, { clientX: 120, clientY: 80 })
		fireEvent(row, event)

		expect(event.defaultPrevented).toBe(true)
	})

	it("shows structured node actions in the custom context menu", async () => {
		const getDomTree = vi.fn().mockResolvedValue({
			root: {
				nodeId: "body",
				tagName: "body",
				label: "body",
				children: [
					{
						nodeId: "section",
						tagName: "section",
						label: "section.hero",
						selector: "section.hero",
						children: [],
						editable: true,
						canHaveChildren: true,
						canDelete: true,
						canMove: true,
					},
				],
				editable: false,
				canHaveChildren: true,
				canDelete: false,
				canMove: false,
			},
		})
		const duplicateDomNode = vi.fn().mockResolvedValue(undefined)

		render(
			<DOMTreePanel
				editorRef={{ current: { getDomTree, duplicateDomNode } } as never}
				visible
			/>,
		)

		fireEvent.contextMenu(await screen.findByTestId("dom-tree-node-section"), {
			clientX: 120,
			clientY: 80,
		})

		await waitFor(() => {
			expect(screen.getByTestId("dom-tree-context-menu")).toHaveAttribute(
				"data-node-id",
				"section",
			)
			expect(screen.getByTestId("dom-tree-context-menu-select-item")).toHaveAttribute(
				"data-node-id",
				"section",
			)
			expect(screen.getByTestId("dom-tree-context-menu-copy-item")).toBeInTheDocument()
			expect(screen.getByTestId("dom-tree-context-menu-delete-item")).toBeInTheDocument()
			expect(screen.getByText("stylePanel.domTree.reorder")).toBeInTheDocument()
			expect(screen.getByText("stylePanel.domTree.duplicateNode")).toBeInTheDocument()
			expect(screen.getByText("stylePanel.domTree.insert")).toBeInTheDocument()
			expect(screen.getByText("stylePanel.domTree.delete")).toBeInTheDocument()
		})
		fireEvent.click(screen.getByTestId("dom-tree-context-menu-insert-trigger"))
		await waitFor(() => {
			expect(screen.getByTestId("dom-tree-context-menu-insert-content")).toHaveAttribute(
				"data-node-id",
				"section",
			)
			expect(
				screen.getByTestId("dom-tree-context-menu-add-text-inside-item"),
			).toHaveAttribute("data-node-id", "section")
			expect(screen.getByText("stylePanel.domTree.insertBefore")).toBeInTheDocument()
			expect(screen.getByText("stylePanel.domTree.insertInside")).toBeInTheDocument()
			expect(screen.getByText("stylePanel.domTree.insertAfter")).toBeInTheDocument()
		})
		expect(
			screen.getAllByRole("menu").some((menu) => menu.classList.contains("!z-[10070]")),
		).toBe(true)
		fireEvent.click(screen.getByTestId("dom-tree-context-menu-duplicate-item"))
		await waitFor(() => expect(duplicateDomNode).toHaveBeenCalledWith("section"))
	})

	it("offers sibling insertion without an inside option for void nodes", async () => {
		const getDomTree = vi.fn().mockResolvedValue({
			root: {
				nodeId: "body",
				tagName: "body",
				label: "body",
				children: [
					{
						nodeId: "image",
						tagName: "img",
						label: "img",
						selector: "img",
						children: [],
						editable: true,
						canHaveChildren: false,
						canDelete: true,
						canMove: true,
					},
				],
				editable: false,
				canHaveChildren: true,
				canDelete: false,
				canMove: false,
			},
		})

		render(<DOMTreePanel editorRef={{ current: { getDomTree } } as never} visible />)

		fireEvent.contextMenu(await screen.findByTestId("dom-tree-node-image"), {
			clientX: 120,
			clientY: 80,
		})

		await screen.findByText("stylePanel.domTree.insert")
		fireEvent.click(screen.getByText("stylePanel.domTree.insert"))
		expect(await screen.findByText("stylePanel.domTree.insertBefore")).toBeInTheDocument()
		expect(screen.getByText("stylePanel.domTree.insertAfter")).toBeInTheDocument()
		expect(screen.queryByText("stylePanel.domTree.insertInside")).not.toBeInTheDocument()
	})

	it("opens the context menu without selecting the node", async () => {
		const getDomTree = vi.fn().mockResolvedValue({
			root: {
				nodeId: "body",
				tagName: "body",
				label: "body",
				children: [
					{
						nodeId: "section",
						tagName: "section",
						label: "section.hero",
						selector: "section.hero",
						children: [],
						editable: true,
						canHaveChildren: true,
						canDelete: true,
						canMove: true,
					},
				],
				editable: false,
				canHaveChildren: true,
				canDelete: false,
				canMove: false,
			},
		})
		const selectDomNode = vi.fn().mockResolvedValue(undefined)
		const scrollToDomNode = vi.fn().mockResolvedValue(undefined)

		render(
			<DOMTreePanel
				editorRef={
					{
						current: { getDomTree, selectDomNode, scrollToDomNode },
					} as never
				}
				visible
			/>,
		)

		fireEvent.contextMenu(await screen.findByTestId("dom-tree-node-section"), {
			clientX: 120,
			clientY: 80,
		})

		await waitFor(() => {
			expect(screen.getByText("stylePanel.domTree.reorder")).toBeInTheDocument()
		})
		expect(selectDomNode).not.toHaveBeenCalled()
		expect(scrollToDomNode).not.toHaveBeenCalled()
	})

	it("uses an editor dialog for adding text instead of a browser prompt", async () => {
		const getDomTree = vi.fn().mockResolvedValue({
			root: {
				nodeId: "body",
				tagName: "body",
				label: "body",
				children: [
					{
						nodeId: "section",
						tagName: "section",
						label: "section.hero",
						selector: "section.hero",
						children: [],
						editable: true,
						canHaveChildren: true,
						canDelete: true,
						canMove: true,
					},
				],
				editable: false,
				canHaveChildren: true,
				canDelete: false,
				canMove: false,
			},
		})
		const insertTextNode = vi.fn().mockResolvedValue(undefined)

		render(
			<DOMTreePanel
				editorRef={{ current: { getDomTree, insertTextNode } } as never}
				visible
			/>,
		)

		const sectionRow = await screen.findByTestId("dom-tree-node-section")
		const addButton = screen
			.getAllByTestId("dom-tree-add-button")
			.find((element) => element.dataset.nodeId === "section")
		if (!addButton) throw new Error("Missing section add button")
		fireEvent.mouseEnter(sectionRow)
		fireEvent.click(addButton)
		expect(await screen.findByTestId("dom-tree-add-menu")).toHaveAttribute(
			"data-node-id",
			"section",
		)
		fireEvent.click(await screen.findByTestId("dom-tree-add-text-inside-item"))

		const dialog = await screen.findByTestId("html-dom-tree-add-text-dialog")
		const input = screen.getByTestId("html-dom-tree-add-text-input")
		expect(screen.getByTestId("html-dom-tree-add-text-cancel-button")).toBeInTheDocument()
		expect(screen.getByTestId("html-dom-tree-add-text-confirm-button")).toBeInTheDocument()
		fireEvent.change(input, { target: { value: "New content" } })
		fireEvent.submit(input.closest("form") as HTMLFormElement)

		await waitFor(() =>
			expect(insertTextNode).toHaveBeenCalledWith("section", "New content", undefined),
		)
		expect(dialog).not.toBeVisible()
	})

	it("shows the sibling insertion button in the hover action bar", async () => {
		const getDomTree = vi.fn().mockResolvedValue({
			root: {
				nodeId: "body",
				tagName: "body",
				label: "body",
				children: [
					{
						nodeId: "section",
						tagName: "section",
						label: "section.hero",
						selector: "section.hero",
						children: [],
						editable: true,
						canHaveChildren: true,
						canDelete: true,
						canMove: true,
					},
				],
				editable: false,
				canHaveChildren: true,
				canDelete: false,
				canMove: false,
			},
		})

		render(<DOMTreePanel editorRef={{ current: { getDomTree } } as never} visible />)

		const actions = await screen.findByTestId("dom-tree-actions-section")
		expect(
			within(actions).getByRole("button", {
				name: "stylePanel.domTree.addInsideAction",
			}),
		).toBeInTheDocument()
		expect(
			within(actions).getByRole("button", {
				name: "stylePanel.domTree.addSiblingAction",
			}),
		).toBeInTheDocument()
	})

	it("uses an editor dialog before deleting a subtree", async () => {
		const getDomTree = vi.fn().mockResolvedValue({
			root: {
				nodeId: "body",
				tagName: "body",
				label: "body",
				children: [
					{
						nodeId: "section",
						tagName: "section",
						label: "section.hero",
						selector: "section.hero",
						children: [
							{
								nodeId: "title",
								tagName: "h1",
								label: "h1",
								children: [],
								editable: true,
								canHaveChildren: true,
								canDelete: true,
								canMove: true,
							},
						],
						editable: true,
						canHaveChildren: true,
						canDelete: true,
						canMove: true,
					},
				],
				editable: false,
				canHaveChildren: true,
				canDelete: false,
				canMove: false,
			},
		})
		const deleteElement = vi.fn().mockResolvedValue(undefined)

		render(
			<DOMTreePanel
				editorRef={{ current: { getDomTree, deleteElement } } as never}
				visible
			/>,
		)

		const sectionActions = await screen.findByTestId("dom-tree-actions-section")
		fireEvent.click(
			within(sectionActions).getByRole("button", {
				name: "stylePanel.domTree.delete",
			}),
		)
		const dialog = await screen.findByTestId("html-dom-tree-delete-dialog")
		expect(dialog).toHaveTextContent("stylePanel.domTree.deleteDialog.description")
		expect(screen.getByTestId("html-dom-tree-delete-cancel-button")).toBeInTheDocument()
		fireEvent.click(screen.getByTestId("html-dom-tree-delete-confirm-button"))

		await waitFor(() => expect(deleteElement).toHaveBeenCalledWith("section.hero"))
	})

	it("supports copy, cut, paste, duplicate, and delete shortcuts on the focused node", async () => {
		const getDomTree = vi.fn().mockResolvedValue({
			root: {
				nodeId: "body",
				tagName: "body",
				label: "body",
				children: [
					{
						nodeId: "section",
						tagName: "section",
						label: "section.hero",
						selector: "section.hero",
						children: [],
						editable: true,
						canHaveChildren: true,
						canDelete: true,
						canMove: true,
					},
				],
				editable: false,
				canHaveChildren: true,
				canDelete: false,
				canMove: false,
			},
		})
		const copyDomNode = vi.fn().mockResolvedValue(undefined)
		const cutDomNode = vi.fn().mockResolvedValue(undefined)
		const pasteDomNode = vi.fn().mockResolvedValue(undefined)
		const duplicateDomNode = vi.fn().mockResolvedValue(undefined)
		const deleteElement = vi.fn().mockResolvedValue(undefined)

		render(
			<DOMTreePanel
				editorRef={
					{
						current: {
							getDomTree,
							copyDomNode,
							cutDomNode,
							pasteDomNode,
							duplicateDomNode,
							deleteElement,
						},
					} as never
				}
				visible
			/>,
		)

		const node = await screen.findByTestId("dom-tree-node-content-section")
		node.focus()
		fireEvent.keyDown(node, { key: "c", ctrlKey: true })
		await waitFor(() => expect(copyDomNode).toHaveBeenCalledWith("section"))
		expect(toastMocks.success).toHaveBeenCalledWith("stylePanel.domTree.copySuccess")

		fireEvent.keyDown(node, { key: "x", ctrlKey: true })
		await waitFor(() => expect(cutDomNode).toHaveBeenCalledWith("section"))
		expect(toastMocks.success).toHaveBeenCalledWith("stylePanel.domTree.cutSuccess")

		fireEvent.keyDown(node, { key: "v", ctrlKey: true })
		await waitFor(() => expect(pasteDomNode).toHaveBeenCalledWith("section", undefined))
		expect(toastMocks.success).toHaveBeenCalledWith("stylePanel.domTree.pasteSuccess")

		fireEvent.keyDown(node, { key: "d", ctrlKey: true })
		await waitFor(() => expect(duplicateDomNode).toHaveBeenCalledWith("section"))

		fireEvent.keyDown(node, { key: "Delete" })
		await waitFor(() => expect(deleteElement).toHaveBeenCalledWith("section.hero"))
	})

	it("shows shortcut hints for clipboard and delete actions in the context menu", async () => {
		const getDomTree = vi.fn().mockResolvedValue({
			root: {
				nodeId: "body",
				tagName: "body",
				label: "body",
				children: [
					{
						nodeId: "section",
						tagName: "section",
						label: "section.hero",
						selector: "section.hero",
						children: [],
						editable: true,
						canHaveChildren: true,
						canDelete: true,
						canMove: true,
					},
				],
				editable: false,
				canHaveChildren: true,
				canDelete: false,
				canMove: false,
			},
		})

		render(<DOMTreePanel editorRef={{ current: { getDomTree } } as never} visible />)
		fireEvent.contextMenu(await screen.findByTestId("dom-tree-node-section"), {
			clientX: 120,
			clientY: 80,
		})

		const menu = await screen.findByRole("menu")
		const shortcutTexts = Array.from(
			menu.querySelectorAll<HTMLElement>("[data-slot='context-menu-shortcut']"),
		).map((element) => element.textContent)
		expect(shortcutTexts).toEqual(
			expect.arrayContaining([
				"CtrlC",
				"CtrlX",
				"CtrlV",
				"CtrlD",
				"stylePanel.domTree.shortcutDelete",
			]),
		)
	})

	it("still selects the node on a primary click", async () => {
		const getDomTree = vi.fn().mockResolvedValue({
			root: {
				nodeId: "body",
				tagName: "body",
				label: "body",
				children: [
					{
						nodeId: "section",
						tagName: "section",
						label: "section.hero",
						selector: "section.hero",
						children: [],
						editable: true,
						canHaveChildren: true,
						canDelete: true,
						canMove: true,
					},
				],
				editable: false,
				canHaveChildren: true,
				canDelete: false,
				canMove: false,
			},
		})
		const selectDomNode = vi.fn().mockResolvedValue(undefined)
		const scrollToDomNode = vi.fn().mockResolvedValue(undefined)

		render(
			<DOMTreePanel
				editorRef={
					{
						current: { getDomTree, selectDomNode, scrollToDomNode },
					} as never
				}
				visible
			/>,
		)

		fireEvent.click(await screen.findByTestId("dom-tree-node-content-section"))

		await waitFor(() => {
			expect(selectDomNode).toHaveBeenCalledWith("section")
			expect(scrollToDomNode).toHaveBeenCalledWith("section")
		})
	})

	it("selects the node when clicking its indentation area", async () => {
		const getDomTree = vi.fn().mockResolvedValue({
			root: {
				nodeId: "body",
				tagName: "body",
				label: "body",
				children: [
					{
						nodeId: "section",
						tagName: "section",
						label: "section.hero",
						selector: "section.hero",
						children: [],
						editable: true,
						canHaveChildren: true,
						canDelete: true,
						canMove: true,
					},
				],
				editable: false,
				canHaveChildren: true,
				canDelete: false,
				canMove: false,
			},
		})
		const selectDomNode = vi.fn().mockResolvedValue(undefined)
		const scrollToDomNode = vi.fn().mockResolvedValue(undefined)

		render(
			<DOMTreePanel
				editorRef={{ current: { getDomTree, selectDomNode, scrollToDomNode } } as never}
				visible
			/>,
		)

		fireEvent.click(await screen.findByTestId("dom-tree-node-section"))

		await waitFor(() => {
			expect(selectDomNode).toHaveBeenCalledWith("section")
			expect(scrollToDomNode).toHaveBeenCalledWith("section")
		})
	})

	it("allows selecting the body while keeping root operations disabled", async () => {
		const getDomTree = vi.fn().mockResolvedValue({
			root: {
				nodeId: "body",
				tagName: "body",
				label: "body",
				selector: "body",
				children: [],
				editable: false,
				canHaveChildren: true,
				canDelete: false,
				canMove: false,
			},
		})
		const selectDomNode = vi.fn().mockResolvedValue(undefined)
		const scrollToDomNode = vi.fn().mockResolvedValue(undefined)

		render(
			<DOMTreePanel
				editorRef={{ current: { getDomTree, selectDomNode, scrollToDomNode } } as never}
				visible
			/>,
		)

		fireEvent.click(await screen.findByTestId("dom-tree-node-content-body"))

		await waitFor(() => {
			expect(selectDomNode).toHaveBeenCalledWith("body")
			expect(scrollToDomNode).toHaveBeenCalledWith("body")
		})
		expect(
			screen.queryByRole("button", { name: "stylePanel.domTree.delete" }),
		).not.toBeInTheDocument()
	})

	it("keeps raw DOM details inside the node tooltip", async () => {
		const getDomTree = vi.fn().mockResolvedValue({
			root: {
				nodeId: "body",
				tagName: "body",
				label: "body",
				children: [
					{
						nodeId: "section",
						tagName: "section",
						label: "section.hero",
						selector: "body > section.hero",
						children: [],
						editable: true,
						canHaveChildren: true,
						canDelete: true,
						canMove: true,
					},
				],
				editable: false,
				canHaveChildren: true,
				canDelete: false,
				canMove: false,
			},
		})

		render(<DOMTreePanel editorRef={{ current: { getDomTree } } as never} visible />)

		const content = await screen.findByTestId("dom-tree-node-content-section")
		const tag = screen.getByTestId("dom-tree-node-tag-section")
		expect(screen.queryByText("section.hero")).not.toBeInTheDocument()
		fireEvent.focus(content)
		await new Promise((resolve) => setTimeout(resolve, 20))
		expect(screen.queryByRole("tooltip")).not.toBeInTheDocument()
		fireEvent.click(tag)
		await waitFor(() => {
			expect(screen.getByText("section.hero")).toBeInTheDocument()
			expect(screen.getByText("body > section.hero")).toBeInTheDocument()
		})
	})

	it("reflects the canvas selection in the matching tree row", async () => {
		const getDomTree = vi.fn().mockResolvedValue({
			root: {
				nodeId: "body",
				tagName: "body",
				label: "body",
				selector: "body",
				children: [
					{
						nodeId: "section",
						tagName: "section",
						label: "section.hero",
						selector: "section.hero",
						children: [],
						editable: true,
						canHaveChildren: true,
						canDelete: true,
						canMove: true,
					},
				],
				editable: false,
				canHaveChildren: true,
				canDelete: false,
				canMove: false,
			},
		})

		render(
			<DOMTreePanel
				editorRef={{ current: { getDomTree } } as never}
				selectedSelector="section.hero"
				visible
			/>,
		)

		await waitFor(() =>
			expect(screen.getByTestId("dom-tree-node-section")).toHaveAttribute(
				"aria-selected",
				"true",
			),
		)
		const selectedRow = screen.getByTestId("dom-tree-node-section")
		expect(selectedRow).toHaveClass(
			"border-sky-400/70",
			"bg-sky-50/80",
			"shadow-[inset_2px_0_0_rgb(14_165_233),inset_0_0_0_1px_rgb(14_165_233_/_0.18)]",
		)
		expect(selectedRow).not.toHaveClass("border-black", "border-l-2")
	})
})
