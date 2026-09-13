import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
import { observer } from "mobx-react-lite"
import { useTranslation } from "react-i18next"
import recentProjectsStore from "@/pages/superMagic/stores/core/recentProjects"
import { projectStore } from "@/pages/superMagic/stores/core"
import type { ProjectListItem } from "@/pages/superMagic/pages/Workspace/types"
import useProjectWorkspace from "@/pages/superMagic/hooks/useProjectWorkspace"
import { openProjectInNewTab } from "@/pages/superMagic/utils/project"
import superMagicService from "@/pages/superMagic/services"
import useProjectItemActionProps from "@/pages/superMagic/components/EmptyWorkspacePanel/hooks/useProjectItemActionProps"
import { formatRelativeTime } from "@/utils/string"
import { cn } from "@/utils/cn"
import { ScrollArea } from "@/components/shadcn-ui/scroll-area"
import { useVirtualProjectList } from "./hooks/useVirtualProjectList"
import CollapsedWorkspaceProjectRow from "./CollapsedWorkspaceProjectRow"

const RecentProjectRow = observer(function RecentProjectRow({
	project,
	onSelect,
	onInteractionChange,
}: {
	project: ProjectListItem
	onSelect?: () => void
	onInteractionChange: (id: string, active: boolean) => void
}) {
	const { i18n } = useTranslation("super")
	const [rowBusy, setRowBusy] = useState(false)
	const onRowInteractionChange = useCallback(
		(_id: string, active: boolean) => setRowBusy(active),
		[],
	)
	const { workspace, locationName } = useProjectWorkspace(project)

	const actions = useProjectItemActionProps({ selectedWorkspace: workspace })
	const modalWasOpen = useRef(false)
	useEffect(() => {
		if (modalWasOpen.current && !actions.isProjectModalOpen) recentProjectsStore.invalidate()
		modalWasOpen.current = actions.isProjectModalOpen
	}, [actions.isProjectModalOpen])
	useEffect(() => {
		onInteractionChange(project.id, rowBusy || actions.isProjectModalOpen)
	}, [project.id, rowBusy, actions.isProjectModalOpen, onInteractionChange])
	useEffect(() => () => onInteractionChange(project.id, false), [project.id, onInteractionChange])
	return (
		<>
			<CollapsedWorkspaceProjectRow
				project={project}
				workspaceId={workspace.id}
				isSelected={projectStore.selectedProject?.id === project.id}
				dndDisabled
				description={
					<>
						{locationName} · {formatRelativeTime(i18n.language)(project.last_active_at)}
					</>
				}
				onInteractionChange={onRowInteractionChange}
				onSelectProject={(item) => {
					void superMagicService.switchProjectInDesktop(item)
					onSelect?.()
				}}
				onOpenInNewWindow={openProjectInNewTab}
				onPinProject={actions.handleTogglePinProject}
				onCopyCollaborationLink={actions.handleCopyCollaborationLink}
				onTransferProject={actions.handleTransferProject}
				onMoveProject={actions.handleMoveProject}
				onAddCollaborators={actions.onAddCollaborators}
				onCancelWorkspaceShortcut={actions.handleCancelWorkspaceShortcutByProject}
				onDeleteProject={actions.handleDeleteProjectConfirm}
				onRenameProject={actions.handleRenameProject}
			/>
			{actions.projectModals}
		</>
	)
})

function RecentProjects({
	active,
	fitContent = false,
	onSelect,
	onBusyChange,
}: {
	active: boolean
	fitContent?: boolean
	onSelect?: () => void
	onBusyChange?: (busy: boolean) => void
}) {
	const { t } = useTranslation("super")
	const contentRef = useRef<HTMLDivElement>(null)
	const [contentHeight, setContentHeight] = useState(0)
	useLayoutEffect(() => {
		const content = contentRef.current
		if (!fitContent || !active || !content) return
		// 浮层按完整虚拟高度和状态区收缩；只测内容，避免受限视口反过来缩短列表。
		const measure = () => setContentHeight(content.offsetHeight)
		measure()
		const observer = new ResizeObserver(measure)
		observer.observe(content)
		return () => observer.disconnect()
	}, [active, fitContent])
	const { items, stale, loading, error, hasMore } = recentProjectsStore
	const list = useVirtualProjectList({
		projects: items,
		rowHeight: 52,
		loadEnabled: active,
		scrollKey: "recent-projects",
		hasMore,
		loading,
		error,
		onLoadMore: recentProjectsStore.loadMore,
	})
	useLayoutEffect(() => {
		if (active && !recentProjectsStore.stale) recentProjectsStore.invalidate()
	}, [active])

	useEffect(() => {
		if (active && stale && !loading && !error) void recentProjectsStore.loadMore()
	}, [active, stale, loading, error])
	useEffect(() => () => onBusyChange?.(false), [onBusyChange])
	const [busyIds, setBusyIds] = useState<Set<string>>(new Set())
	useEffect(() => {
		onBusyChange?.(busyIds.size > 0)
	}, [busyIds, onBusyChange])
	const setListInteraction = list.onInteractionChange
	const onInteractionChange = useMemo(
		() => (id: string, busy: boolean) => {
			setListInteraction(id, busy)
			setBusyIds((previous) => {
				if (previous.has(id) === busy) return previous
				const next = new Set(previous)
				if (busy) next.add(id)
				else next.delete(id)
				return next
			})
		},
		[setListInteraction],
	)
	return (
		<ScrollArea
			viewportRef={list.scrollRef}
			className={cn(
				"min-h-0 overflow-hidden [&>[data-slot=scroll-area-scrollbar]]:w-1.5 [&>[data-slot=scroll-area-scrollbar]]:border-l-0",
				fitContent ? "shrink" : "flex-1",
			)}
			style={fitContent ? { height: contentHeight } : undefined}
			viewportClassName="overscroll-contain [&>div]:!block"
			onFocusCapture={list.onFocusCapture}
			onBlurCapture={list.onBlurCapture}
			data-testid="sidebar-recent-projects-list"
		>
			<div ref={contentRef} className={cn("px-1", fitContent && "min-h-[76px]")}>
				<div
					className="relative w-full"
					style={{ height: list.virtualizer.getTotalSize() }}
				>
					{list.rows.map((row) => (
						<div
							key={row.key}
							ref={list.virtualizer.measureElement}
							data-index={row.index}
							data-virtual-project-id={items[row.index].id}
							className="absolute left-0 top-0 w-full pb-1"
							style={{ transform: `translateY(${row.start}px)` }}
						>
							<RecentProjectRow
								project={items[row.index]}
								onSelect={onSelect}
								onInteractionChange={onInteractionChange}
							/>
						</div>
					))}
				</div>
				{loading && (
					<div className="p-2 text-xs text-muted-foreground">
						{t("projectNavigation.loading")}
					</div>
				)}
				{!loading && !error && !stale && items.length === 0 && (
					<div className="p-2 text-xs text-muted-foreground">
						{t("projectNavigation.emptyRecent")}
					</div>
				)}
				{error && (
					<button
						type="button"
						className="w-full p-2 text-left text-xs text-muted-foreground"
						onClick={recentProjectsStore.loadMore}
					>
						{t("projectNavigation.retry")}
					</button>
				)}
				{!loading && !error && hasMore && items.length > 0 && (
					<button
						type="button"
						className="w-full p-2 text-left text-xs text-muted-foreground"
						onClick={recentProjectsStore.loadMore}
					>
						{t("projectNavigation.loadMore")}
					</button>
				)}
			</div>
		</ScrollArea>
	)
}

export default observer(RecentProjects)
