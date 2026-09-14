import { useEffect, useRef, useState, type MouseEvent, type ReactNode } from "react"
import { Ellipsis } from "lucide-react"
import { useTranslation } from "react-i18next"
import { cn } from "@/utils/cn"
import SmartTooltip from "@/components/other/SmartTooltip"
import type { ProjectListItem } from "@/pages/superMagic/pages/Workspace/types"
import { isCollaborationProject, isWorkspaceShortcutProject } from "@/pages/superMagic/constants"
import PinnedTag from "@/pages/superMagic/components/EmptyWorkspacePanel/components/ProjectItem/components/PinnedTag"
import CollaborationProjectTag from "@/pages/superMagic/components/CollaborationProjectTag"
import ProjectActionsDropdown from "@/pages/superMagic/components/ProjectActionsDropdown"
import SidebarCreateInput from "./components/SidebarCreateInput"
import useProjectRename from "@/pages/superMagic/hooks/useProjectRename"
import { canManageProject } from "@/pages/superMagic/utils/permission"
import type { HandleRenameProjectParams } from "@/pages/superMagic/hooks/useProjects"
import { getWorkspaceProjectRouteUrl } from "@/pages/superMagic/utils/route"
import NavigationStatusIcon from "@/pages/superMagic/components/NavigationStatusIcon"
import { canDragSidebarProject } from "./projectDndUtils"

type ProjectRowActionHandler = (project: ProjectListItem) => void | Promise<void>

interface CollapsedWorkspaceProjectRowProps {
	project: ProjectListItem
	dndDisabled?: boolean
	description?: ReactNode
	showDefaultIcon?: boolean
	tooltipDisabled?: boolean
	workspaceId: string
	isSelected: boolean
	projectMenuContentRef?: React.RefObject<HTMLDivElement | null>
	onSelectProject: (project: ProjectListItem) => void
	onOpenInNewWindow?: ProjectRowActionHandler
	onPinProject?: ProjectRowActionHandler
	onCopyCollaborationLink?: ProjectRowActionHandler
	onTransferProject?: ProjectRowActionHandler
	onMoveProject?: (projectId: string) => void
	onAddCollaborators?: ProjectRowActionHandler
	onCancelWorkspaceShortcut?: ProjectRowActionHandler
	onDeleteProject?: ProjectRowActionHandler
	onRenameProject?: (params: HandleRenameProjectParams) => Promise<void>
	onInteractionChange?: (id: string, active: boolean) => void
}

