import { act, renderHook, waitFor } from "@testing-library/react"
import type { RefObject } from "react"
import { describe, expect, it, vi } from "vitest"
import type { MessageEditorRef } from "../../message/MessageEditor"
import type { LinkedEditorMediaItem } from "../linkedEditorInputs"
import { useLinkedMediaMentionSelection } from "../useLinkedMediaMentionSelection"

function createMediaItem(overrides: Partial<LinkedEditorMediaItem> = {}): LinkedEditorMediaItem {
	return {
		connectionId: "connection-image",
		sourceElementId: "source-image",
		kind: "image",
		path: "./images/source.png",
		fileName: "source.png",
		status: "inactive",
		selected: false,
		...overrides,
	}
}

function createEditorRef(
	options: { insertResult?: boolean; removeResult?: boolean; replaceResult?: boolean } = {},
) {
	const insertMentionItem = vi.fn(() => options.insertResult ?? true)
	const removeMentionItemByPath = vi.fn(() => options.removeResult ?? true)
	const replaceMentionItemByPath = vi.fn(() => options.replaceResult ?? true)
	const editorRef = {
		current: {
			focus: vi.fn(),
			getCurrentPrompt: vi.fn(() => ""),
			openMentionPanel: vi.fn(),
			insertMentionItem,
			insertMentionItems: vi.fn(() => true),
			removeMentionItemByPath,
			replaceMentionItemByPath,
		},
	} as RefObject<MessageEditorRef | null>

	return {
		editorRef,
		insertMentionItem,
		removeMentionItemByPath,
		replaceMentionItemByPath,
	}
}

