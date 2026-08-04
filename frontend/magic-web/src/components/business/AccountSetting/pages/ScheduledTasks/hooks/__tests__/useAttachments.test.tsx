import { renderHook, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import type { MentionPanelStore } from "@/components/business/MentionPanel/builtin-store"
import type { ProjectListItem } from "@/pages/superMagic/pages/Workspace/types"
import type { ProjectFilesStore } from "@/stores/projectFiles"

const mocks = vi.hoisted(() => ({
	loadProjectAttachments: vi.fn(),
	globalSetSelectedProject: vi.fn(),
	globalSetWorkspaceFileTree: vi.fn(),
	globalFinishLoadAttachments: vi.fn(),
}))

vi.mock("@/pages/superMagic/services", () => ({
	loadProjectAttachments: mocks.loadProjectAttachments,
}))

vi.mock("@/pages/superMagic/utils/query", () => ({
	getSuperIdState: () => ({}),
}))

vi.mock("@/stores/projectFiles", () => ({
	default: {
		currentSelectedProject: null,
		setSelectedProject: mocks.globalSetSelectedProject,
		setWorkspaceFileTree: mocks.globalSetWorkspaceFileTree,
	},
}))

vi.mock("@/components/business/MentionPanel/builtin-store", () => ({
	default: {
		finishLoadAttachmentsPromise: mocks.globalFinishLoadAttachments,
	},
}))

import { useAttachments } from "../useAttachments"

describe("useAttachments", () => {
	beforeEach(() => {
		vi.clearAllMocks()
	})

	it("writes attachment state only to the supplied stores", async () => {
		const selectedProject = { id: "micro-app-project" } as ProjectListItem
		const attachmentTree = [
			{
				file_id: "file-1",
				file_name: "README.md",
				type: "file",
			},
		]
		const localProjectFilesStore = {
			currentSelectedProject: null as ProjectListItem | null,
			setSelectedProject: vi.fn((project: ProjectListItem | null) => {
				localProjectFilesStore.currentSelectedProject = project
			}),
			setWorkspaceFileTree: vi.fn(),
		} as unknown as ProjectFilesStore
		const localMentionPanelStore = {
			finishLoadAttachmentsPromise: vi.fn(),
		} as unknown as MentionPanelStore
		mocks.loadProjectAttachments.mockResolvedValue({ tree: attachmentTree })

		const { result, unmount } = renderHook(() =>
			useAttachments({
				projectId: selectedProject.id,
				selectedProject,
				mode: "edit",
				interval: 60_000,
				projectFilesStore: localProjectFilesStore,
				mentionPanelStore: localMentionPanelStore,
			}),
		)

		await waitFor(() => expect(result.current.attachments).toEqual(attachmentTree))

		expect(localProjectFilesStore.setSelectedProject).toHaveBeenCalledWith(selectedProject)
		expect(localProjectFilesStore.setWorkspaceFileTree).toHaveBeenCalledWith(attachmentTree)
		expect(localMentionPanelStore.finishLoadAttachmentsPromise).toHaveBeenCalledWith(
			selectedProject.id,
		)
		expect(mocks.globalSetSelectedProject).not.toHaveBeenCalled()
		expect(mocks.globalSetWorkspaceFileTree).not.toHaveBeenCalled()
		expect(mocks.globalFinishLoadAttachments).not.toHaveBeenCalled()

		unmount()
	})
})
