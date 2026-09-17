import { useEffect, useRef, useState } from "react"
import { useMemoizedFn } from "ahooks"
import { observer } from "mobx-react-lite"
import { comparer, reaction } from "mobx"
import { Layers, Users, AppWindow, Clock3 } from "lucide-react"
import { useTranslation } from "react-i18next"
import { SuperMagicApi } from "@/apis"
import { Button } from "@/components/shadcn-ui/button"
import { cn } from "@/utils/cn"
import type { Workspace } from "@/pages/superMagic/pages/Workspace/types"
import { projectStore, workspaceStore } from "@/pages/superMagic/stores/core"
import SuperMagicService from "@/pages/superMagic/services"
import useSearchValue from "@/pages/superMagic/pages/Assistant/components/TopicPanel/hooks/useSearchValue"
import { ProjectsPanel } from "./ProjectsPanel"
import WorkspaceProjectsContent from "./WorkspaceProjectsContent"
import { CollaborationProjectsContent } from "./CollaborationProjectsPanel"
import { useProjectManagerWindow } from "../useProjectManagerWindow"

interface WorkspaceProjectsPanelProps {
	open: boolean
	initialSource: ProjectBrowserSource
	initialAction?: "create-project"
	onClose: () => void
}

export type ProjectBrowserSource =
	{ type: "workspace"; workspace: Workspace } | { type: "collaboration" } | { type: "recent" }
const WORKSPACE_PAGE_SIZE = 20

function getInitialWorkspaces(source: ProjectBrowserSource): Workspace[] {
	return Array.from(
		new Map(
			[
				...workspaceStore.workspaces,
				...(source.type === "workspace" ? [source.workspace] : []),
			]
				.filter((item) => item.id && item.workspace_type === "default")
				.map((item) => [item.id, item]),
		).values(),
	)
}