function CollapsedWorkspaceProjectRow({
	project,
	dndDisabled,
	description,
	showDefaultIcon = true,
	tooltipDisabled = false,
	workspaceId,
	isSelected,
	projectMenuContentRef,
	onSelectProject,
	onOpenInNewWindow,
	onPinProject,
	onCopyCollaborationLink,
	onTransferProject,
	onMoveProject,
	onAddCollaborators,
	onCancelWorkspaceShortcut,
	onDeleteProject,
	onRenameProject,
	onInteractionChange,
}: CollapsedWorkspaceProjectRowProps) {
	const { t } = useTranslation("super")
	const [isHovered, setIsHovered] = useState(false)
	const [isMenuOpen, setIsMenuOpen] = useState(false)
	const [isRenamePending, setIsRenamePending] = useState(false)
	const suppressProjectItemClickRef = useRef(false)

	const canRename = canManageProject(project.user_role) && !!onRenameProject
	const canDrag = canDragSidebarProject(project, dndDisabled)

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

	useEffect(() => {
		onInteractionChange?.(project.id, isMenuOpen || isEditing || isRenamePending)
	}, [project.id, isMenuOpen, isEditing, isRenamePending, onInteractionChange])
	useEffect(
		() => () => onInteractionChange?.(project.id, false),
		[project.id, onInteractionChange],
	)

	const blockProjectItemClickTemporarily = () => {
		suppressProjectItemClickRef.current = true
		setTimeout(() => {
			suppressProjectItemClickRef.current = false
		}, 80)
	}

	const handleRenameStart = () => {
		if (!canRename) return
		setIsRenamePending(true)
		setTimeout(() => {
			setIsEditing(true)
			setIsRenamePending(false)
		}, 200)
	}

	const showCollaborationTag =
		isWorkspaceShortcutProject(project) || isCollaborationProject(project)
	const hideNameTooltip = tooltipDisabled || isMenuOpen || isEditing || isRenamePending
	const projectName = project.project_name || t("project.unnamedProject")

	function shouldHandleAnchorClick(event: MouseEvent<HTMLAnchorElement>) {
		return (
			event.button === 0 &&
			!event.metaKey &&
			!event.ctrlKey &&
			!event.shiftKey &&
			!event.altKey
		)
	}

	const dropdownProps = {
		item: project,
		open: isMenuOpen,
		inCollaborationPanel: false,
		onOpenChange: (open: boolean) => {
			setIsMenuOpen(open)
			if (open) blockProjectItemClickTemporarily()
		},
		onBeforeAction: blockProjectItemClickTemporarily,
		onOpenInNewWindow,
		onPinProject: (targetProject: ProjectListItem) => {
			void onPinProject?.(targetProject)
		},
		onCopyCollaborationLink,
		onTransferProject,
		onMoveProject,
		onAddCollaborators,
		onCancelWorkspaceShortcut: (projectId: string, workspaceId?: string) => {
			void onCancelWorkspaceShortcut?.({
				...project,
				id: projectId,
				bind_workspace_id: workspaceId ?? project.bind_workspace_id,
			})
		},
		onDeleteProject,
		placement: "bottomRight" as const,
		getPopupContainer: () => projectMenuContentRef?.current ?? document.body,
	}

	const threeDotTrigger = (
		open: boolean,
		triggerContextMenu?: (e: React.MouseEvent<HTMLElement>) => void,
	) => (
		// Keep the action mounted for coarse pointer desktop layouts so the first tap can open the menu.
		<div
			data-project-more-trigger="true"
			data-workspace-id={workspaceId}
			className={cn(
				"flex h-4 shrink-0 cursor-pointer items-center justify-center overflow-hidden rounded-full transition-[margin,width,opacity] [-webkit-tap-highlight-color:transparent] hover:bg-sidebar-accent",
				isSelected ? "text-sidebar-accent-foreground" : "text-sidebar-foreground",
				isHovered || open
					? "ml-1 w-4 opacity-100"
					: "pointer-events-none ml-0 w-0 opacity-0",
				"no-hover:pointer-events-auto no-hover:ml-1 no-hover:w-4 no-hover:opacity-100",
			)}
			onClick={(e) => {
				blockProjectItemClickTemporarily()
				e.preventDefault()
				e.stopPropagation()
				triggerContextMenu?.(e)
			}}
			onPointerDown={(e) => {
				blockProjectItemClickTemporarily()
				e.stopPropagation()
			}}
			onMouseDown={(e) => {
				blockProjectItemClickTemporarily()
				e.stopPropagation()
			}}
		>
			<Ellipsis className="h-4 w-4" />
		</div>
	)

	const renderRow = (
		open: boolean,
		triggerContextMenu?: (e: React.MouseEvent<HTMLElement>) => void,
	) => (
		<div
			className={cn(
				description ? "h-10 w-full rounded-md" : "h-8 w-full rounded-md",
				isSelected && "bg-sidebar-accent",
			)}
			draggable={canDrag}
			data-collapsed-sidebar-dnd-source={canDrag ? "project" : undefined}
			data-collapsed-sidebar-dnd-workspace-id={workspaceId}
			data-collapsed-sidebar-dnd-project-id={project.id}
			data-collapsed-sidebar-dnd-label={
				canDrag ? project.project_name || t("project.unnamedProject") : undefined
			}
			data-collapsed-sidebar-dnd-drop-type="project"
			onDragStart={blockProjectItemClickTemporarily}
			onDragEnd={blockProjectItemClickTemporarily}
		>
			<a
				href={getWorkspaceProjectRouteUrl(workspaceId, project.id)}
				draggable={false}
				data-testid={`sidebar-collapsed-project-row-${project.id}`}
				className="relative inline-flex h-full w-full items-center justify-start gap-0 rounded-md px-2 text-[13px] font-normal leading-[18px] text-current no-underline outline-none [-webkit-tap-highlight-color:transparent] hover:bg-sidebar-accent focus-visible:outline-none"
				onMouseEnter={() => setIsHovered(true)}
				onMouseLeave={() => setIsHovered(false)}
				onClick={(event) => {
					if (isMenuOpen || suppressProjectItemClickRef.current) {
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
					onSelectProject(project)
				}}
			>
				{/* 保留状态宽度；闲置项目隐藏图标，运行时名称不移动。 */}
				<span className="mr-2 flex size-4 shrink-0 items-center justify-center">
					<NavigationStatusIcon
						itemType="project"
						status={project.project_status}
						showDefaultIcon={showDefaultIcon}
						className={cn(
							isSelected
								? "text-sidebar-accent-foreground"
								: "text-sidebar-foreground",
						)}
					/>
				</span>
				<div className="min-w-0 flex-1">
					<div className="flex min-w-0 flex-1 items-center gap-1.5">
						<span
							className={cn(
								"min-w-0 max-w-full shrink truncate text-left",
								isSelected
									? "text-sidebar-accent-foreground"
									: "text-sidebar-foreground",
							)}
						>
							{hideNameTooltip ? (
								projectName
							) : (
								<SmartTooltip
									elementType="span"
									className="block text-[13px] leading-[18px]"
								>
									{projectName}
								</SmartTooltip>
							)}
						</span>
						{project.is_pinned && (
							<PinnedTag className="h-3 w-3 border-0 bg-transparent p-0" />
						)}
						{showCollaborationTag && (
							<CollaborationProjectTag
								visible={showCollaborationTag}
								project={project}
								showText={false}
								className="h-3 w-3 border-0 bg-transparent p-0"
							/>
						)}
					</div>
					{description && (
						<div className="min-w-0 text-xs leading-4 text-muted-foreground">
							{description}
						</div>
					)}
				</div>
				{threeDotTrigger(open, triggerContextMenu)}
			</a>
		</div>
	)

	if (isEditing && canRename) {
		return (
			<div
				className="w-full px-2 py-0.5"
				data-testid={`sidebar-collapsed-project-rename-${project.id}`}
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
					inputTestId={`sidebar-collapsed-project-rename-input-${project.id}`}
					submitButtonTestId={`sidebar-collapsed-project-rename-submit-${project.id}`}
					cancelButtonTestId={`sidebar-collapsed-project-rename-cancel-${project.id}`}
					submitButtonAriaLabel={t("common.confirm")}
					cancelButtonAriaLabel={t("common.cancel")}
					stopKeyboardPropagation
				/>
			</div>
		)
	}

	return (
		<ProjectActionsDropdown
			{...dropdownProps}
			trigger={["contextMenu"]}
			rootClassName="w-full"
			onRenameStart={canRename ? handleRenameStart : undefined}
			onRenameProject={canRename ? onRenameProject : undefined}
		>
			{({ open, triggerContextMenu }) => renderRow(open, triggerContextMenu)}
		</ProjectActionsDropdown>
	)
}

export default CollapsedWorkspaceProjectRow
