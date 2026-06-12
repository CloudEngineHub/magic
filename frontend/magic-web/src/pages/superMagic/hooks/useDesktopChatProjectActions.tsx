import { lazy, Suspense, useMemo, useState } from "react"
import { useMemoizedFn } from "ahooks"
import { useTranslation } from "react-i18next"
import magicToast from "@/components/base/MagicToaster/utils"
import SuperMagicService from "@/pages/superMagic/services"
import { isOtherCollaborationProject, SHARE_WORKSPACE_ID } from "@/pages/superMagic/constants"
import { projectStore, topicStore, workspaceStore } from "@/pages/superMagic/stores/core"
import type { ProjectListItem, Topic } from "@/pages/superMagic/pages/Workspace/types"
import { ChatProjectRenameDialog } from "@/pages/superMagic/pages/ChatProjectPage/components/ChatProjectRenameDialog"
import { loadDeleteDangerModal } from "@/pages/superMagic/components/EmptyWorkspacePanel/hooks/projectActionModals"

const DeleteDangerModal = lazy(loadDeleteDangerModal)
const ChatSaveAsProjectModal = lazy(
	() => import("@/pages/superMagic/pages/ChatProjectPage/components/ChatSaveAsProjectModal"),
)

export type DesktopChatProjectActionKey = "rename" | "saveAsProject" | "delete"

interface DesktopChatProjectAction {
	key: DesktopChatProjectActionKey
	label: string
	onClick: () => void
	variant?: "default" | "danger"
}

interface UseDesktopChatProjectActionsOptions {
	onProjectChanged?: () => Promise<void> | void
	/** Detail header needs topic sync on rename and home navigation after destructive actions. */
	actionContext?: "list" | "detail"
	selectedTopic?: Topic | null
}

/**
 * Desktop chat project actions backed by PC dialogs instead of mobile bottom sheets.
 */
