import { useCallback, useEffect, useRef, useState } from "react"
import { observer } from "mobx-react-lite"
import { runInAction } from "mobx"
import { useTranslation } from "react-i18next"
import { useMemoizedFn } from "ahooks"
import { Loader2, Plus } from "lucide-react"
import { SuperMagicApi } from "@/apis"
import magicToast from "@/components/base/MagicToaster/utils"
import { Button } from "@/components/shadcn-ui/button"
import { ScrollArea } from "@/components/shadcn-ui/scroll-area"
import ProjectItem, {
	ViewMode,
} from "@/pages/superMagic/components/EmptyWorkspacePanel/components/ProjectItem"
import useProjectItemActionProps from "@/pages/superMagic/components/EmptyWorkspacePanel/hooks/useProjectItemActionProps"
import type { Workspace } from "@/pages/superMagic/pages/Workspace/types"
import { projectStore } from "@/pages/superMagic/stores/core"
import SuperMagicService from "@/pages/superMagic/services"
import { createAiCanvasDocument } from "@/pages/superMagic/pages/TopicPage/utils/aiCanvas"
import { preloadTopicPage } from "@/pages/superMagic/pages/TopicPage/utils"
import AiCanvasCreatePrompt from "./components/AiCanvasCreatePrompt"

const PAGE_SIZE = 60

/**
 * AI canvas home: the project page of the system-managed ai-canvas workspace.
 *
 * Data ownership: projects are written into projectStore.projectsByWorkspace for this workspace
 * only (never projectStore.projects), so shared rename/delete actions update the list in place
 * without replacing the sidebar's current workspace list.
 */
