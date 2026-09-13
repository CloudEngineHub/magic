import { useCallback, useEffect, useState } from "react"
import { Ellipsis, PanelLeftClose } from "lucide-react"
import { useTranslation } from "react-i18next"
import { cn } from "@/utils/cn"
import type { ProjectCardProps, SeparatorProps } from "./types"
import { IconShare3 } from "@tabler/icons-react"
import { Button } from "@/components/shadcn-ui/button"
import PinnedTag from "../EmptyWorkspacePanel/components/ProjectItem/components/PinnedTag"
import CollaborationProjectTag from "../CollaborationProjectTag"
import { isCollaborationProject } from "../../constants"
import { canManageProject, isReadOnlyProject } from "../../utils/permission"
import ProjectCardShareSection from "./components/ProjectCardShareSection"
import IconWorkspaceProjectFolder from "@/enhance/tabler/icons-react/icons/IconWorkspaceProjectFolder"
import ProjectActionsDropdown from "../ProjectActionsDropdown"
import useProjectItemActionProps from "../EmptyWorkspacePanel/hooks/useProjectItemActionProps"
import useProjectRename from "../../hooks/useProjectRename"
import SidebarCreateInput from "@/layouts/BaseLayout/components/MagicSidebar/components/SidebarCreateInput"
import { openProjectInNewTab } from "../../utils/project"
import type { CollaborationProjectListItem, ProjectListItem } from "../../pages/Workspace/types"

/**
 * Separator component for dividing sections
 */
function Separator({ orientation = "horizontal", className }: SeparatorProps) {
	return (
		<div
			className={cn(
				"shrink-0 bg-border",
				orientation === "horizontal" ? "h-[1px] w-full" : "h-full w-[1px]",
				className,
			)}
		/>
	)
}

/**
 * ProjectCard component displays project information, collaboration status, and actions
 * Based on Figma design: node-id=436-43761
 */
