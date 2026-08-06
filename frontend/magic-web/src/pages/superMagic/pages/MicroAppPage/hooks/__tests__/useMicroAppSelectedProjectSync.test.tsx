import { renderHook } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import type { AttachmentItem } from "@/pages/superMagic/components/TopicFilesButton/hooks"
import type { ProjectListItem } from "@/pages/superMagic/pages/Workspace/types"
import { ProjectFilesStore } from "@/stores/projectFiles"
import { useMicroAppSelectedProjectSync } from "../useMicroAppSelectedProjectSync"

function createProject(id: string, projectName: string) {
	return { id, project_name: projectName } as ProjectListItem
}

describe("useMicroAppSelectedProjectSync", () => {
	it("preserves the file list when rename or publish only updates project metadata", () => {
		const projectFilesStore = new ProjectFilesStore()
		const file = {
			file_id: "index-html",
			file_name: "index.html",
		} as AttachmentItem

		const { rerender } = renderHook(
			({ selectedProject }) =>
				useMicroAppSelectedProjectSync(projectFilesStore, selectedProject),
			{
				initialProps: {
					selectedProject: createProject("project-1", "Old App"),
				},
			},
		)
		projectFilesStore.setWorkspaceFileTree([file])

		rerender({ selectedProject: createProject("project-1", "New App") })

		expect(projectFilesStore.workspaceFileTree).toEqual([file])
		expect(projectFilesStore.workspaceFilesList).toEqual([file])
		expect(projectFilesStore.currentSelectedProject?.project_name).toBe("New App")
	})

	it("clears files when switching to another project", () => {
		const projectFilesStore = new ProjectFilesStore()
		const { rerender } = renderHook(
			({ selectedProject }) =>
				useMicroAppSelectedProjectSync(projectFilesStore, selectedProject),
			{
				initialProps: {
					selectedProject: createProject("project-1", "First App"),
				},
			},
		)
		projectFilesStore.setWorkspaceFileTree([
			{ file_id: "index-html", file_name: "index.html" } as AttachmentItem,
		])

		rerender({ selectedProject: createProject("project-2", "Second App") })

		expect(projectFilesStore.workspaceFileTree).toEqual([])
		expect(projectFilesStore.workspaceFilesList).toEqual([])
	})
})
