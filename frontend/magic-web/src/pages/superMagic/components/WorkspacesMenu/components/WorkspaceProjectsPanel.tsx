import { useEffect, useRef, useState } from "react"
import { useMemoizedFn } from "ahooks"
import { observer } from "mobx-react-lite"
import { Layers, Users } from "lucide-react"
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

interface WorkspaceProjectsPanelProps {
	open: boolean
	workspace: Workspace
	initialSource?: "workspace" | "collaboration"
	onClose: () => void
}

type ProjectBrowserSource = { type: "workspace"; workspace: Workspace } | { type: "collaboration" }
const WORKSPACE_PAGE_SIZE = 20

function WorkspaceProjectsPanel({
	open,
	workspace,
	initialSource = "workspace",
	onClose,
}: WorkspaceProjectsPanelProps) {
	const { t } = useTranslation("super")
	const { searchValue, onSearchValueChange, setSearchValue } = useSearchValue()
	const [source, setSource] = useState<ProjectBrowserSource>(() =>
		initialSource === "collaboration"
			? { type: "collaboration" }
			: { type: "workspace", workspace },
	)
	const [workspaces, setWorkspaces] = useState<Workspace[]>(() =>
		Array.from(
			new Map(
				[
					...workspaceStore.workspaces,
					...(initialSource === "workspace" ? [workspace] : []),
				]
					.filter((item) => item.id && item.workspace_type === "default")
					.map((item) => [item.id, item]),
			).values(),
		),
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

	useEffect(() => {
		isOpen.current = open
		if (open) void loadWorkspaces(1)
		return () => {
			isOpen.current = false
			requestId.current += 1
			pending.current = false
		}
	}, [open, loadWorkspaces])

	const selectSource = (next: ProjectBrowserSource) => {
		if (
			next.type === source.type &&
			(next.type === "collaboration" ||
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
	const title =
		source.type === "workspace"
			? source.workspace.name || t("workspace.unnamedWorkspace")
			: t("workspace.collaborationProjectsTitle")

	return (
		<ProjectsPanel
			open={open}
			title={title}
			searchValue={searchValue}
			onSearchValueChange={onSearchValueChange}
			onClose={close}
			sidebar={
				<nav
					aria-label={t("sidebarPanels.browseWorkspaces")}
					className="flex w-[180px] shrink-0 flex-col border-r border-border bg-muted/20 p-2 max-sm:w-[128px]"
				>
					<div className="px-2 py-2 text-xs font-medium text-muted-foreground">
						{t("sidebarPanels.browseWorkspaces")}
					</div>
					<div className="max-h-[55vh] flex-1 overflow-y-auto">
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
									"mb-0.5 flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-xs hover:bg-accent",
									source.type === "workspace" &&
										source.workspace.id === item.id &&
										"bg-accent text-accent-foreground",
								)}
								onClick={() => selectSource({ type: "workspace", workspace: item })}
							>
								<Layers size={16} className="shrink-0" />
								<span className="min-w-0 flex-1 truncate">
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
					</div>
					<button
						type="button"
						aria-current={source.type === "collaboration" ? true : undefined}
						className={cn(
							"mt-2 flex items-center gap-2 rounded-md border-t border-border px-2 py-2 text-left text-xs hover:bg-accent",
							source.type === "collaboration" && "bg-accent text-accent-foreground",
						)}
						onClick={() => selectSource({ type: "collaboration" })}
					>
						<Users size={16} className="shrink-0" />
						<span className="truncate">
							{t("workspace.collaborationProjectsTitle")}
						</span>
					</button>
				</nav>
			}
		>
			{source.type === "workspace" ? (
				<WorkspaceProjectsContent
					key={source.workspace.id}
					open={open}
					workspace={source.workspace}
					searchValue={searchValue}
					onClearSearch={() => setSearchValue("")}
					onClose={close}
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