describe("useLinkedMediaMentionSelection", () => {
	it("inserts one mention after the linked selection is accepted", () => {
		const mediaItem = createMediaItem()
		const onSelectionChange = vi.fn(() => true)
		const { editorRef, insertMentionItem } = createEditorRef()
		const { result } = renderHook(() =>
			useLinkedMediaMentionSelection({
				mediaItems: [mediaItem],
				mentionedReferencePaths: [],
				isMediaConnectionSelected: () => false,
				onSelectionChange,
				editorRef,
			}),
		)

		act(() => result.current(mediaItem.connectionId, true))

		expect(onSelectionChange).toHaveBeenCalledWith(mediaItem.connectionId, true)
		expect(insertMentionItem).toHaveBeenCalledWith(
			expect.objectContaining({
				data: expect.objectContaining({
					file_name: "source.png",
					file_path: "./images/source.png",
				}),
			}),
			{ replaceSelection: false },
		)
	})

	it("rolls the linked selection back when mention insertion fails", () => {
		const mediaItem = createMediaItem()
		const onSelectionChange = vi.fn(() => true)
		const { editorRef } = createEditorRef({ insertResult: false })
		const { result } = renderHook(() =>
			useLinkedMediaMentionSelection({
				mediaItems: [mediaItem],
				mentionedReferencePaths: [],
				isMediaConnectionSelected: () => false,
				onSelectionChange,
				editorRef,
			}),
		)

		act(() => result.current(mediaItem.connectionId, true))

		expect(onSelectionChange.mock.calls).toEqual([
			[mediaItem.connectionId, true],
			[mediaItem.connectionId, false],
		])
	})

	it("does not duplicate an existing mention for the same normalized path", () => {
		const mediaItem = createMediaItem({ path: "/images/source.png" })
		const onSelectionChange = vi.fn(() => true)
		const { editorRef, insertMentionItem } = createEditorRef()
		const { result } = renderHook(() =>
			useLinkedMediaMentionSelection({
				mediaItems: [mediaItem],
				mentionedReferencePaths: ["./images/source.png"],
				isMediaConnectionSelected: () => false,
				onSelectionChange,
				editorRef,
			}),
		)

		act(() => result.current(mediaItem.connectionId, true))

		expect(onSelectionChange).toHaveBeenCalledWith(mediaItem.connectionId, true)
		expect(insertMentionItem).not.toHaveBeenCalled()
	})

	it("removes the mention before clearing the linked selection", () => {
		const mediaItem = createMediaItem({ selected: true, status: "active" })
		const onSelectionChange = vi.fn(() => true)
		const { editorRef, removeMentionItemByPath } = createEditorRef()
		const { result } = renderHook(() =>
			useLinkedMediaMentionSelection({
				mediaItems: [mediaItem],
				mentionedReferencePaths: ["./images/source.png"],
				isMediaConnectionSelected: () => true,
				onSelectionChange,
				editorRef,
			}),
		)

		act(() => result.current(mediaItem.connectionId, false))

		expect(removeMentionItemByPath).toHaveBeenCalledWith("./images/source.png")
		expect(onSelectionChange).toHaveBeenCalledWith(mediaItem.connectionId, false)
		expect(removeMentionItemByPath.mock.invocationCallOrder[0]).toBeLessThan(
			onSelectionChange.mock.invocationCallOrder[0] ?? Infinity,
		)
	})

	it("keeps the linked selection when mention removal fails", () => {
		const mediaItem = createMediaItem({ selected: true, status: "active" })
		const onSelectionChange = vi.fn(() => true)
		const { editorRef } = createEditorRef({ removeResult: false })
		const { result } = renderHook(() =>
			useLinkedMediaMentionSelection({
				mediaItems: [mediaItem],
				mentionedReferencePaths: ["./images/source.png"],
				isMediaConnectionSelected: () => true,
				onSelectionChange,
				editorRef,
			}),
		)

		act(() => result.current(mediaItem.connectionId, false))

		expect(onSelectionChange).not.toHaveBeenCalled()
	})

	it("does not remove a visible mention when its linked source disappears", () => {
		const mediaItem = createMediaItem()
		const onSelectionChange = vi.fn(() => true)
		const { editorRef, insertMentionItem, replaceMentionItemByPath } = createEditorRef()
		const { rerender } = renderHook(
			({ mediaItems }: { mediaItems: LinkedEditorMediaItem[] }) =>
				useLinkedMediaMentionSelection({
					mediaItems,
					mentionedReferencePaths: ["./images/source.png"],
					isMediaConnectionSelected: () => true,
					onSelectionChange,
					editorRef,
				}),
			{ initialProps: { mediaItems: [mediaItem] } },
		)

		rerender({ mediaItems: [] })

		expect(onSelectionChange).not.toHaveBeenCalled()
		expect(insertMentionItem).not.toHaveBeenCalled()
		expect(replaceMentionItemByPath).not.toHaveBeenCalled()
	})

	it("does not rewrite a mention when only the canvas path spelling changes", () => {
		const onSelectionChange = vi.fn(() => true)
		const { editorRef, replaceMentionItemByPath } = createEditorRef()
		const { rerender } = renderHook(
			({ mediaItem }: { mediaItem: LinkedEditorMediaItem }) =>
				useLinkedMediaMentionSelection({
					mediaItems: [mediaItem],
					mentionedReferencePaths: ["./images/source.png"],
					isMediaConnectionSelected: () => true,
					onSelectionChange,
					editorRef,
				}),
			{ initialProps: { mediaItem: createMediaItem() } },
		)

		rerender({ mediaItem: createMediaItem({ path: "/images/source.png" }) })

		expect(replaceMentionItemByPath).not.toHaveBeenCalled()
	})

	it("updates a tracked mention when the linked source path or name changes", async () => {
		const oldItem = createMediaItem({ path: "/images/source.png" })
		const onSelectionChange = vi.fn(() => true)
		const { editorRef, replaceMentionItemByPath } = createEditorRef()
		const { rerender } = renderHook(
			({
				mediaItem,
				mentionedPath,
			}: {
				mediaItem: LinkedEditorMediaItem
				mentionedPath: string
			}) =>
				useLinkedMediaMentionSelection({
					mediaItems: [mediaItem],
					mentionedReferencePaths: [mentionedPath],
					isMediaConnectionSelected: () => true,
					onSelectionChange,
					editorRef,
				}),
			{ initialProps: { mediaItem: oldItem, mentionedPath: "./images/source.png" } },
		)

		rerender({
			mediaItem: createMediaItem({ path: "./images/updated.png", fileName: "updated.png" }),
			mentionedPath: "./images/source.png",
		})

		await waitFor(() => {
			expect(replaceMentionItemByPath).toHaveBeenCalledWith(
				"./images/source.png",
				expect.objectContaining({
					data: expect.objectContaining({
						file_name: "updated.png",
						file_path: "./images/updated.png",
					}),
				}),
			)
		})

		rerender({
			mediaItem: createMediaItem({ path: "./images/updated.png", fileName: "renamed.png" }),
			mentionedPath: "./images/updated.png",
		})

		await waitFor(() => {
			expect(replaceMentionItemByPath).toHaveBeenLastCalledWith(
				"./images/updated.png",
				expect.objectContaining({
					data: expect.objectContaining({ file_name: "renamed.png" }),
				}),
			)
		})
	})
})