export function useDesktopChatProjectActions({
	onProjectChanged,
	actionContext = "list",
	selectedTopic,
}: UseDesktopChatProjectActionsOptions = {}) {
	const { t } = useTranslation("super")
	const [currentActionItem, setCurrentActionItem] = useState<ProjectListItem | null>(null)
	const [renameDialogOpen, setRenameDialogOpen] = useState(false)
	const [saveAsModalOpen, setSaveAsModalOpen] = useState(false)
	const [deleteModalOpen, setDeleteModalOpen] = useState(false)
	const [isSaveAsSubmitting, setIsSaveAsSubmitting] = useState(false)

	/** Keep popup actions aligned with the row/header project that initiated the menu. */
	const updateCurrentActionItem = useMemoizedFn((project: ProjectListItem | null) => {
		setCurrentActionItem(project)
	})

	const openRenameDialog = useMemoizedFn(() => {
		setRenameDialogOpen(true)
	})

	const openSaveAsModal = useMemoizedFn(() => {
		setSaveAsModalOpen(true)
	})

	const openDeleteConfirm = useMemoizedFn(() => {
		setDeleteModalOpen(true)
	})

	/** Delete the targeted chat and return home when the active conversation was removed. */
	const handleDeleteProject = useMemoizedFn(async () => {
		if (!currentActionItem?.id) return

		const deletedProject = currentActionItem
		const isDeletingSelectedProject = projectStore.selectedProject?.id === deletedProject.id
		const fallbackWorkspaceId = workspaceStore.workspaces.find(
			(workspace) =>
				workspace.id !== SHARE_WORKSPACE_ID && workspace.workspace_type !== "chat",
		)?.id

		try {
			await SuperMagicService.deleteProject(deletedProject, {
				selectedProjectBehavior: isDeletingSelectedProject
					? "navigate-home"
					: "switch-next",
				// Current chat projects live in the hidden chat workspace; return to the same first workspace as Home.
				lastUsedWorkspaceId: isDeletingSelectedProject
					? fallbackWorkspaceId
					: deletedProject.workspace_id,
			})
			magicToast.success(t("chat.deleteChatSuccess"))
			await onProjectChanged?.()
			setDeleteModalOpen(false)
			setCurrentActionItem(null)
		} catch (error) {
			console.log("Failed to delete chat project:", error)
		}
	})

	/** Move chat into a workspace as a standalone project, then leave detail when needed. */
	const handleSaveAsProject = useMemoizedFn(
		async ({ workspaceId, projectName }: { workspaceId: string; projectName: string }) => {
			if (!currentActionItem?.id || isSaveAsSubmitting) return

			const movedProject = currentActionItem
			const sourceWorkspaceId = movedProject.workspace_id
			if (!sourceWorkspaceId) return

			// Sidebar list actions should also leave chat detail when they move the visible chat away.
			const isCurrentChatProject = projectStore.selectedProject?.id === movedProject.id
			const shouldLeaveChatDetail =
				isCurrentChatProject &&
				(actionContext === "detail" ||
					(actionContext === "list" &&
						SuperMagicService.route.isCurrentChatProjectRoute()))

			setIsSaveAsSubmitting(true)
			try {
				await SuperMagicService.project.moveProject({
					projectId: movedProject.id,
					targetWorkspaceId: workspaceId,
					sourceWorkspaceId: isOtherCollaborationProject(movedProject)
						? SHARE_WORKSPACE_ID
						: sourceWorkspaceId,
					targetProjectName: projectName,
				})

				if (shouldLeaveChatDetail) {
					const targetProject = await SuperMagicService.project
						.getProjectDetail(movedProject.id, {
							enableErrorMessagePrompt: false,
						})
						.catch(() => null)

					// The move API keeps the project id; refresh detail so the next page uses the target workspace.
					await SuperMagicService.switchProjectInDesktop(
						targetProject ?? {
							...movedProject,
							project_name: projectName,
							workspace_id: workspaceId,
						},
					)
				}

				magicToast.success(t("chat.saveAsProjectSuccess"))
				await onProjectChanged?.()
				setSaveAsModalOpen(false)
				setCurrentActionItem(null)
			} catch (error) {
				console.log("Failed to save chat as project:", error)
			} finally {
				setIsSaveAsSubmitting(false)
			}
		},
	)

	const projectActions = useMemo<DesktopChatProjectAction[]>(
		() => [
			{
				key: "rename",
				label: t("chat.renameChat"),
				onClick: openRenameDialog,
			},
			{
				key: "saveAsProject",
				label: t("chat.saveAsProject"),
				onClick: openSaveAsModal,
			},
			{
				key: "delete",
				label: t("chat.deleteChat"),
				onClick: openDeleteConfirm,
				variant: "danger",
			},
		],
		[openDeleteConfirm, openRenameDialog, openSaveAsModal, t],
	)

	const projectActionMap = useMemo(
		() => new Map(projectActions.map((action) => [action.key, action])),
		[projectActions],
	)

	const deleteDialogTitle = currentActionItem?.project_name?.trim() || t("chat.unnamedChat")

	const projectActionComponents = (
		<>
			<ChatProjectRenameDialog
				open={renameDialogOpen}
				onOpenChange={setRenameDialogOpen}
				project={currentActionItem}
				selectedTopic={
					actionContext === "detail" ? (selectedTopic ?? topicStore.selectedTopic) : null
				}
				onRenamed={onProjectChanged}
			/>
			{saveAsModalOpen ? (
				<Suspense fallback={null}>
					<ChatSaveAsProjectModal
						open={saveAsModalOpen}
						defaultProjectName={currentActionItem?.project_name || ""}
						sourceWorkspaceId={currentActionItem?.workspace_id}
						isSubmitting={isSaveAsSubmitting}
						onClose={() => setSaveAsModalOpen(false)}
						onConfirm={handleSaveAsProject}
					/>
				</Suspense>
			) : null}
			{deleteModalOpen ? (
				<Suspense fallback={null}>
					<DeleteDangerModal
						title={t("chat.deleteChat")}
						content={deleteDialogTitle}
						description={t("chat.deleteChatDescription")}
						needConfirm={false}
						onSubmit={handleDeleteProject}
						onClose={() => setDeleteModalOpen(false)}
					/>
				</Suspense>
			) : null}
		</>
	)

	return {
		currentActionItem,
		updateCurrentActionItem,
		projectActions,
		projectActionMap,
		projectActionComponents,
	}
}
