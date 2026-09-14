import { act, renderHook } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import pubsub, { PubSubEvents } from "@/utils/pubsub"
import { TaskStatus } from "../../pages/Workspace/types"
import {
	hasActivePreviewTab,
	pickPreferredAutoOpenAttachment,
	useAutoOpenFile,
} from "../useAutoOpenFile"

function createTemplateRoot() {
	return {
		file_id: "template-root",
		file_name: "产品发布模板",
		is_directory: true,
		children: [
			{ file_id: "template-json", file_name: "template.json", is_directory: false },
			{ file_id: "spec", file_name: "visual-spec.md", is_directory: false },
			{ file_id: "theme", file_name: "theme.css", is_directory: false },
			{ file_id: "slides", file_name: "slides", is_directory: true, children: [] },
		],
	}
}

describe("pickPreferredAutoOpenAttachment", () => {
	it("prefers the template root over newer preview images", () => {
		const preferred = pickPreferredAutoOpenAttachment([
			{
				file_id: "thumb",
				file_name: "thumbnail.png",
				file_extension: "png",
				is_directory: false,
			},
			createTemplateRoot(),
			{
				file_id: "template-json",
				file_name: "template.json",
				file_extension: "json",
				is_directory: false,
			},
		])

		expect(preferred?.file_id).toBe("template-root")
	})

	it("falls back to template.json when the root folder is not in attachments", () => {
		const preferred = pickPreferredAutoOpenAttachment([
			{
				file_id: "thumb",
				file_name: "thumbnail.png",
				file_extension: "png",
				is_directory: false,
			},
			{
				file_id: "template-json",
				file_name: "template.json",
				file_extension: "json",
				is_directory: false,
			},
			{
				file_id: "slide-1",
				file_name: "cover.html",
				file_extension: "html",
				is_directory: false,
			},
		])

		expect(preferred?.file_id).toBe("template-json")
	})

	it("falls back to the first openable attachment for ordinary files", () => {
		const preferred = pickPreferredAutoOpenAttachment([
			{
				file_id: "readme",
				file_name: "readme.md",
				file_extension: "md",
				is_directory: false,
			},
			{
				file_id: "image",
				file_name: "preview.png",
				file_extension: "png",
				is_directory: false,
			},
		])

		expect(preferred?.file_id).toBe("readme")
	})
})

describe("hasActivePreviewTab", () => {
	it("treats non-file tabs as active content", () => {
		expect(hasActivePreviewTab({ activeFileId: null, hasActiveTab: true })).toBe(true)
	})

	it("prefers the latest tab state over a stale file id", () => {
		expect(
			hasActivePreviewTab({
				activeFileId: "stale-file",
				getHasActiveTab: () => false,
			}),
		).toBe(false)
	})
})

describe("useAutoOpenFile", () => {
	afterEach(() => {
		vi.restoreAllMocks()
		vi.useRealTimers()
	})

	it("does not replace an active non-file tab with a message attachment", () => {
		vi.useFakeTimers()
		const publishSpy = vi.spyOn(pubsub, "publish")
		const { result } = renderHook(() => useAutoOpenFile())

		act(() => {
			result.current.checkAndOpenFileByMessages({
				lastMessageNode: { status: TaskStatus.FINISHED },
				lastDetailMessageNode: {
					message_id: "detail-message",
					attachments: [
						{
							file_id: "generated-file",
							file_name: "result.md",
							file_extension: "md",
						},
					],
				},
				hasStatusChanged: true,
				activeFileId: null,
				hasActiveTab: true,
			})
			vi.runAllTimers()
		})

		expect(publishSpy).not.toHaveBeenCalledWith(PubSubEvents.Open_File_Tab, expect.anything())
	})

	it("rechecks restored tab state before the delayed automatic open", () => {
		vi.useFakeTimers()
		const publishSpy = vi.spyOn(pubsub, "publish")
		const { result } = renderHook(() => useAutoOpenFile())
		let hasActiveTab = false

		act(() => {
			result.current.checkAndOpenFileByMessages({
				lastMessageNode: { status: TaskStatus.FINISHED },
				lastDetailMessageNode: {
					message_id: "detail-message",
					attachments: [
						{
							file_id: "generated-file",
							file_name: "result.md",
							file_extension: "md",
						},
					],
				},
				hasStatusChanged: true,
				activeFileId: null,
				getHasActiveTab: () => hasActiveTab,
			})
			hasActiveTab = true
			vi.runAllTimers()
		})

		expect(publishSpy).not.toHaveBeenCalledWith(PubSubEvents.Open_File_Tab, expect.anything())
	})
})
