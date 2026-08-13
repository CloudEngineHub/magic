import { act, renderHook, waitFor } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import type { AttachmentItem } from "@/pages/superMagic/components/TopicFilesButton/hooks"
import { useMicroAppPreviewFiles } from "../useMicroAppPreviewFiles"

function file(fileId: string, fileName: string, updatedAt?: string): AttachmentItem {
	return {
		file_id: fileId,
		file_name: fileName,
		relative_file_path: fileName,
		updated_at: updatedAt,
	}
}

describe("useMicroAppPreviewFiles", () => {
	it("keeps the selected file when refreshed items have the same id and update time", async () => {
		const defaultEntry = file("entry-1", "index.html")
		const selectedEntry = file("admin-1", "admin.html")
		const { result, rerender } = renderHook(
			({ attachmentList, defaultEntryFile }) =>
				useMicroAppPreviewFiles({ attachmentList, defaultEntryFile }),
			{
				initialProps: {
					attachmentList: [defaultEntry, selectedEntry],
					defaultEntryFile: defaultEntry,
				},
			},
		)

		act(() => result.current.handlePreviewFileChange("admin-1"))
		expect(result.current.previewEntryFile).toBe(selectedEntry)

		rerender({
			attachmentList: [file("entry-1", "index.html"), file("admin-1", "admin.html")],
			defaultEntryFile: file("entry-1", "index.html"),
		})

		await waitFor(() => expect(result.current.previewEntryFile).toBe(selectedEntry))
	})

	it("replaces the selected file when its update time changes", async () => {
		const defaultEntry = file("entry-1", "index.html")
		const selectedEntry = file("admin-1", "admin.html", "2026-08-03T05:30:00Z")
		const updatedEntry = file("admin-1", "admin.html", "2026-08-03T05:31:00Z")
		const { result, rerender } = renderHook(
			({ attachmentList }) =>
				useMicroAppPreviewFiles({ attachmentList, defaultEntryFile: defaultEntry }),
			{ initialProps: { attachmentList: [defaultEntry, selectedEntry] } },
		)

		act(() => result.current.handlePreviewFileChange("admin-1"))
		rerender({ attachmentList: [defaultEntry, updatedEntry] })

		await waitFor(() => expect(result.current.previewEntryFile).toBe(updatedEntry))
	})

	it("falls back to the default entry when the selected file is removed", async () => {
		const defaultEntry = file("entry-1", "index.html")
		const selectedEntry = file("admin-1", "admin.html")
		const { result, rerender } = renderHook(
			({ attachmentList }) =>
				useMicroAppPreviewFiles({ attachmentList, defaultEntryFile: defaultEntry }),
			{ initialProps: { attachmentList: [defaultEntry, selectedEntry] } },
		)

		act(() => result.current.handlePreviewFileChange("admin-1"))
		rerender({ attachmentList: [defaultEntry] })

		await waitFor(() => expect(result.current.previewEntryFile).toBe(defaultEntry))
	})
})