function ProjectCard({
	project: selectedProject,
	workspaceName,
	collaborators: collaboratorText,
	onWorkspaceProjectsOpen,
	onCollapse,
	isPanelVisible = true,
	onShareClick,
	onInviteClick,
	actionWorkspace,
	className,
}: ProjectCardProps) {
	const { t } = useTranslation("super")
	const [menuOpen, setMenuOpen] = useState(false)
	useEffect(() => {
		if (!isPanelVisible) setMenuOpen(false)
	}, [isPanelVisible])
	const collaboratorContent = collaboratorText ?? t("collaborators.empty")
	const isCollaborationProjectStatus = isCollaborationProject(selectedProject)
	const canShare = !isReadOnlyProject(selectedProject?.user_role)
	const canManage = canManageProject(selectedProject?.user_role)
	const projectName = selectedProject.project_name || t("project.unnamedProject")

	const {
		handleMoveProject,
		handleTransferProject,
		handleDeleteProjectConfirm,
		handlePinProject,
		onAddCollaborators,
		handleCopyCollaborationLink,
		handleCancelWorkspaceShortcutByProject,
		handleRenameProject,
		projectModals,
	} = useProjectItemActionProps({
		selectedWorkspace: actionWorkspace,
	})

	const canRename = canManage && !!handleRenameProject

	const {
		isEditing,
		setIsEditing,
		editingProjectName,
		handleProjectNameChange,
		handleProjectNameBlur,
	} = useProjectRename({
		item: selectedProject,
		onRenameProject: canRename ? handleRenameProject : undefined,
	})

	const handleRenameStart = useCallback(() => {
		if (!canRename) return
		setTimeout(() => setIsEditing(true), 200)
	}, [canRename, setIsEditing])

	const cancelShortcutFn = handleCancelWorkspaceShortcutByProject as
		| ((project: ProjectListItem | CollaborationProjectListItem) => void | Promise<void>)
		| undefined

	const handleCancelWorkspaceShortcutForMenu = cancelShortcutFn
		? (projectId: string, workspaceId?: string) => {
				void cancelShortcutFn({
					...selectedProject,
					id: projectId,
					bind_workspace_id: workspaceId ?? selectedProject.bind_workspace_id,
				})
			}
		: undefined

	return (
		<div
			className={cn(
				"relative flex w-full flex-col items-center rounded-lg border border-border bg-background transition-all duration-300",
				className,
			)}
			data-testid="project-card"
		>
			{/* Project Selector Section */}
			<div
				className={cn(
					"flex w-full shrink-0 items-start gap-1.5 p-3",
					isEditing && "flex-wrap",
				)}
			>
				<div className={cn("flex min-w-0 grow flex-col gap-0.5", isEditing && "w-full")}>
					<div className="flex min-w-0 items-center gap-1.5">
						<span className="flex size-4 shrink-0 items-center justify-center">
							<IconWorkspaceProjectFolder size={16} isHovered={false} />
						</span>
						{isEditing ? (
							<div className="min-w-0 grow" data-testid="project-card-rename">
								<SidebarCreateInput
									value={editingProjectName}
									onValueChange={(v) =>
										handleProjectNameChange({
											target: { value: v },
										} as React.ChangeEvent<HTMLInputElement>)
									}
									onSubmit={async () => {
										await handleProjectNameBlur()
									}}
									onCancel={() => setIsEditing(false)}
									placeholder={t("project.unnamedProject")}
									inputTestId="project-card-rename-input"
									submitButtonTestId="project-card-rename-submit"
									cancelButtonTestId="project-card-rename-cancel"
									submitButtonAriaLabel={t("common.confirm")}
									cancelButtonAriaLabel={t("common.cancel")}
									stopKeyboardPropagation
								/>
							</div>
						) : (
							<button
								type="button"
								className="min-w-0 truncate rounded px-0.5 text-left text-sm font-medium leading-5 hover:bg-fill disabled:cursor-default disabled:hover:bg-transparent"
								disabled={!canRename}
								title={projectName}
								onClick={() => setIsEditing(true)}
								data-testid="project-card-name"
							>
								{projectName}
							</button>
						)}
						{selectedProject.is_pinned && <PinnedTag />}
						<CollaborationProjectTag
							visible={isCollaborationProjectStatus}
							project={selectedProject}
							showText={false}
						/>
					</div>
					<div className="min-w-0 pl-[22px]">
						{" "}
						<button
							type="button"
							className="max-w-full self-start truncate rounded px-0.5 text-left text-xs leading-4 text-muted-foreground hover:bg-fill"
							title={workspaceName}
							onClick={onWorkspaceProjectsOpen}
							data-testid="project-card-workspace"
						>
							{workspaceName}
						</button>
					</div>
				</div>

				{/* Action Icons */}
				<div className="flex shrink-0 items-center gap-1">
					{/* Share Icon */}
					{canShare && (
						<Button
							variant="outline"
							size="icon"
							className="h-7 w-7 shadow-xs"
							onClick={onShareClick}
							aria-label={t("common.share")}
							title={t("common.share")}
							data-testid="share-button"
						>
							<IconShare3 size={16} className="text-foreground" />
						</Button>
					)}

					<ProjectActionsDropdown
						open={isPanelVisible && menuOpen}
						onOpenChange={setMenuOpen}
						item={selectedProject}
						inCollaborationPanel={false}
						trigger={["click"]}
						placement="bottomRight"
						onOpenInNewWindow={openProjectInNewTab}
						onPinProject={handlePinProject}
						onCopyCollaborationLink={handleCopyCollaborationLink}
						onTransferProject={handleTransferProject}
						onMoveProject={handleMoveProject}
						onAddCollaborators={onAddCollaborators}
						onCancelWorkspaceShortcut={handleCancelWorkspaceShortcutForMenu}
						onDeleteProject={handleDeleteProjectConfirm}
						onRenameStart={canRename ? handleRenameStart : undefined}
						onRenameProject={canRename ? handleRenameProject : undefined}
					>
						<span>
							<Button
								type="button"
								variant="outline"
								size="icon"
								className="h-7 w-7 shadow-xs"
								aria-label={t("common.moreActions")}
								title={t("common.moreActions")}
								data-testid="project-card-more-button"
							>
								<Ellipsis size={16} className="text-foreground" />
							</Button>
						</span>
					</ProjectActionsDropdown>
					{onCollapse && (
						<Button
							type="button"
							variant="outline"
							size="icon"
							className="h-7 w-7 shadow-xs"
							onClick={onCollapse}
							aria-label={t("sidebarPanels.collapseFiles")}
							title={t("sidebarPanels.collapseFiles")}
							data-testid="project-card-collapse"
						>
							<PanelLeftClose size={16} />
						</Button>
					)}
				</div>
			</div>

			{canManage && (
				<ProjectCardShareSection
					collaboratorContent={collaboratorContent}
					onInviteClick={onInviteClick}
				/>
			)}

			{projectModals}
		</div>
	)
}

export default ProjectCard
export { Separator }
export type { ProjectCardProps, SeparatorProps }
