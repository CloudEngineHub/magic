import { act, render, renderHook } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { forwardRef, useImperativeHandle } from "react"

import pubsub, { PubSubEvents } from "@/utils/pubsub"
import {
	buildRuntimeFilePreviewDetail,
	usePublishedRuntimePreview,
} from "../usePublishedRuntimePreview"

const popupMocks = vi.hoisted(() => ({
	open: vi.fn(),
	allowEdit: undefined as boolean | undefined,
}))

vi.mock("@/pages/superMagic/components/MessageList/components/Nodes/toolDetailSelection", () => ({
	getToolDetailSelectionTarget: (detail: { target?: string }) => detail?.target,
}))

vi.mock("@/pages/superMagicMobile/components/PreviewDetailPopup", () => ({
	default: forwardRef(function MockPreviewDetailPopup(props: { allowEdit?: boolean }, ref) {
		popupMocks.allowEdit = props.allowEdit
		useImperativeHandle(ref, () => ({ open: popupMocks.open }))
		return <div data-testid="runtime-preview-popup" />
	}),
}))

describe("usePublishedRuntimePreview", () => {
	afterEach(() => {
		pubsub.clear()
		popupMocks.open.mockClear()
		popupMocks.allowEdit = undefined
	})

	it("builds a popup detail from a message file payload", () => {
		expect(
			buildRuntimeFilePreviewDetail({
				fileId: "file-1",
				fileData: {
					file_id: "file-1",
					file_name: "index.html",
					file_extension: "html",
				},
			}),
		).toEqual(
			expect.objectContaining({
				type: "html",
				currentFileId: "file-1",
				data: expect.objectContaining({ file_id: "file-1", file_name: "index.html" }),
			}),
		)
	})

	it("opens tools and files in an editable preview popup", () => {
		const fileList = [
			{
				file_id: "file-3",
				file_name: "random_content.md",
				file_extension: "md",
				relative_file_path: "notes/random_content.md",
			} as never,
		]
		const { result } = renderHook(() =>
			usePublishedRuntimePreview({
				enabled: true,
				fileTree: [],
				fileList,
			}),
		)
		render(result.current.previewPopup)

		expect(popupMocks.allowEdit).toBe(true)

		act(() => {
			result.current.handleSelectDetail({ type: "shell", data: { command: "pwd" } })
		})
		expect(popupMocks.open).toHaveBeenCalledWith(
			expect.objectContaining({ type: "shell" }),
			[],
			fileList,
		)

		popupMocks.open.mockClear()
		act(() => {
			result.current.handleSelectDetail({
				target: "file",
				type: "code",
				data: { source_file_id: "file-1" },
			})
		})
		expect(popupMocks.open).not.toHaveBeenCalled()

		act(() => {
			pubsub.publish(PubSubEvents.Open_File_Tab, {
				fileId: "file-1",
				fileData: {
					file_id: "file-1",
					file_name: "index.html",
					file_extension: "html",
				},
			})
		})
		expect(popupMocks.open).toHaveBeenCalledWith(
			expect.objectContaining({
				currentFileId: "file-1",
				data: expect.objectContaining({ file_id: "file-1" }),
			}),
			[],
			fileList,
		)

		popupMocks.open.mockClear()
		act(() => {
			result.current.handleOpenFile({
				file_id: "file-2",
				file_name: "random_content.md",
				file_extension: "md",
			})
		})
		expect(popupMocks.open).toHaveBeenCalledWith(
			expect.objectContaining({
				currentFileId: "file-2",
				type: "md",
				data: expect.objectContaining({ file_id: "file-2" }),
			}),
			[],
			fileList,
		)

		popupMocks.open.mockClear()
		act(() => {
			pubsub.publish(PubSubEvents.Open_File_Tab_By_Path, {
				filePath: "notes/random_content.md",
				fileName: "random_content.md",
			})
		})
		expect(popupMocks.open).toHaveBeenCalledWith(
			expect.objectContaining({
				currentFileId: "file-3",
				data: expect.objectContaining({ file_id: "file-3" }),
			}),
			[],
			fileList,
		)
	})
})
