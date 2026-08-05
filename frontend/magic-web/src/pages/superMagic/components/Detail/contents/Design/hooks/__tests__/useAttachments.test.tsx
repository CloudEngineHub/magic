import { renderHook } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import type { FileItem } from "@/pages/superMagic/components/Detail/components/FilesViewer/types"
import { useAttachments } from "../useAttachments"

function attachment(fileId: string): FileItem {
	return {
		file_id: fileId,
		file_name: `${fileId}.png`,
		relative_file_path: `images/${fileId}.png`,
		is_directory: false,
	} as FileItem
}

describe("useAttachments", () => {
	it("does not infer readiness from an explicit empty attachment list", () => {
		const staleTree = [attachment("stale")]
		const { result } = renderHook(() =>
			useAttachments({
				attachments: staleTree,
				attachmentList: [],
				attachmentsReady: false,
				projectId: "project-a",
			}),
		)

		expect(result.current.attachmentsReady).toBe(false)
		expect(result.current.flatAttachments).toEqual([])
		expect(result.current.attachmentIndex.byFileId.size).toBe(0)
	})

	it("accepts an explicit ready empty snapshot", () => {
		const { result } = renderHook(() =>
			useAttachments({
				attachments: [],
				attachmentList: [],
				attachmentsReady: true,
				projectId: "project-a",
			}),
		)

		expect(result.current.attachmentsReady).toBe(true)
		expect(result.current.flatAttachments).toEqual([])
	})

	it("uses project-scoped readiness supplied by the attachment owner", () => {
		const { result, rerender } = renderHook(
			(options: { projectId: string; attachments?: FileItem[]; attachmentsReady: boolean }) =>
				useAttachments(options),
			{
				initialProps: {
					projectId: "project-a",
					attachments: [] as FileItem[],
					attachmentsReady: true,
				},
			},
		)

		expect(result.current.attachmentsReady).toBe(true)
		rerender({ projectId: "project-b", attachments: undefined, attachmentsReady: false })
		expect(result.current.attachmentsReady).toBe(false)
	})
})
