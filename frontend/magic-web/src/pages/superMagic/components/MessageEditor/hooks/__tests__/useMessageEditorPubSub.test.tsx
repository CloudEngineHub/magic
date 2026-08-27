import { renderHook } from "@testing-library/react"
import type { Editor, JSONContent } from "@/infrastructure/editors/tiptap/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
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

const uploadScreenshot = vi.hoisted(() => vi.fn())

vi.mock("../../services/HtmlScreenshotUploadService", () => ({
	htmlScreenshotUploadService: { uploadScreenshot },
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
	beforeEach(() => {
		uploadScreenshot.mockReset()
	})

	it("submits HTML selections through the current conversation", async () => {
		const draftStore = {
			waitForLoadDraft: vi.fn().mockResolvedValue(undefined),
		} as unknown as DraftStore
		const onSendMessageByContent = vi.fn().mockResolvedValue(undefined)
		const onSuccess = vi.fn()
		const { unmount } = renderHook(() =>
			useMessageEditorPubSub({
				editor: null,
				isMobile: false,
				draftStore,
				updateContent: vi.fn(),
				enableMessageSendByContent: false,
				onSendMessageByContent,
			}),
		)

		pubsub.publish(PubSubEvents.Submit_Html_Multi_Selection, {
			fileId: "file-1",
			fileName: "index.html",
			filePath: "index.html",
			instruction: "",
			targets: [
				{
					kind: "element",
					selector: "#hero",
					elementLabel: "section#hero",
					instruction: "Increase the title size",
				},
			],
			onSuccess,
		})
		await vi.waitFor(() => expect(onSendMessageByContent).toHaveBeenCalledTimes(1))

		const payload = onSendMessageByContent.mock.calls[0][0]
		expect(payload.shouldClearEditorAfterSend).toBe(true)
		expect(JSON.stringify(payload.jsonContent)).toContain("Increase the title size")
		expect(onSuccess).toHaveBeenCalledTimes(1)

		unmount()
	})

	it("reuses a screenshot uploaded after target confirmation", async () => {
		const draftStore = {
			waitForLoadDraft: vi.fn().mockResolvedValue(undefined),
		} as unknown as DraftStore
		uploadScreenshot.mockResolvedValue({
			file_id: "saved-shot-1",
			file_key: "temporary/screenshot.png",
			file_name: "screenshot.png",
			file_size: 3,
			relative_file_path: ".tmp/screenshot.png",
			is_hidden: true,
		})
		const onSendMessageByContent = vi.fn().mockResolvedValue(undefined)
		const { unmount } = renderHook(() =>
			useMessageEditorPubSub({
				editor: null,
				isMobile: false,
				draftStore,
				updateContent: vi.fn(),
				enableMessageSendByContent: false,
				onSendMessageByContent,
				projectId: "project-1",
				topicId: "topic-1",
			}),
		)

		const targetId = "screenshot:1"
		pubsub.publish(PubSubEvents.Prepare_Html_Screenshot, {
			targetId,
			dataUrl: "data:image/png;base64,AA==",
		})
		await vi.waitFor(() => expect(uploadScreenshot).toHaveBeenCalledTimes(1))

		pubsub.publish(PubSubEvents.Submit_Html_Multi_Selection, {
			fileId: "file-1",
			fileName: "index.html",
			filePath: "index.html",
			instruction: "",
			targets: [
				{
					id: targetId,
					kind: "screenshot",
					selector: "",
					elementLabel: "Screenshot",
					screenshot: {
						dataUrl: "data:image/png;base64,AA==",
						rect: { left: 0, top: 0, width: 100, height: 80 },
					},
					instruction: "Move this area",
				},
			],
		})

		await vi.waitFor(() => expect(onSendMessageByContent).toHaveBeenCalledTimes(1))
		expect(uploadScreenshot).toHaveBeenCalledTimes(1)
		expect(JSON.stringify(onSendMessageByContent.mock.calls[0][0].jsonContent)).toContain(
			"screenshot.png",
		)

		unmount()
	})

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
