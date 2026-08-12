import { useRef, useState, type MouseEvent } from "react"
import { observer } from "mobx-react-lite"
import { Ellipsis, GripVertical } from "lucide-react"
import { useSortable } from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { cn } from "@/utils/cn"
import { useTranslation } from "react-i18next"
import projectStore from "@/pages/superMagic/stores/core/project"
import type { ProjectItemProps } from "./types"
import superMagicService from "@/pages/superMagic/services"
import { SidebarMenuSubButton } from "@/components/shadcn-ui/sidebar"
import { isCollaborationProject, isWorkspaceShortcutProject } from "@/pages/superMagic/constants"
import CollaborationProjectTag from "@/pages/superMagic/components/CollaborationProjectTag"
import PinnedTag from "@/pages/superMagic/components/EmptyWorkspacePanel/components/ProjectItem/components/PinnedTag"
import ProjectActionsDropdown from "@/pages/superMagic/components/ProjectActionsDropdown"
import SidebarCreateInput from "../components/SidebarCreateInput"
import useProjectRename from "@/pages/superMagic/hooks/useProjectRename"
import { canManageProject } from "@/pages/superMagic/utils/permission"
import { getWorkspaceProjectRouteUrl } from "@/pages/superMagic/utils/route"
import { preloadProjectPage } from "@/pages/superMagic/pages/ProjectPage/utils"
import { preloadTopicPage } from "@/pages/superMagic/pages/TopicPage/utils"
import NavigationStatusIcon from "@/pages/superMagic/components/NavigationStatusIcon"
import { getProjectDragId } from "./types"

