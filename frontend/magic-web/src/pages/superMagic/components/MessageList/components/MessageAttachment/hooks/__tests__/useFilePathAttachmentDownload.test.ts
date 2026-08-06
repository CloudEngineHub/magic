import { act, renderHook } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { useFilePathAttachmentDownload } from "../useFilePathAttachmentDownload"

const downloadFileMock = vi.fn()
const publishDownloadFileByPathMock = vi.fn()

const projectFilesStoreMock = {
	workspaceFilesList: [] as Array<Record<string, unknown>>,
}

vi.mock("@/pages/superMagic/components/MessageList/context", () => ({
	useMessageListContext: () => ({ projectFilesStore: projectFilesStoreMock }),
}))

vi.mock("../useMessageAttachmentDownload", () => ({
	useMessageAttachmentDownload: () => downloadFileMock,
}))

vi.mock("@/pages/superMagic/components/MessageList/utils/attachmentByFilePath", () => ({
	downloadFileByPath: (...args: unknown[]) => publishDownloadFileByPathMock(...args),
}))

describe("useFilePathAttachmentDownload", () => {
	beforeEach(() => {
		downloadFileMock.mockReset()
		publishDownloadFileByPathMock.mockReset()
		projectFilesStoreMock.workspaceFilesList = []
	})

	it("downloads the matching workspace file", () => {
		projectFilesStoreMock.workspaceFilesList = [
			{
				file_id: "page-html",
				relative_file_path: "site/page.html",
			},
		]
		const attachment = {
			filePath: "site/page.html",
			fileName: "page.html",
			fileExt: "html",
			__byPath: true as const,
		}
		const { result } = renderHook(() => useFilePathAttachmentDownload())

		act(() => result.current(attachment))

		expect(downloadFileMock).toHaveBeenCalledWith("page-html")
		expect(publishDownloadFileByPathMock).not.toHaveBeenCalled()
	})

	it("keeps the existing path event as fallback", () => {
		const attachment = {
			filePath: "site/missing.html",
			fileName: "missing.html",
			fileExt: "html",
			__byPath: true as const,
		}
		const { result } = renderHook(() => useFilePathAttachmentDownload())

		act(() => result.current(attachment))

		expect(publishDownloadFileByPathMock).toHaveBeenCalledWith(attachment)
		expect(downloadFileMock).not.toHaveBeenCalled()
	})
})
