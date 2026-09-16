import { useCallback, useEffect, useRef, useState } from "react"
import { Check, ChevronDown, Ellipsis, Layers, PanelLeftClose, X } from "lucide-react"
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
import { Input } from "@/components/shadcn-ui/input"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/shadcn-ui/tooltip"
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

	const renameFinishedRef = useRef(false)
	useEffect(() => {
		if (isEditing) renameFinishedRef.current = false
	}, [isEditing])
	// Enter 会连带触发 blur；同一次编辑只提交一次，Esc 的 blur 也不能保存。
	const finishRename = async (cancel = false) => {
		if (renameFinishedRef.current) return
		renameFinishedRef.current = true
		if (cancel) {
			setIsEditing(false)
			return
		}
		try {
			await handleProjectNameBlur()
		} finally {
			setIsEditing(false)
		}
	}

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
				className="flex w-full shrink-0 flex-col gap-0.5 px-3 pb-2 pt-2.5"
				onBlur={(event) => {
					if (!isEditing) return
					// Tab 移到保存／取消按钮仍在编辑区内，离开整个区域才沿用失焦保存。
					if (
						event.relatedTarget instanceof HTMLElement &&
						event.relatedTarget.hasAttribute("data-project-rename-control") &&
						event.currentTarget.contains(event.relatedTarget)
					)
						return
					void finishRename()
				}}
				onKeyDown={(event) => {
					if (isEditing && event.key === "Escape" && !event.nativeEvent.isComposing) {
						event.preventDefault()
						event.stopPropagation()
						void finishRename(true)
					}
				}}
			>
				{/* 两行共用 16px 图标列和 6px 间距；工作区入口不再单独缩进。 */}
				<div className="flex h-7 min-w-0 items-center gap-1.5">
					{isEditing ? (
						<Input
							autoFocus
							className="h-7 min-w-0 flex-1 px-1.5 text-sm"
							value={editingProjectName}
							onChange={handleProjectNameChange}
							onFocus={(event) => event.currentTarget.select()}
							onKeyDown={(event) => {
								if (event.nativeEvent.isComposing) return
								if (event.key === "Enter" || event.key === "Escape") {
									event.preventDefault()
									event.stopPropagation()
									void finishRename(event.key === "Escape")
								}
							}}
							aria-label={t("project.unnamedProject")}
							data-testid="project-card-rename-input"
							data-project-rename-control
						/>
					) : (
						<>
							<span className="flex size-4 shrink-0 items-center justify-center">
								<IconWorkspaceProjectFolder size={16} isHovered={false} />
							</span>
							<button
								type="button"
								className="min-w-0 truncate rounded p-0 text-left text-sm font-medium leading-5 hover:bg-fill disabled:cursor-default disabled:hover:bg-transparent"
								disabled={!canRename}
								title={projectName}
								onClick={() => setIsEditing(true)}
								data-testid="project-card-name"
							>
								{projectName}
							</button>
							{selectedProject.is_pinned && <PinnedTag />}
							<CollaborationProjectTag
								visible={isCollaborationProjectStatus}
								project={selectedProject}
								showText={false}
							/>
						</>
					)}
					{onCollapse && (
						<Button
							variant="ghost"
							size="icon"
							className="ml-auto h-7 w-7 shrink-0 text-muted-foreground"
							// 编辑时 Tab 先到保存／取消；收起入口仍可点击，离开编辑区时保存。
							tabIndex={isEditing ? -1 : undefined}
							onClick={onCollapse}
							aria-label={t("sidebarPanels.collapseFiles")}
							title={t("sidebarPanels.collapseFiles")}
							data-testid="project-card-collapse"
						>
							<PanelLeftClose size={16} />
						</Button>
					)}
				</div>
				<div className="flex h-7 min-w-0 items-center gap-1.5">
					{isEditing ? (
						<>
							<Tooltip>
								<TooltipTrigger asChild>
									<Button
										type="button"
										variant="ghost"
										className="h-[26px] gap-1 px-1.5 text-xs"
										onPointerDown={(event) => event.preventDefault()}
										onClick={() => void finishRename()}
										data-testid="project-card-rename-save"
										data-project-rename-control
									>
										<Check size={16} />
										{t("common.save")}
									</Button>
								</TooltipTrigger>
								<TooltipContent>{t("sidebarPanels.renameSave")}</TooltipContent>
							</Tooltip>
							<Tooltip>
								<TooltipTrigger asChild>
									<Button
										type="button"
										variant="ghost"
										className="h-[26px] gap-1 px-1.5 text-xs text-muted-foreground"
										onPointerDown={(event) => event.preventDefault()}
										onClick={() => void finishRename(true)}
										data-testid="project-card-rename-cancel"
										data-project-rename-control
									>
										<X size={16} />
										{t("common.cancel")}
									</Button>
								</TooltipTrigger>
								<TooltipContent>{t("sidebarPanels.renameCancel")}</TooltipContent>
							</Tooltip>
						</>
					) : (
						<>
							<button
								type="button"
								className="-ml-1.5 flex h-7 min-w-0 items-center gap-1.5 rounded-md px-1.5 text-left text-xs leading-4 text-muted-foreground hover:bg-fill"
								title={workspaceName}
								onClick={onWorkspaceProjectsOpen}
								data-testid="project-card-workspace"
							>
								<Layers size={16} className="shrink-0" />
								<span className="truncate">{workspaceName}</span>
								<ChevronDown size={16} className="shrink-0" />
							</button>
							<span className="flex-1" />
							{/* Action Icons */}
							<div className="flex shrink-0 items-center gap-1">
								{/* Share Icon */}
								{canShare && (
									<Button
										variant="ghost"
										size="icon"
										className="h-7 w-7 text-muted-foreground"
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
											variant="ghost"
											size="icon"
											className="h-7 w-7 text-muted-foreground"
											aria-label={t("common.moreActions")}
											title={t("common.moreActions")}
											data-testid="project-card-more-button"
										>
											<Ellipsis size={16} className="text-foreground" />
										</Button>
									</span>
								</ProjectActionsDropdown>
							</div>
						</>
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
