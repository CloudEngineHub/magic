import { act, renderHook } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { useCopyFileSelector } from "../useCopyFileSelector"
import type { AttachmentItem } from "../types"

vi.mock("react-i18next", () => ({
	useTranslation: () => ({
		t: (key: string) => key,
	}),
}))

describe("useCopyFileSelector", () => {
	it("opens selector with collected file IDs for batch copy", () => {
		const onCopySuccess = vi.fn()
		const attachments: AttachmentItem[] = [
			{
				file_id: "file-1",
				name: "Mock File",
				is_directory: false,
				relative_file_path: "/Mock File",
			},
		]

		const { result } = renderHook(() =>
			useCopyFileSelector({
				projectId: "project-1",
				attachments,
				onCopySuccess,
			}),
		)

		act(() => {
			result.current.openBatchCopyByFileIds(["file-1", "file-2"])
		})

		expect(result.current.selectorConfig.visible).toBe(true)
		expect(result.current.pendingCopyFileIds).toEqual(["file-1", "file-2"])
		expect(result.current.selectorConfig.disabledFolderIds).toEqual([])
		expect(result.current.selectorConfig.title).toBe("topicFiles.contextMenu.copyTo")
	})
})
