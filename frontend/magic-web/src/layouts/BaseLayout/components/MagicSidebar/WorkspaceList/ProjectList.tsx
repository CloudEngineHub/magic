import { useCallback } from "react"
import projectStore from "@/pages/superMagic/stores/core/project"
import { useVirtualProjectList } from "../hooks/useVirtualProjectList"
import { observer } from "mobx-react-lite"
import { useTranslation } from "react-i18next"
import ProjectItem from "./ProjectItem"
import CreateProjectInput from "./CreateProjectInput"
import type { ProjectListProps } from "./types"
import { SidebarMenuSub } from "@/components/shadcn-ui/sidebar"
import useProjectItemActionProps from "@/pages/superMagic/components/EmptyWorkspacePanel/hooks/useProjectItemActionProps"
import { openProjectInNewTab } from "@/pages/superMagic/utils/project"

function ProjectList({
	isSearchResult,
	active,
	workspace,
	projects,
	workspaceId,
	isLoading,
	isCreatingProject,
	onCancelCreate,
	onProjectCreated,
	dndDisabled,
	scrollRef: workspaceScrollRef,
}: ProjectListProps) {
	const { t } = useTranslation(["super", "sidebar"])
	const {
		projectModals,
		handleMoveProject,
		handleTransferProject,
		handleDeleteProjectConfirm,
		handleTogglePinProject,
		handleRenameProject,
		onAddCollaborators,
		handleCopyCollaborationLink,
		handleCancelWorkspaceShortcutByProject,
	} = useProjectItemActionProps({
		selectedWorkspace: workspace,
	})

	const page = isSearchResult ? undefined : projectStore.workspacePages.get(workspaceId)
	const loadMore = useCallback(() => {
		void projectStore.loadMoreProjectsForWorkspace(workspaceId)
	}, [workspaceId])
	const {
		scrollRef,
		virtualizer,
		rows,
		scrollMargin,
		onInteractionChange,
		onFocusCapture,
		onBlurCapture,
	} = useVirtualProjectList({
		loadEnabled: active,
		externalScrollRef: workspaceScrollRef,
		scrollKey: `workspace-projects:${workspaceId}`,
		projects,
		rowHeight: 32,
		hasMore: page?.hasMore,
		loading: isLoading || page?.loadingMore,
		error: page?.error,
		onLoadMore: loadMore,
	})

	return (
		<>
			<div
				className="relative flex w-full shrink-0 flex-col items-start gap-1 py-0.5 pl-6 pr-0"
				data-sidebar-drop-type="project-list"
				data-sidebar-drop-workspace-id={workspaceId}
				data-sidebar-drop-empty={projects.length === 0 ? "true" : undefined}
				data-testid={`sidebar-project-list-${workspaceId}`}
			>
				{isCreatingProject && onCancelCreate && onProjectCreated && (
					<div className="w-full duration-150 animate-in fade-in slide-in-from-top-2">
						<CreateProjectInput
							workspaceId={workspaceId}
							onCancel={onCancelCreate}
							onCreated={onProjectCreated}
						/>
					</div>
				)}
				{isLoading && projects.length === 0 ? (
					// Loading text with fade-in animation
					<div className="px-2 py-1 text-xs text-[#a3a3a3] duration-150 animate-in fade-in slide-in-from-top-2">
						{t("sidebar:project.loading")}
					</div>
				) : projects.length === 0 && !isCreatingProject && !page?.error ? (
					// Empty state with fade-in animation
					<div className="px-2 py-1 text-xs text-[#a3a3a3] duration-150 animate-in fade-in slide-in-from-top-2">
						{t("sidebar:project.empty")}
					</div>
				) : (
					<div
						ref={scrollRef}
						className="w-full"
						onFocusCapture={onFocusCapture}
						onBlurCapture={onBlurCapture}
					>
						<SidebarMenuSub
							className="relative mx-0 block w-full translate-x-0 border-0 px-0 py-0"
							style={{ height: virtualizer.getTotalSize() }}
						>
							{rows.map((row) => {
								const project = projects[row.index]
								return (
									<li
										key={project.id}
										data-index={row.index}
										data-virtual-project-id={project.id}
										ref={virtualizer.measureElement}
										className="absolute left-0 top-0 w-full pb-1"
										style={{
											transform: `translateY(${row.start - scrollMargin}px)`,
										}}
									>
										<ProjectItem
											project={project}
											onInteractionChange={onInteractionChange}
											dndDisabled={dndDisabled}
											onOpenInNewWindow={openProjectInNewTab}
											onPinProject={handleTogglePinProject}
											onCopyCollaborationLink={handleCopyCollaborationLink}
											onTransferProject={handleTransferProject}
											onMoveProject={handleMoveProject}
											onAddCollaborators={onAddCollaborators}
											onCancelWorkspaceShortcut={
												handleCancelWorkspaceShortcutByProject
											}
											onDeleteProject={handleDeleteProjectConfirm}
											onRenameProject={handleRenameProject}
										/>
									</li>
								)
							})}
						</SidebarMenuSub>
					</div>
				)}
				{(page?.hasMore || page?.error) && (
					<button
						type="button"
						className="w-full px-2 py-1 text-left text-xs text-muted-foreground hover:text-foreground"
						disabled={isLoading || page.loadingMore}
						onClick={loadMore}
					>
						{page.error
							? t("super:projectNavigation.retry")
							: page.loadingMore
								? t("sidebar:project.loading")
								: t("super:projectNavigation.loadMore")}
					</button>
				)}
				{/* Border line with fade-in animation */}
				<div className="absolute bottom-0 left-4 top-0 w-0 border-l border-[#e5e5e5] duration-300 animate-in fade-in dark:border-[#404040]" />
			</div>
			{projectModals}
		</>
	)
}

export default observer(ProjectList)
