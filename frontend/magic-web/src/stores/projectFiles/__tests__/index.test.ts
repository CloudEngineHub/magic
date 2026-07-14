import { describe, expect, it } from "vitest"
import { ProjectFilesStore } from "../index"
import type { AttachmentItem } from "@/pages/superMagic/components/TopicFilesButton/hooks"

describe("ProjectFilesStore", () => {
	it("does not duplicate files when the same workspace file is added again", () => {
		const store = new ProjectFilesStore()
		store.setWorkspaceFileTree([
			{
				file_id: "folder",
				file_name: "Folder",
				is_directory: true,
				type: "directory",
				children: [],
			} as AttachmentItem,
		])

		store.addWorkspaceFile({
			file_id: "slide-1",
			parent_id: "folder",
			file_name: "新建幻灯片 1.html",
			is_directory: false,
			type: "file",
		} as AttachmentItem)
		store.addWorkspaceFile({
			file_id: "slide-1",
			parent_id: "folder",
			file_name: "新建幻灯片 2.html",
			is_directory: false,
			type: "file",
		} as AttachmentItem)

		const slideListItems = store.workspaceFilesList.filter((item) => item.file_id === "slide-1")
		const folder = store.workspaceFileTree[0]
		const slideTreeItems = folder.children?.filter((item) => item.file_id === "slide-1")

		expect(slideListItems).toHaveLength(1)
		expect(slideListItems[0].file_name).toBe("新建幻灯片 2.html")
		expect(slideTreeItems).toHaveLength(1)
		expect(slideTreeItems?.[0].file_name).toBe("新建幻灯片 2.html")
	})

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
