import { renderHook } from "@testing-library/react"
import type { Editor, JSONContent } from "@tiptap/react"
import { describe, expect, it, vi } from "vitest"
import pubsub, { PubSubEvents } from "@/utils/pubsub"
import type { DraftStore } from "../../stores"
import useMessageEditorPubSub from "../useMessageEditorPubSub"

vi.mock("@/pages/superMagic/components/MessageEditor/utils/drag", () => ({
	DRAG_TYPE: {
		Tab: "tab",
		ProjectFile: "project-file",
		ProjectDirectory: "project-directory",
		MultipleFiles: "multiple-files",
		PPTSlide: "ppt-slide",
	},
	insertMentionFromDroppedData: vi.fn(),
}))

/** Creates the minimum active editor surface required by the PubSub adapter. */
function createMockEditor(initialContent: JSONContent) {
	let content = initialContent
	const editor = {
		isDestroyed: false,
		commands: {
			focus: vi.fn(),
			insertContent: vi.fn(),
		},
		getJSON: vi.fn(() => content),
		getText: vi.fn(() =>
			(content.content ?? [])
				.flatMap((node) => node.content ?? [])
				.map((node) => node.text ?? "")
				.join(""),
		),
	} as unknown as Editor

	return {
		editor,
		getContent: () => content,
		setContent: (nextContent: JSONContent | undefined) => {
			content = nextContent ?? { type: "doc", content: [{ type: "paragraph" }] }
		},
	}
}

describe("useMessageEditorPubSub", () => {
	it("maintains plain-text input through Widget commands", () => {
		const mockEditor = createMockEditor({
			type: "doc",
			content: [{ type: "paragraph", content: [{ type: "text", text: "mock" }] }],
		})
		const draftStore = {
			waitForLoadDraft: vi.fn().mockResolvedValue(undefined),
		} as unknown as DraftStore
		const updateContent = vi.fn((content: JSONContent | undefined) => {
			mockEditor.setContent(content)
		})
		const { unmount } = renderHook(() =>
			useMessageEditorPubSub({
				editor: mockEditor.editor,
				isMobile: false,
				draftStore,
				updateContent,
				enableMessageSendByContent: true,
				onSendMessageByContent: vi.fn(),
			}),
		)

		const setRespond = vi.fn()
		pubsub.publish(PubSubEvents.Magic_Widget_Editor_Command, {
			command: "setInput",
			content: "replacement",
			respond: setRespond,
		})
		expect(mockEditor.getContent()).toEqual({
			type: "doc",
			content: [
				{
					type: "paragraph",
					content: [{ type: "text", text: "replacement" }],
				},
			],
		})
		expect(setRespond).toHaveBeenCalledTimes(1)
		expect(updateContent.mock.invocationCallOrder.at(-1)).toBeLessThan(
			setRespond.mock.invocationCallOrder[0],
		)

		const appendRespond = vi.fn()
		pubsub.publish(PubSubEvents.Magic_Widget_Editor_Command, {
			command: "appendInput",
			content: " suffix",
			respond: appendRespond,
		})
		expect(appendRespond).toHaveBeenCalledTimes(1)
		expect(mockEditor.getContent()).toEqual({
			type: "doc",
			content: [
				{
					type: "paragraph",
					content: [
						{ type: "text", text: "replacement" },
						{ type: "text", text: " suffix" },
					],
				},
			],
		})

		const getRespond = vi.fn()
		pubsub.publish(PubSubEvents.Magic_Widget_Editor_Command, {
			command: "getInput",
			respond: getRespond,
		})
		expect(getRespond).toHaveBeenCalledWith("replacement suffix")

		const clearRespond = vi.fn()
		pubsub.publish(PubSubEvents.Magic_Widget_Editor_Command, {
			command: "clearInput",
			respond: clearRespond,
		})
		expect(clearRespond).toHaveBeenCalledTimes(1)
		expect(mockEditor.getContent()).toEqual({
			type: "doc",
			content: [{ type: "paragraph" }],
		})

		unmount()
	})
})