function AiCanvasPage() {
	const { t } = useTranslation("aiCanvas")
	const [workspace, setWorkspace] = useState<Workspace | null>(null)
	const [workspaceError, setWorkspaceError] = useState(false)
	const [listError, setListError] = useState(false)
	const [isListLoading, setIsListLoading] = useState(false)
	const [hasMore, setHasMore] = useState(false)
	const [isCreating, setIsCreating] = useState(false)
	const pageRef = useRef(1)
	// Latest list request wins; older responses (e.g. a background refresh) are dropped.
	const listRequestRef = useRef<AbortController | null>(null)

	const projects = workspace ? projectStore.getProjectsByWorkspace(workspace.id) : []
	const actions = useProjectItemActionProps({ selectedWorkspace: workspace })

	const loadWorkspace = useMemoizedFn(async () => {
		setWorkspaceError(false)
		try {
			setWorkspace(await SuperMagicApi.getAiCanvasWorkspace())
		} catch {
			setWorkspaceError(true)
		}
	})

	/**
	 * Loads one page. `page === 1` replaces the cached first page but keeps rendered items until
	 * the request succeeds, so background reconciliation never blanks the list.
	 */
	const loadProjects = useCallback(async (targetWorkspace: Workspace, page: number) => {
		listRequestRef.current?.abort()
		const controller = new AbortController()
		listRequestRef.current = controller
		setIsListLoading(true)
		setListError(false)
		try {
			const response = await SuperMagicApi.getProjects({
				workspace_id: targetWorkspace.id,
				order_by: "updated_at",
				sort: "desc",
				page,
				page_size: PAGE_SIZE,
			})
			if (controller.signal.aborted) return
			const list = response?.list ?? []
			runInAction(() => {
				if (page === 1) {
					// A fresh first page replaces the cache so projects deleted elsewhere disappear.
					projectStore.projectsByWorkspace.set(targetWorkspace.id, list)
				} else {
					projectStore.projectsByWorkspace.set(targetWorkspace.id, [
						...projectStore.getProjectsByWorkspace(targetWorkspace.id),
						...list.filter(
							(item) =>
								!projectStore
									.getProjectsByWorkspace(targetWorkspace.id)
									.some((existing) => existing.id === item.id),
						),
					])
				}
			})
			pageRef.current = page
			setHasMore(page * PAGE_SIZE < (response?.total ?? 0))
		} catch {
			if (!controller.signal.aborted) setListError(true)
		} finally {
			if (listRequestRef.current === controller) {
				listRequestRef.current = null
				setIsListLoading(false)
			}
		}
	}, [])

	useEffect(() => {
		void loadWorkspace()
	}, [loadWorkspace])

	useEffect(() => {
		if (!workspace) return
		void loadProjects(workspace, 1)
		return () => listRequestRef.current?.abort()
	}, [loadProjects, workspace])

	// Reconcile after the tab returns or a bfcache restore: projects may have been created,
	// renamed or deleted elsewhere. Re-reading the first page keeps scroll and rendered items.
	useEffect(() => {
		if (!workspace) return
		const refresh = () => {
			if (document.visibilityState !== "visible") return
			void loadProjects(workspace, 1)
		}
		const handlePageShow = (event: PageTransitionEvent) => {
			if (event.persisted) refresh()
		}
		document.addEventListener("visibilitychange", refresh)
		window.addEventListener("pageshow", handlePageShow)
		return () => {
			document.removeEventListener("visibilitychange", refresh)
			window.removeEventListener("pageshow", handlePageShow)
		}
	}, [loadProjects, workspace])

	const handleCreateCanvas = useMemoizedFn(async () => {
		if (!workspace?.id || isCreating) return
		setIsCreating(true)
		try {
			const created = await SuperMagicApi.createAiCanvasProject({
				workspace_id: String(workspace.id),
			})
			try {
				await createAiCanvasDocument(String(created.project.id))
			} catch {
				// The project page creates the missing canvas again, so opening it is still safe.
			}
			await SuperMagicService.switchProjectInDesktop(created.project)
		} catch {
			magicToast.error(t("home.createFailed"))
		} finally {
			setIsCreating(false)
		}
	})

	if (workspaceError) {
		return (
			<div className="flex h-full w-full flex-col items-center justify-center gap-3 text-sm text-muted-foreground">
				<span>{t("home.workspaceFailed")}</span>
				<Button variant="outline" size="sm" onClick={loadWorkspace}>
					{t("home.retry")}
				</Button>
			</div>
		)
	}

	const isInitialLoading = !workspace || (isListLoading && projects.length === 0)

	return (
		<ScrollArea className="h-full w-full" data-testid="ai-canvas-page">
			<div className="mx-auto flex w-full max-w-[1040px] flex-col gap-6 px-4 py-10">
				<header className="flex items-start justify-between gap-4">
					<div className="flex flex-col gap-1">
						<h1 className="text-2xl font-semibold text-foreground">
							{t("home.title")}
						</h1>
						<p className="text-sm text-muted-foreground">{t("home.subtitle")}</p>
					</div>
					<Button
						onClick={handleCreateCanvas}
						disabled={!workspace || isCreating}
						data-testid="ai-canvas-create-button"
					>
						{isCreating ? (
							<Loader2 size={16} className="animate-spin" aria-hidden="true" />
						) : (
							<Plus size={16} aria-hidden="true" />
						)}
						{t("home.newCanvas")}
					</Button>
				</header>

				<AiCanvasCreatePrompt workspace={workspace} />

				<section className="flex flex-col gap-3">
					<h2 className="text-base font-medium text-foreground">
						{t("home.myCanvases")}
					</h2>
					{isInitialLoading ? (
						<div className="flex h-32 items-center justify-center text-muted-foreground">
							<Loader2 size={16} className="animate-spin" aria-hidden="true" />
						</div>
					) : listError && projects.length === 0 ? (
						<div className="flex h-32 flex-col items-center justify-center gap-2 text-sm text-muted-foreground">
							<span>{t("home.loadFailed")}</span>
							<Button
								variant="outline"
								size="sm"
								onClick={() => workspace && loadProjects(workspace, 1)}
							>
								{t("home.retry")}
							</Button>
						</div>
					) : projects.length === 0 ? (
						<div className="flex h-32 items-center justify-center text-sm text-muted-foreground">
							{t("home.empty")}
						</div>
					) : (
						<>
							{/* Same 4-column card grid as the workspace project page. */}
							<div className="grid grid-cols-2 gap-2.5 md:grid-cols-3 lg:grid-cols-4">
								{projects.map((project, index) => (
									<ProjectItem
										key={project.id}
										index={index}
										project={project}
										viewMode={ViewMode.GRID}
										onClick={actions.handleProjectClick}
										onRenameProject={actions.handleRenameProject}
										onDeleteProject={actions.handleDeleteProjectConfirm}
										onMouseEnter={preloadTopicPage}
									/>
								))}
							</div>
							{hasMore ? (
								<Button
									variant="ghost"
									className="self-center"
									disabled={isListLoading}
									onClick={() =>
										workspace && loadProjects(workspace, pageRef.current + 1)
									}
								>
									{isListLoading ? (
										<Loader2
											size={16}
											className="animate-spin"
											aria-hidden="true"
										/>
									) : null}
									{t("home.loadMore")}
								</Button>
							) : null}
						</>
					)}
				</section>
			</div>
			{actions.projectModals}
		</ScrollArea>
	)
}

export default observer(AiCanvasPage)