function WorkspaceProjectsPanel({
	open,
	initialSource,
	initialAction,
	onClose,
}: WorkspaceProjectsPanelProps) {
	const { t } = useTranslation("super")
	const { windowOptions, resizeGuideVisible, dismissResizeGuide, restoreRecommendedSize } =
		useProjectManagerWindow(open)
	const { searchValue, onSearchValueChange, setSearchValue } = useSearchValue()
	const [source, setSource] = useState<ProjectBrowserSource>(initialSource)
	const [createPending, setCreatePending] = useState(initialAction === "create-project")
	const [workspaces, setWorkspaces] = useState<Workspace[]>(() =>
		getInitialWorkspaces(initialSource),
	)
	const [loading, setLoading] = useState(false)
	const [failed, setFailed] = useState(false)
	const [page, setPage] = useState(0)
	const [hasMore, setHasMore] = useState(true)
	const requestId = useRef(0)
	const pending = useRef(false)
	const failedPage = useRef(1)
	const isOpen = useRef(open)

	const loadWorkspaces = useMemoizedFn(async (nextPage: number) => {
		if (!isOpen.current || pending.current) return
		const id = ++requestId.current
		pending.current = true
		setLoading(true)
		setFailed(false)
		try {
			const result: { list: Workspace[]; total: number } = await SuperMagicApi.getWorkspaces({
				page: nextPage,
				page_size: WORKSPACE_PAGE_SIZE,
				workspace_type: "default",
				auto_create: false,
			})
			if (id !== requestId.current) return
			// 目录查询不切换全局工作区；第一页也保留尚未分页到的当前工作区入口。
			setWorkspaces((previous) => {
				const fresh = new Map(result.list.map((item) => [item.id, item]))
				const ordered =
					nextPage === 1
						? [...result.list, ...previous.filter((item) => !fresh.has(item.id))]
						: [
								...previous.map((item) => fresh.get(item.id) || item),
								...result.list.filter(
									(item) => !previous.some((existing) => existing.id === item.id),
								),
							]
				return ordered.filter((item) => item.workspace_type === "default")
			})
			setPage(nextPage)
			setHasMore(nextPage * WORKSPACE_PAGE_SIZE < result.total)
		} catch {
			if (id === requestId.current) {
				failedPage.current = nextPage
				setFailed(true)
			}
		} finally {
			if (id === requestId.current) {
				pending.current = false
				setLoading(false)
			}
		}
	})

	const resetSource = useMemoizedFn(() => {
		setSource(initialSource)
		setCreatePending(initialAction === "create-project")
		setSearchValue("")
		setWorkspaces(getInitialWorkspaces(initialSource))
	})
	useEffect(() => {
		isOpen.current = open
		if (open) {
			resetSource()
			void loadWorkspaces(1)
		}
		return () => {
			isOpen.current = false
			requestId.current += 1
			pending.current = false
		}
	}, [open, loadWorkspaces, resetSource])

	useEffect(() => {
		if (!open) return
		return reaction(
			() =>
				workspaceStore.workspaces.map(({ id, name, workspace_type }) => [
					id,
					name,
					workspace_type,
				]),
			() => {
				const updates = workspaceStore.workspaces.filter(
					(workspace) => workspace.id && workspace.workspace_type === "default",
				)
				// 移动弹窗新建的目录同步到管理器；全局缓存不完整，不能覆盖已分页浏览的目录。
				setWorkspaces((previous) =>
					Array.from(
						new Map(
							[...previous, ...updates].map((workspace) => [workspace.id, workspace]),
						).values(),
					),
				)
				setSource((current) => {
					if (current.type !== "workspace") return current
					const workspace = updates.find((item) => item.id === current.workspace.id)
					return workspace ? { ...current, workspace } : current
				})
			},
			{ equals: comparer.structural },
		)
	}, [open])

	const selectSource = (next: ProjectBrowserSource) => {
		if (
			next.type === source.type &&
			(next.type !== "workspace" ||
				(source.type === "workspace" && next.workspace.id === source.workspace.id))
		)
			return
		setSearchValue("")
		setSource(next)
	}
	const close = useMemoizedFn(() => {
		isOpen.current = false
		requestId.current += 1
		setSearchValue("")
		onClose()
	})
	const locationName =
		source.type === "workspace"
			? source.workspace.name || t("workspace.unnamedWorkspace")
			: source.type === "recent"
				? t("projectNavigation.recent")
				: t("workspace.collaborationProjectsTitle")

	return (
		<ProjectsPanel
			open={open}
			title={t("sidebarPanels.projectManager")}
			titleIcon={<AppWindow size={16} />}
			location={
				<>
					{source.type === "workspace" ? (
						<Layers size={16} className="text-muted-foreground" />
					) : source.type === "recent" ? (
						<Clock3 size={16} className="text-muted-foreground" />
					) : (
						<Users size={16} className="text-muted-foreground" />
					)}
					<span className="truncate" title={locationName}>
						{locationName}
					</span>
				</>
			}
			windowOptions={windowOptions}
			onRestoreRecommendedSize={restoreRecommendedSize}
			resizeGuide={{
				visible: resizeGuideVisible,
				onDismiss: dismissResizeGuide,
			}}
			searchValue={searchValue}
			onSearchValueChange={onSearchValueChange}
			onClose={close}
			sidebar={
				<nav
					aria-label={t("sidebarPanels.browseWorkspaces")}
					className="flex min-h-0 w-[180px] shrink-0 flex-col border-r border-border bg-muted/20 p-2 max-sm:w-[128px]"
				>
					<div className="px-2 py-2 text-xs font-medium text-muted-foreground">
						{t("sidebarPanels.browseWorkspaces")}
					</div>
					<div className="min-h-0 flex-1 overflow-y-auto">
						<div className="mb-2 border-b border-border pb-2">
							<button
								type="button"
								aria-current={source.type === "recent" ? true : undefined}
								className={cn(
									"flex min-h-9 w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm text-foreground outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
									source.type === "recent" &&
										"bg-accent font-medium text-accent-foreground",
								)}
								onClick={() => selectSource({ type: "recent" })}
							>
								<Clock3 size={16} className="shrink-0" />
								<span className="truncate">{t("projectNavigation.recent")}</span>
							</button>
						</div>
						{workspaces.map((item) => (
							<button
								type="button"
								key={item.id}
								aria-current={
									source.type === "workspace" && source.workspace.id === item.id
										? true
										: undefined
								}
								className={cn(
									"mb-0.5 flex min-h-9 w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm text-foreground outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
									source.type === "workspace" &&
										source.workspace.id === item.id &&
										"bg-accent font-medium text-accent-foreground ring-1 ring-inset ring-border",
								)}
								onClick={() => selectSource({ type: "workspace", workspace: item })}
							>
								<Layers size={16} className="shrink-0" />
								<span
									className="min-w-0 flex-1 truncate"
									title={item.name || t("workspace.unnamedWorkspace")}
								>
									{item.name || t("workspace.unnamedWorkspace")}
								</span>
							</button>
						))}
						{failed && (
							<div role="alert" className="px-2 py-2 text-xs text-muted-foreground">
								{t("sidebarPanels.workspacesLoadFailed")}
								<Button
									variant="ghost"
									size="sm"
									onClick={() => void loadWorkspaces(failedPage.current)}
								>
									{t("sidebarPanels.retry")}
								</Button>
							</div>
						)}
						{!failed && hasMore && (
							<Button
								variant="ghost"
								size="sm"
								className="w-full"
								disabled={loading}
								onClick={() => void loadWorkspaces(page + 1)}
							>
								{loading ? t("common.loading") : t("sidebarPanels.loadMore")}
							</Button>
						)}
						{/* 共享紧随普通目录；两类入口一起滚动，少量目录时不会留下大段空白。 */}
						<div className="mt-2 border-t border-border pt-2">
							<button
								type="button"
								aria-current={source.type === "collaboration" ? true : undefined}
								className={cn(
									"flex min-h-9 w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm text-foreground outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
									source.type === "collaboration" &&
										"bg-accent font-medium text-accent-foreground",
								)}
								onClick={() => selectSource({ type: "collaboration" })}
							>
								<Users size={16} className="shrink-0" />
								<span
									className="min-w-0 flex-1 truncate"
									title={t("workspace.collaborationProjectsTitle")}
								>
									{t("workspace.collaborationProjectsTitle")}
								</span>
							</button>
						</div>
					</div>
				</nav>
			}
		>
			{createPending && source.type !== "workspace" ? (
				<div className="flex min-h-0 flex-1 items-center justify-center p-4 text-sm text-muted-foreground">
					{t("projectNavigation.selectWorkspaceToCreate")}
				</div>
			) : source.type !== "collaboration" ? (
				<WorkspaceProjectsContent
					key={source.type === "workspace" ? source.workspace.id : "recent"}
					open={open}
					workspace={source.type === "workspace" ? source.workspace : undefined}
					searchValue={searchValue}
					onClearSearch={() => setSearchValue("")}
					onClose={close}
					initialCreating={createPending}
					onCancelCreating={() => setCreatePending(false)}
				/>
			) : (
				<CollaborationProjectsContent
					open={open}
					searchValue={searchValue}
					onClose={close}
					workspaces={workspaceStore.workspaces}
					selectedWorkspace={workspaceStore.selectedWorkspace}
					fetchWorkspaces={(params) =>
						SuperMagicService.workspace.fetchWorkspaces(params)
					}
					fetchProjects={(params) => SuperMagicService.project.fetchProjects(params)}
					onCollaborationProjectClick={(project) => {
						if (project.id !== projectStore.selectedProject?.id)
							void SuperMagicService.switchProjectInDesktop(project)
					}}
				/>
			)}
		</ProjectsPanel>
	)
}

export default observer(WorkspaceProjectsPanel)
