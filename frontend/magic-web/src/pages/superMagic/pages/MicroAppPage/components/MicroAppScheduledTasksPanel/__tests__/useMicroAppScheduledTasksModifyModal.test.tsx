import type { ReactNode } from "react"
import { act, render, renderHook, screen } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import type { ProjectListItem } from "@/pages/superMagic/pages/Workspace/types"

const mocks = vi.hoisted(() => ({
	currentSelectedProject: null as ProjectListItem | null,
	saveMCP: vi.fn(),
	setSelectedProject: vi.fn(),
	updateAttachments: vi.fn(),
}))

vi.mock("react-i18next", async (importOriginal) => ({
	...(await importOriginal<typeof import("react-i18next")>()),
	useTranslation: () => ({ t: (key: string) => key }),
}))

vi.mock("@/components/business/AccountSetting/pages/ScheduledTasks/styles", () => ({
	useModalStyles: () => ({ styles: { modal: "modal" } }),
}))

vi.mock("@/components/base/MagicModal", () => ({
	default: ({ open, children }: { open?: boolean; children?: ReactNode }) =>
		open ? children : null,
}))

vi.mock("@/components/base/MagicToaster/utils", () => ({
	default: { error: vi.fn() },
}))

vi.mock("@/components/shadcn-ui/spinner", () => ({ Spinner: () => null }))

vi.mock("../MicroAppScheduledTasksModify", async () => {
	const { forwardRef, useImperativeHandle } = await import("react")
	return {
		MicroAppScheduledTasksModify: forwardRef(function MockScheduledTasksModify(_, ref) {
			useImperativeHandle(ref, () => ({ updateAttachments: mocks.updateAttachments }))
			return <div data-testid="scheduled-tasks-modify" />
		}),
	}
})

vi.mock("@/components/business/MentionPanel/builtin-store", () => ({
	default: {
		get currentSelectedProject() {
			return mocks.currentSelectedProject
		},
	},
}))

vi.mock("@/stores/projectFiles", () => ({
	default: { setSelectedProject: mocks.setSelectedProject },
}))

vi.mock("@/components/business/AccountSetting/pages/ScheduledTasks/store/MCPTempStorage", () => ({
	default: { saveMCP: mocks.saveMCP },
}))

import { useMicroAppScheduledTasksModifyModal } from "../useMicroAppScheduledTasksModifyModal"

function project(id: string): ProjectListItem {
	return { id } as ProjectListItem
}

describe("useMicroAppScheduledTasksModifyModal", () => {
	beforeEach(() => {
		vi.clearAllMocks()
		mocks.currentSelectedProject = null
		mocks.updateAttachments.mockResolvedValue(undefined)
	})

	it("restores the original project when the outer route has no topic id", async () => {
		window.history.replaceState({}, "", "/super/project-1")
		const originalProject = project("project-1")
		mocks.currentSelectedProject = originalProject
		const { result } = renderHook(() =>
			useMicroAppScheduledTasksModifyModal({
				workspaceId: "workspace-1",
				projectId: "micro-app-project",
			}),
		)

		act(() => {
			result.current.openCreateModal(vi.fn())
			mocks.currentSelectedProject = project("micro-app-project")
		})
		render(result.current.content)
		await screen.findByTestId("scheduled-tasks-modify")
		await act(async () => {
			await result.current.closeModal()
		})

		expect(mocks.setSelectedProject).toHaveBeenCalledWith(originalProject)
		expect(mocks.updateAttachments).toHaveBeenCalledWith(originalProject.id)
		expect(mocks.saveMCP).toHaveBeenCalledWith([])
	})

	it("restores an empty original project context", async () => {
		const { result } = renderHook(() =>
			useMicroAppScheduledTasksModifyModal({
				workspaceId: "workspace-1",
				projectId: "micro-app-project",
			}),
		)

		act(() => {
			result.current.openCreateModal(vi.fn())
			mocks.currentSelectedProject = project("micro-app-project")
		})
		await act(async () => {
			await result.current.closeModal()
		})

		expect(mocks.setSelectedProject).toHaveBeenCalledWith(null)
	})
})