function ProjectItem({
	project,
	dndDisabled,
	onOpenInNewWindow,
	onPinProject,
	onCopyCollaborationLink,
	onTransferProject,
	onMoveProject,
	onAddCollaborators,
	onCancelWorkspaceShortcut,
	onDeleteProject,
	onRenameProject,
}: ProjectItemProps) {
	const { t } = useTranslation("super")
	const isSelected = projectStore.selectedProject?.id === project.id
	const isWorkspaceShortcut = isWorkspaceShortcutProject(project)
	const isCollaborationProjectStatus = isCollaborationProject(project)
	const showCollaborationTag = isWorkspaceShortcut || isCollaborationProjectStatus
	const [isHovered, setIsHovered] = useState(false)
	const [isMenuOpen, setIsMenuOpen] = useState(false)
	const suppressItemClickRef = useRef(false)

	const canRename = canManageProject(project.user_role) && !!onRenameProject
	const canDrag =
		!dndDisabled &&
		!isWorkspaceShortcut &&
		(!isCollaborationProjectStatus || canManageProject(project.user_role) || !project.user_role)
	const {
		attributes: sortableAttributes,
		listeners: sortableListeners,
		setNodeRef: setSortableNodeRef,
		setActivatorNodeRef,
		transform,
		transition,
		isDragging,
	} = useSortable({
		id: getProjectDragId(project.id),
		data: { type: "project", projectId: project.id, workspaceId: project.workspace_id },
		disabled: !canDrag,
	})

	const {
		isEditing,
		setIsEditing,
		editingProjectName,
		handleProjectNameChange,
		handleProjectNameBlur,
	} = useProjectRename({
		item: project,
		onRenameProject: canRename ? onRenameProject : undefined,
	})

	const blockItemClickTemporarily = () => {
		suppressItemClickRef.current = true
		setTimeout(() => {
			suppressItemClickRef.current = false
		}, 0)
	}

	function shouldHandleAnchorClick(event: MouseEvent<HTMLAnchorElement>) {
		return (
			event.button === 0 &&
			!event.metaKey &&
			!event.ctrlKey &&
			!event.shiftKey &&
			!event.altKey
		)
	}

	function handleClick(event: MouseEvent<HTMLAnchorElement>) {
		if (isMenuOpen || suppressItemClickRef.current || isEditing) {
			event.stopPropagation()
			return
		}

		const target = event.target as HTMLElement
		if (target.closest("[data-project-more-trigger='true']")) {
			event.stopPropagation()
			return
		}

		if (!shouldHandleAnchorClick(event)) return
		event.preventDefault()
		superMagicService.switchProjectById(project.id)
		// sidebarStore.collapseIfNarrow()
	}

	function handlePreloadPage() {
		void preloadProjectPage()
		void preloadTopicPage()
	}

	const handleRenameStart = () => {
		if (!canRename) return
		setTimeout(() => {
			setIsEditing(true)
		}, 200)
	}

	if (isEditing && canRename) {
		return (
			<div
				className="w-full px-2 py-0.5"
				data-testid={`sidebar-project-rename-${project.id}`}
			>
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
					inputTestId={`sidebar-project-rename-input-${project.id}`}
					submitButtonTestId={`sidebar-project-rename-submit-${project.id}`}
					cancelButtonTestId={`sidebar-project-rename-cancel-${project.id}`}
					submitButtonAriaLabel={t("common.confirm")}
					cancelButtonAriaLabel={t("common.cancel")}
					stopKeyboardPropagation
				/>
			</div>
		)
	}

	return (
		<ProjectActionsDropdown
			item={project}
			open={isMenuOpen}
			inCollaborationPanel={false}
			onOpenChange={(open) => {
				setIsMenuOpen(open)
				if (open) {
					blockItemClickTemporarily()
				}
			}}
			onBeforeAction={blockItemClickTemporarily}
			onOpenInNewWindow={onOpenInNewWindow}
			onPinProject={
				onPinProject
					? (targetProject) => {
							onPinProject(targetProject)
						}
					: undefined
			}
			onCopyCollaborationLink={onCopyCollaborationLink}
			onTransferProject={onTransferProject}
			onMoveProject={onMoveProject}
			onAddCollaborators={onAddCollaborators}
			onCancelWorkspaceShortcut={
				onCancelWorkspaceShortcut
					? (projectId, workspaceId) => {
							onCancelWorkspaceShortcut({
								...project,
								id: projectId,
								bind_workspace_id: workspaceId ?? project.bind_workspace_id,
							})
						}
					: undefined
			}
			onDeleteProject={onDeleteProject}
			onRenameStart={canRename ? handleRenameStart : undefined}
			onRenameProject={canRename ? onRenameProject : undefined}
			trigger={["contextMenu"]}
			placement="bottomRight"
			rootClassName="w-full"
		>
			{({ open, triggerContextMenu }) => (
				<SidebarMenuSubButton
					ref={setSortableNodeRef}
					asChild
					size="md"
					isActive={isSelected}
					className={cn(
						"h-7 px-2",
						isSelected && "bg-[#f5f5f5] dark:bg-[#262626]",
						isDragging && "opacity-50",
					)}
					style={{
						transform: CSS.Transform.toString(transform),
						transition,
					}}
				>
					<a
						href={getWorkspaceProjectRouteUrl(project.workspace_id, project.id)}
						onClick={handleClick}
						data-testid={`sidebar-project-item-${project.id}`}
						onMouseEnter={() => {
							setIsHovered(true)
							handlePreloadPage()
						}}
						onFocus={handlePreloadPage}
						onMouseLeave={() => setIsHovered(false)}
						className="w-full min-w-0 text-left text-current no-underline [-webkit-tap-highlight-color:transparent]"
					>
						<div className="flex w-full min-w-0 items-center">
							<div className="min-w-0 flex-1">
								<div className="flex min-w-0 max-w-full items-center gap-1.5">
									<NavigationStatusIcon
										itemType="project"
										status={project.project_status}
										showDefaultIcon={false}
										className={
											isSelected
												? "text-sidebar-accent-foreground"
												: "text-sidebar-foreground"
										}
									/>
									<span
										className={cn(
											"min-w-0 max-w-full truncate text-left text-sm leading-5",
											isSelected
												? "text-sidebar-accent-foreground"
												: "text-sidebar-foreground",
										)}
									>
										{project.project_name || t("project.unnamedProject")}
									</span>
									{project.is_pinned && <PinnedTag />}
									{showCollaborationTag && (
										<CollaborationProjectTag
											visible={showCollaborationTag}
											project={project}
											showText={false}
										/>
									)}
								</div>
							</div>
							{canDrag && (
								<div
									ref={setActivatorNodeRef}
									{...sortableAttributes}
									{...sortableListeners}
									className={cn(
										"ml-1 flex h-4 w-4 shrink-0 cursor-grab items-center justify-center rounded text-sidebar-foreground transition-opacity hover:bg-sidebar-accent active:cursor-grabbing",
										isHovered || isDragging
											? "opacity-100"
											: "pointer-events-none opacity-0 [@media(hover:hover)_and_(pointer:fine)]:ml-0 [@media(hover:hover)_and_(pointer:fine)]:w-0 [@media(hover:hover)_and_(pointer:fine)]:overflow-hidden",
										"no-hover:pointer-events-auto no-hover:opacity-100",
									)}
									aria-label={t("sidebar:project.dragToReorder", {
										defaultValue: "拖动排序项目",
									})}
									onClick={(e) => {
										e.preventDefault()
										e.stopPropagation()
									}}
								>
									<GripVertical className="h-3 w-3" />
								</div>
							)}
							{/* The menu trigger must stay tappable on coarse pointer desktop layouts. */}
							<div
								data-project-more-trigger="true"
								className={cn(
									"ml-1 flex h-4 w-4 shrink-0 cursor-pointer items-center justify-center rounded-full text-sidebar-foreground transition-opacity [-webkit-tap-highlight-color:transparent] hover:bg-sidebar-accent",
									isHovered || open
										? "opacity-100"
										: "pointer-events-none opacity-0",
									"no-hover:pointer-events-auto no-hover:opacity-100",
								)}
								onClick={(e) => {
									blockItemClickTemporarily()
									e.preventDefault()
									e.stopPropagation()
									triggerContextMenu(e)
								}}
								onMouseDown={(e) => {
									blockItemClickTemporarily()
									e.stopPropagation()
								}}
							>
								<Ellipsis className="h-4 w-4" />
							</div>
						</div>
					</a>
				</SidebarMenuSubButton>
			)}
		</ProjectActionsDropdown>
	)
}

export default observer(ProjectItem)
