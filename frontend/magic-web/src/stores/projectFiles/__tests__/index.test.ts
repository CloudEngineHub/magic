import { describe, expect, it } from "vitest"
import { ProjectFilesStore } from "../index"
import type { AttachmentItem } from "@/pages/superMagic/components/TopicFilesButton/hooks"

describe("ProjectFilesStore", () => {
	it("reuses provided flat list while aligning items to tree references", () => {
		const childFromTree: AttachmentItem = {
			file_id: "child",
			file_name: "child.md",
		}
		const folderFromTree: AttachmentItem = {
			file_id: "folder",
			name: "Folder",
			is_directory: true,
			children: [childFromTree],
		}
		const hiddenFromTree: AttachmentItem = {
			file_id: "hidden",
			file_name: "hidden.md",
			is_hidden: true,
		}
		const store = new ProjectFilesStore()

		store.setWorkspaceFileTree([folderFromTree, hiddenFromTree], {
			list: [{ ...folderFromTree }, { ...childFromTree }, { ...hiddenFromTree }],
			source: "test",
		})

		expect(store.workspaceFileTree).toEqual([folderFromTree])
		expect(store.workspaceFilesList).toHaveLength(2)
		expect(store.workspaceFilesList[0]).toBe(folderFromTree)
		expect(store.workspaceFilesList[1]).toBe(childFromTree)
	})
})
