import { describe, expect, it } from "vitest"
import type { AttachmentItem } from "@/pages/superMagic/components/TopicFilesButton/hooks"
import { mapWorkspaceFilesToFileItems } from "../markerAttachmentUtils"

describe("mapWorkspaceFilesToFileItems", () => {
	it("preserves file metadata used by the design URL cache", () => {
		const attachment = {
			file_id: "file-1",
			file_name: "marker.png",
			file_size: 769134,
			updated_at: "2026-07-22 16:23:49",
			resource_version: "resource-v2",
			version: "2",
			relative_file_path: "/canvas/images/marker.png",
			is_directory: false,
		} as AttachmentItem

		const result = mapWorkspaceFilesToFileItems([attachment])

		expect(result).toEqual([
			expect.objectContaining({
				file_id: "file-1",
				file_name: "marker.png",
				file_size: 769134,
				updated_at: "2026-07-22 16:23:49",
				resource_version: "resource-v2",
				version: "2",
			}),
		])
	})
})
