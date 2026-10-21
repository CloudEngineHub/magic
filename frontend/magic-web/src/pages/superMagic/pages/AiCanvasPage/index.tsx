import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { observer } from "mobx-react-lite"
import { runInAction } from "mobx"
import { useTranslation } from "react-i18next"
import { useMemoizedFn } from "ahooks"
import { LayoutGrid, Loader2, Plus } from "lucide-react"
import { SuperMagicApi } from "@/apis"
import magicToast from "@/components/base/MagicToaster/utils"
import { Button } from "@/components/shadcn-ui/button"
import { ScrollArea } from "@/components/shadcn-ui/scroll-area"
import useProjectItemActionProps from "@/pages/superMagic/components/EmptyWorkspacePanel/hooks/useProjectItemActionProps"
import type { ProjectListItem, Workspace } from "@/pages/superMagic/pages/Workspace/types"
import { projectStore } from "@/pages/superMagic/stores/core"
import SuperMagicService from "@/pages/superMagic/services"
import { createAiCanvasDocument } from "@/pages/superMagic/pages/TopicPage/utils/aiCanvas"
import { preloadTopicPage } from "@/pages/superMagic/pages/TopicPage/utils"
import AiCanvasCreatePrompt from "./components/AiCanvasCreatePrompt"
import AiCanvasHero from "./components/AiCanvasHero"
import AiCanvasNewCard from "./components/AiCanvasNewCard"
import AiCanvasProjectCard from "./components/AiCanvasProjectCard"
import { useCanvasCovers } from "./hooks/useCanvasCovers"
import { buildBoardArtworks } from "./utils/boardArtworks"

const PAGE_SIZE = 60
// Stable empty list so memoized derivations do not recompute before the workspace loads.
const NO_PROJECTS: ProjectListItem[] = []

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

	const projects = workspace ? projectStore.getProjectsByWorkspace(workspace.id) : NO_PROJECTS
	const actions = useProjectItemActionProps({ selectedWorkspace: workspace })
	const covers = useCanvasCovers(projects)
	// Static: the hero board only shows the built-in showcase (placeholders until it exists).
	const boardArtworks = useMemo(() => buildBoardArtworks(), [])

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
		// Same rounded page frame as the micro-app home: an 8px inset card that fills the main area,
		// with the hero and the sections below sharing one surface.
		<ScrollArea
			className="m-2 h-[calc(100%_-_16px)] w-[calc(100%_-_16px)] overflow-hidden rounded-2xl border border-border/70 bg-background shadow-sm"
			data-testid="ai-canvas-page"
		>
			{/* The hero is full-bleed; the sections below keep a centered reading width. */}
			<div className="flex w-full flex-col">
				<AiCanvasHero
					artworks={boardArtworks}
					footer={
						<div className="flex flex-wrap items-center justify-center gap-2 text-sm text-muted-foreground">
							<span>{t("home.or")}</span>
							<Button
								variant="outline"
								size="sm"
								className="rounded-full bg-background/80 backdrop-blur"
								onClick={handleCreateCanvas}
								disabled={!workspace || isCreating}
								data-testid="ai-canvas-create-button"
							>
								{isCreating ? (
									<Loader2
										size={16}
										className="animate-spin"
										aria-hidden="true"
									/>
								) : (
									<Plus size={16} aria-hidden="true" />
								)}
								{t("home.newBlankCanvas")}
							</Button>
						</div>
					}
				>
					<AiCanvasCreatePrompt workspace={workspace} />
				</AiCanvasHero>

				<div className="mx-auto flex w-full max-w-[1200px] flex-col gap-12 px-6 pb-16 pt-8">
					<section className="flex flex-col gap-4">
						<div className="flex items-end justify-between gap-3">
							<div className="flex flex-col gap-1">
								<h2 className="flex items-center gap-2 text-lg font-semibold text-foreground">
									<LayoutGrid size={16} aria-hidden="true" />
									{t("home.myCanvases")}
								</h2>
								<p className="text-sm text-muted-foreground">
									{t("home.myCanvasesSubtitle")}
								</p>
							</div>
						</div>
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
						) : (
							<>
								<div className="grid grid-cols-2 gap-x-4 gap-y-6 md:grid-cols-3 xl:grid-cols-4">
									{/* Always first, so it also serves as the empty state. */}
									<AiCanvasNewCard
										creating={isCreating}
										disabled={!workspace || isCreating}
										onCreate={handleCreateCanvas}
									/>
									{projects.map((project) => (
										<AiCanvasProjectCard
											key={project.id}
											project={project}
											covers={covers[project.id]}
											onOpen={actions.handleProjectClick}
											onRename={actions.handleRenameProject}
											onDelete={actions.handleDeleteProjectConfirm}
											onHover={preloadTopicPage}
										/>
									))}
								</div>
								{hasMore ? (
									<Button
										variant="ghost"
										className="self-center"
										disabled={isListLoading}
										onClick={() =>
											workspace &&
											loadProjects(workspace, pageRef.current + 1)
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
			</div>
			{actions.projectModals}
		</ScrollArea>
	)
}

export default observer(AiCanvasPage)
