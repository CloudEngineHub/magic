import { Node } from "@tiptap/core"
import { act, render, waitFor } from "@testing-library/react"
import { createRef } from "react"
import { describe, expect, it, vi } from "vitest"
import MessageEditor, {
	resolveMentionInsertionRange,
	type MessageEditorRef,
} from "../MessageEditor"
import { createReferenceResourcePanelItemFromPath } from "../reference-assets/createReferenceResourcePanelItem"
import { createCanvasMentionPathMatcher } from "../../connection/linkedMediaMentionMatcher"

const TestMentionExtension = Node.create({
	name: "mention",
	group: "inline",
	inline: true,
	atom: true,
	addAttributes() {
		return {
			type: { default: null },
			data: { default: null },
		}
	},
	parseHTML() {
		return [{ tag: "span[data-test-mention]" }]
	},
	renderHTML() {
		return ["span", { "data-test-mention": "" }]
	},
})

function expectCollapsedSelectionInside(editorDom: HTMLElement) {
	expect(document.activeElement).toBe(editorDom)
	const selection = window.getSelection()
	expect(selection?.isCollapsed).toBe(true)
	expect(selection?.anchorNode).not.toBeNull()
	expect(editorDom.contains(selection?.anchorNode ?? null)).toBe(true)
}

describe("MessageEditor mention synchronization", () => {
	it("reports mentions that were already parsed during editor initialization", async () => {
		const onMentionChange = vi.fn()

		render(
			<MessageEditor
				value="@linked.png"
				matchableItems={[{ name: "linked.png", path: "./images/linked.png" }]}
				mentionExtension={TestMentionExtension}
				onMentionChange={onMentionChange}
			/>,
		)

		await waitFor(() => {
			expect(onMentionChange).toHaveBeenCalledWith(
				["./images/linked.png"],
				"@linked.png",
				expect.objectContaining({ source: "sync", status: "ready" }),
			)
		})
	})

	it("keeps mention synchronization pending until external items are ready", async () => {
		const onMentionChange = vi.fn()
		const { rerender } = render(
			<MessageEditor
				value="@linked.png"
				matchableItems={[{ name: "linked.png", path: "./images/linked.png" }]}
				mentionExtension={TestMentionExtension}
				mentionItemsReady={false}
				onMentionChange={onMentionChange}
			/>,
		)

		await waitFor(() => {
			expect(onMentionChange).toHaveBeenCalledWith(
				["./images/linked.png"],
				"@linked.png",
				expect.objectContaining({ source: "sync", status: "pending" }),
			)
		})
		expect(onMentionChange.mock.calls.some(([, , context]) => context.status === "ready")).toBe(
			false,
		)

		rerender(
			<MessageEditor
				value="@linked.png"
				matchableItems={[{ name: "linked.png", path: "./images/linked.png" }]}
				mentionExtension={TestMentionExtension}
				mentionItemsReady
				onMentionChange={onMentionChange}
			/>,
		)

		await waitFor(() => {
			expect(onMentionChange).toHaveBeenCalledWith(
				["./images/linked.png"],
				"@linked.png",
				expect.objectContaining({ source: "sync", status: "ready" }),
			)
		})
	})

	it("does not emit duplicate ready snapshots when only matchable item identity changes", async () => {
		const onMentionChange = vi.fn()
		const { rerender } = render(
			<MessageEditor
				value="@linked.png"
				matchableItems={[{ name: "linked.png", path: "./images/linked.png" }]}
				mentionExtension={TestMentionExtension}
				onMentionChange={onMentionChange}
			/>,
		)

		await waitFor(() => {
			expect(
				onMentionChange.mock.calls.filter(([, , context]) => context.status === "ready"),
			).toHaveLength(1)
		})

		rerender(
			<MessageEditor
				value="@linked.png"
				matchableItems={[{ name: "linked.png", path: "./images/linked.png" }]}
				mentionExtension={TestMentionExtension}
				onMentionChange={onMentionChange}
			/>,
		)
		await act(async () => {
			await Promise.resolve()
			await Promise.resolve()
		})

		expect(
			onMentionChange.mock.calls.filter(([, , context]) => context.status === "ready"),
		).toHaveLength(1)
	})

	it("restores a collapsed editor caret after imperative mention insertion and removal", async () => {
		const editorRef = createRef<MessageEditorRef>()

		const { container } = render(
			<MessageEditor ref={editorRef} value="" mentionExtension={TestMentionExtension} />,
		)

		await waitFor(() => expect(editorRef.current).not.toBeNull())
		const editorDom = container.querySelector<HTMLElement>("[contenteditable='true']")
		expect(editorDom).not.toBeNull()
		const outsideButton = document.createElement("button")
		document.body.append(outsideButton)
		vi.useFakeTimers()

		try {
			outsideButton.focus()
			act(() => {
				expect(
					editorRef.current?.insertMentionItem(
						createReferenceResourcePanelItemFromPath(
							"./images/source.png",
							"source.png",
						),
						{ replaceSelection: false },
					),
				).toBe(true)
			})
			expect(editorRef.current?.getCurrentPrompt()).toContain("@source.png")
			act(() => vi.runOnlyPendingTimers())
			expectCollapsedSelectionInside(editorDom as HTMLElement)

			outsideButton.focus()
			act(() => {
				expect(
					editorRef.current?.removeMentionItems(
						createCanvasMentionPathMatcher("/images/source.png"),
					),
				).toBe(true)
			})
			expect(editorRef.current?.getCurrentPrompt()).not.toContain("@source.png")
			act(() => vi.runOnlyPendingTimers())
			expectCollapsedSelectionInside(editorDom as HTMLElement)
		} finally {
			vi.clearAllTimers()
			vi.useRealTimers()
			outsideButton.remove()
		}
	})

	it("does not add lines after repeated select-style insert and remove cycles", async () => {
		const editorRef = createRef<MessageEditorRef>()

		render(<MessageEditor ref={editorRef} value="" mentionExtension={TestMentionExtension} />)
		await waitFor(() => expect(editorRef.current).not.toBeNull())
		vi.useFakeTimers()

		try {
			for (let cycle = 0; cycle < 3; cycle += 1) {
				act(() => {
					expect(
						editorRef.current?.insertMentionItem(
							createReferenceResourcePanelItemFromPath(
								"./images/source.png",
								"source.png",
							),
							{ replaceSelection: false },
						),
					).toBe(true)
				})
				expect(editorRef.current?.getCurrentPrompt()).toBe("@source.png")

				act(() => {
					expect(
						editorRef.current?.removeMentionItems(
							createCanvasMentionPathMatcher("images/source.png"),
						),
					).toBe(true)
				})
				expect(editorRef.current?.getCurrentPrompt()).toBe("")
				vi.clearAllTimers()
			}
		} finally {
			vi.clearAllTimers()
			vi.useRealTimers()
		}
	})

	it("replaces mentions through an equivalent canvas resource path", async () => {
		const editorRef = createRef<MessageEditorRef>()

		const { container } = render(
			<MessageEditor ref={editorRef} value="" mentionExtension={TestMentionExtension} />,
		)
		await waitFor(() => expect(editorRef.current).not.toBeNull())
		const editorDom = container.querySelector<HTMLElement>("[contenteditable='true']")
		expect(editorDom).not.toBeNull()
		const outsideButton = document.createElement("button")
		document.body.append(outsideButton)
		vi.useFakeTimers()

		try {
			act(() => {
				editorRef.current?.insertMentionItem(
					createReferenceResourcePanelItemFromPath("./images/source.png", "source.png"),
				)
			})
			act(() => {
				expect(
					editorRef.current?.replaceMentionItems(
						createCanvasMentionPathMatcher("/images/source.png"),
						createReferenceResourcePanelItemFromPath(
							"images/updated.png",
							"updated.png",
						),
					),
				).toBe(true)
			})

			expect(editorRef.current?.getCurrentPrompt()).toBe("@updated.png")
			outsideButton.focus()
			act(() => vi.runOnlyPendingTimers())
			expectCollapsedSelectionInside(editorDom as HTMLElement)
		} finally {
			vi.clearAllTimers()
			vi.useRealTimers()
			outsideButton.remove()
		}
	})
})

describe("resolveMentionInsertionRange", () => {
	it("moves a stale document-end position back inside the final text block", () => {
		expect(
			resolveMentionInsertionRange({
				currentSelection: { from: 2, to: 2 },
				maxPos: 2,
				replaceSelection: false,
			}),
		).toEqual({ from: 1, to: 1 })
	})

	it("collapses a preserved text selection to its end when insertion must not replace text", () => {
		expect(
			resolveMentionInsertionRange({
				currentSelection: { from: 2, to: 4 },
				preservedSelection: { from: 6, to: 9 },
				maxPos: 12,
				replaceSelection: false,
			}),
		).toEqual({ from: 9, to: 9 })
	})

	it("keeps the selected range when replacement is enabled", () => {
		expect(
			resolveMentionInsertionRange({
				currentSelection: { from: 2, to: 4 },
				preservedSelection: { from: 6, to: 9 },
				maxPos: 12,
				replaceSelection: true,
			}),
		).toEqual({ from: 6, to: 9 })
	})
})
