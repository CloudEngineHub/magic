import { act, renderHook } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import pubsub, { PubSubEvents } from "@/utils/pubsub"
import { useAutoOpenCanvasFile, resolveDesignCanvasAttachment } from "../useAutoOpenCanvasFile"
import type { MagicProjectAttachmentFile } from "../../components/MessageList/components/MessageAttachment/utils"

const mockState = vi.hoisted(() => ({
	subscribe: vi.fn(),
	waitForRefresh: vi.fn(),
	taskCompletedCallback: undefined as undefined | ((event: unknown) => void),
}))

vi.mock("@/pages/superMagic/stores", () => ({
	superMagicStore: {
		subscribe: mockState.subscribe,
	},
}))

vi.mock("@/pages/superMagic/services/attachmentsTopicSync", () => ({
	waitForNextAttachmentsRefreshForProject: mockState.waitForRefresh,
}))

const canvasDirectory = {
	file_id: "canvas-directory",
	file_name: "画布",
	is_directory: true,
	display_config: { type: "design" },
}

const canvasConfig = {
	file_id: "canvas-config",
	file_name: "magic.project.js",
	is_directory: false,
	parent_id: "canvas-directory",
}

function taskCompletedEvent(attachments: unknown[] = [canvasConfig]) {
	return {
		type: "task.completed",
		meta: {
			topicId: "topic-1",
			taskId: "task-1",
			appMessageId: "message-1",
		},
		payload: { source: "finish_task", result: { attachments } },
	}
}

describe("resolveDesignCanvasAttachment", () => {
	it("resolves magic.project.js to a design parent directory", () => {
		expect(
			resolveDesignCanvasAttachment([canvasConfig], [canvasConfig, canvasDirectory], []),
		).toEqual({ status: "ready", projectDirectory: canvasDirectory })
	})

	it("does not classify ordinary or non-design attachments as Canvas", () => {
		expect(
			resolveDesignCanvasAttachment([{ file_id: "file-1", file_name: "index.html" }], [], []),
		).toEqual({ status: "missing" })
		expect(
			resolveDesignCanvasAttachment(
				[canvasConfig],
				[canvasConfig, { ...canvasDirectory, display_config: { type: "ppt" } }],
				[],
			),
		).toEqual({ status: "not-design" })
	})
})

describe("useAutoOpenCanvasFile", () => {
	let publishSpy: ReturnType<typeof vi.spyOn>

	beforeEach(() => {
		mockState.subscribe.mockReset()
		mockState.waitForRefresh.mockReset()
		mockState.taskCompletedCallback = undefined
		mockState.subscribe.mockImplementation((_type, callback) => {
			mockState.taskCompletedCallback = callback
			return vi.fn()
		})
		publishSpy = vi.spyOn(pubsub, "publish")
		publishSpy.mockClear()
	})

	it("opens the design project only when no file preview is active", () => {
		renderHook(() =>
			useAutoOpenCanvasFile({
				topicId: "topic-1",
				projectId: "project-1",
				activeFileId: null,
				attachments: [],
				attachmentList: [canvasConfig, canvasDirectory],
				scheduleWhenTabsCacheReady: (callback) => callback(),
			}),
		)

		act(() => mockState.taskCompletedCallback?.(taskCompletedEvent()))

		expect(publishSpy).toHaveBeenNthCalledWith(1, PubSubEvents.Switch_Detail_Mode, "files")
		expect(publishSpy).toHaveBeenNthCalledWith(2, PubSubEvents.Open_File_Tab, {
			fileId: "canvas-directory",
			fileData: canvasDirectory,
		})
	})

	it("does not open when a file is already active", () => {
		renderHook(() =>
			useAutoOpenCanvasFile({
				topicId: "topic-1",
				projectId: "project-1",
				activeFileId: "existing-file",
				attachmentList: [canvasConfig, canvasDirectory],
				scheduleWhenTabsCacheReady: (callback) => callback(),
			}),
		)

		act(() => mockState.taskCompletedCallback?.(taskCompletedEvent()))
		expect(publishSpy).not.toHaveBeenCalled()
	})

	it("waits for an attachment refresh when the project tree arrives late", async () => {
		let resolveRefresh: (didLoad: boolean) => void = () => undefined
		mockState.waitForRefresh.mockImplementation(
			() => new Promise<boolean>((resolve) => (resolveRefresh = resolve)),
		)
		const scheduleWhenReady = vi.fn((callback: () => void) => callback())
		const { rerender } = renderHook(
			({ attachmentList }: { attachmentList: MagicProjectAttachmentFile[] }) =>
				useAutoOpenCanvasFile({
					topicId: "topic-1",
					projectId: "project-1",
					activeFileId: null,
					attachmentList,
					scheduleWhenTabsCacheReady: scheduleWhenReady,
				}),
			{ initialProps: { attachmentList: [] } },
		)

		act(() => mockState.taskCompletedCallback?.(taskCompletedEvent()))
		expect(mockState.waitForRefresh).toHaveBeenCalledWith(
			"project-1",
			expect.objectContaining({ signal: expect.any(AbortSignal) }),
		)

		rerender({ attachmentList: [canvasConfig, canvasDirectory] })
		await act(async () => resolveRefresh(true))
		expect(publishSpy).toHaveBeenCalledWith(PubSubEvents.Open_File_Tab, {
			fileId: "canvas-directory",
			fileData: canvasDirectory,
		})
	})

	it("deduplicates the same task completion event", () => {
		renderHook(() =>
			useAutoOpenCanvasFile({
				topicId: "topic-1",
				projectId: "project-1",
				attachmentList: [canvasConfig, canvasDirectory],
				scheduleWhenTabsCacheReady: (callback) => callback(),
			}),
		)

		act(() => {
			mockState.taskCompletedCallback?.(taskCompletedEvent())
			mockState.taskCompletedCallback?.(taskCompletedEvent())
		})
		expect(publishSpy).toHaveBeenCalledTimes(2)
	})
})
