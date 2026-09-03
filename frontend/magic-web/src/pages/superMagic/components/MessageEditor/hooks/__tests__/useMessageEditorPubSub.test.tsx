import { renderHook, waitFor } from "@testing-library/react"
import type { Editor, JSONContent } from "@/infrastructure/editors/tiptap/react"
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
	it("maintains plain-text input through Widget commands", async () => {
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
		const onSendCurrentContent = vi.fn()
		const { unmount } = renderHook(() =>
			useMessageEditorPubSub({
				editor: mockEditor.editor,
				isMobile: false,
				draftStore,
				updateContent,
				enableMessageSendByContent: true,
				onSendMessageByContent: vi.fn(),
				onSendCurrentContent,
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
		const sendRespond = vi.fn()
		pubsub.publish(PubSubEvents.Magic_Widget_Editor_Command, {
			command: "sendMessage",
			respond: sendRespond,
		})
		expect(onSendCurrentContent).toHaveBeenCalledTimes(1)
		await waitFor(() => expect(sendRespond).toHaveBeenCalledTimes(1))
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

	it("sets and appends structured Widget mention content", () => {
		const mockEditor = createMockEditor({ type: "doc", content: [{ type: "paragraph" }] })
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
				onSendCurrentContent: vi.fn(),
			}),
		)
		const agentMention = {
			type: "mention",
			attrs: {
				type: "agent",
				data: { agent_id: "agent-mock-001", agent_name: "Agent Mock" },
			},
		}

		pubsub.publish(PubSubEvents.Magic_Widget_Editor_Command, {
			command: "setInput",
			content: {
				type: "doc",
				content: [
					{ type: "paragraph", content: [{ type: "text", text: "Ask " }, agentMention] },
				],
			},
			respond: vi.fn(),
		})
		pubsub.publish(PubSubEvents.Magic_Widget_Editor_Command, {
			command: "appendInput",
			content: {
				type: "doc",
				content: [{ type: "paragraph", content: [{ type: "text", text: " now" }] }],
			},
			respond: vi.fn(),
		})

		expect(mockEditor.getContent()).toEqual({
			type: "doc",
			content: [
				{
					type: "paragraph",
					content: [
						{ type: "text", text: "Ask " },
						agentMention,
						{ type: "text", text: " now" },
					],
				},
			],
		})
		expect(updateContent.mock.calls[0]?.[1]).toEqual({ preserveMentionValidation: true })
		expect(updateContent.mock.calls[1]?.[1]).toEqual({ preserveMentionValidation: true })

		unmount()
	})

	it("waits for draft load before applying Add_Content_To_Chat", async () => {
		let resolveDraftLoad: (() => void) | undefined
		const draftLoadPromise = new Promise<void>((resolve) => {
			resolveDraftLoad = resolve
		})
		const draftStore = {
			waitForLoadDraft: vi.fn(() => draftLoadPromise),
		} as unknown as DraftStore
		const updateContent = vi.fn()
		const { unmount } = renderHook(() =>
			useMessageEditorPubSub({
				editor: null,
				isMobile: true,
				draftStore,
				updateContent,
				enableMessageSendByContent: true,
				onSendMessageByContent: vi.fn(),
				onSendCurrentContent: vi.fn(),
			}),
		)

		const scheduledContent: JSONContent = {
			type: "doc",
			content: [{ type: "paragraph", content: [{ type: "text", text: "scheduled task" }] }],
		}

		pubsub.publish(PubSubEvents.Add_Content_To_Chat, { content: scheduledContent })
		expect(draftStore.waitForLoadDraft).toHaveBeenCalledTimes(1)
		expect(updateContent).not.toHaveBeenCalled()

		resolveDraftLoad?.()
		await draftLoadPromise
		await Promise.resolve()

		expect(updateContent).toHaveBeenCalledWith(scheduledContent)

		unmount()
	})
})
