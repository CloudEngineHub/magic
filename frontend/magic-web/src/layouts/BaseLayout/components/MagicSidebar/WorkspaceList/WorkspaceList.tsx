import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import { observer } from "mobx-react-lite"
import { toJS } from "mobx"
import { useRequest } from "ahooks"
import { useImmer } from "use-immer"
import { Loader2, Plus, RefreshCw, Search, X } from "lucide-react"
import { useTranslation } from "react-i18next"
import { sidebarStore } from "@/stores/layout"
import workspaceStore from "@/pages/superMagic/stores/core/workspace"
import superMagicService from "@/pages/superMagic/services"
import { SuperMagicApi } from "@/apis"
import type { ProjectListItem, Workspace } from "@/pages/superMagic/pages/Workspace/types"
import WorkspaceItem from "./WorkspaceItem"
import CreateWorkspaceInput from "./CreateWorkspaceInput"
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/shadcn-ui/input-group"
import { Button } from "@/components/shadcn-ui/button"
import { cn } from "@/lib/utils"
import { toTestIdSegment } from "@/utils/testid"
import {
	SidebarGroup,
	SidebarGroupContent,
	SidebarGroupLabel,
	SidebarMenu,
} from "@/components/shadcn-ui/sidebar"

const SEARCH_PAGE_SIZE = 20

interface WorkspaceListProps {
	beforeItems?: ReactNode
}

function WorkspaceList({ beforeItems }: WorkspaceListProps) {
	const { t } = useTranslation()
	const [isCreatingWorkspace, setIsCreatingWorkspace] = useState(false)
	const [isRefreshing, setIsRefreshing] = useState(false)
	const [isSearchMode, setIsSearchMode] = useState(false)
	const [searchState, updateSearchState] = useImmer({
		value: "",
		workspaces: [] as Workspace[],
		projects: [] as ProjectListItem[],
		page: 1,
		hasMoreWorkspaces: true,
	})
	const [isLoadingMoreWorkspaces, setIsLoadingMoreWorkspaces] = useState(false)
	const [workspacePage, setWorkspacePage] = useState(1)
	const [hasMoreWorkspaces, setHasMoreWorkspaces] = useState(true)
	const workspaces = workspaceStore.workspaces
	const hasRequestedInitialLoadRef = useRef(false)
	const isInitialWorkspaceListLoading =
		workspaceStore.isWorkspaceListLoading && workspaces.length === 0
	const selectedWorkspaceId = workspaceStore.selectedWorkspace?.id
	const workspaceListRef = useRef<HTMLDivElement>(null)
	const loadMoreSentinelRef = useRef<HTMLDivElement>(null)
	const isLoadingMoreWorkspacesRef = useRef(false)
	// `useRequest` turns `loading` on only after debounce. This marker prevents
	// a visible sentinel from replacing the queued first search page with page two.
	const isSearchPendingRef = useRef(false)
	const projectsByWorkspaceId = useMemo(() => {
		const result = new Map<string, ProjectListItem[]>()
		for (const project of searchState.projects) {
			const projects = result.get(project.workspace_id) || []
			projects.push(project)
			result.set(project.workspace_id, projects)
		}
		return result
	}, [searchState.projects])
	const displayedWorkspaces = isSearchMode
		? Array.from(
				new Map(
					[
						...searchState.workspaces,
						...workspaces.filter((workspace) =>
							projectsByWorkspaceId.has(workspace.id),
						),
					].map((workspace) => [workspace.id, workspace]),
				).values(),
			)
		: workspaces

	function handleStartCreateWorkspace() {
		setIsCreatingWorkspace(true)
	}

	function handleCancelCreateWorkspace() {
		setIsCreatingWorkspace(false)
	}

	function handleWorkspaceCreated() {
		setIsCreatingWorkspace(false)
	}

	async function handleRefresh() {
		if (isRefreshing) return
		setIsRefreshing(true)
		try {
			// Keep manual refresh focused on sidebar data caches so the action
			// updates visible workspace/project lists without issuing extra status-only requests.
			await superMagicService.silentRefreshSidebarLoadedCaches()
			setWorkspacePage(1)
			setHasMoreWorkspaces(true)
		} finally {
			setIsRefreshing(false)
		}
	}

	const loadMoreWorkspaces = useCallback(async () => {
		if (
			isLoadingMoreWorkspacesRef.current ||
			isLoadingMoreWorkspaces ||
			!hasMoreWorkspaces ||
			workspaceStore.isWorkspaceListLoading
		)
			return

		// IntersectionObserver can invoke its callback again before React commits
		// the loading state; the ref closes that short concurrent-request window.
		isLoadingMoreWorkspacesRef.current = true
		setIsLoadingMoreWorkspaces(true)
		try {
			const nextPage = workspacePage + 1
			const nextWorkspaces = await superMagicService.workspace.fetchWorkspaces({
				page: nextPage,
				pageSize: SEARCH_PAGE_SIZE,
				append: true,
				isAutoSelect: false,
				isSelectLast: false,
			})
			setWorkspacePage(nextPage)
			setHasMoreWorkspaces(nextWorkspaces.length === SEARCH_PAGE_SIZE)
		} finally {
			isLoadingMoreWorkspacesRef.current = false
			setIsLoadingMoreWorkspaces(false)
		}
	}, [hasMoreWorkspaces, isLoadingMoreWorkspaces, workspacePage])

	const {
		run: runSearch,
		cancel: cancelSearch,
		loading: isSearchLoading,
	} = useRequest(
		async ({ keyword, page, append }: { keyword: string; page: number; append: boolean }) => {
			const searchName = keyword.trim()
			return Promise.all([
				searchState.hasMoreWorkspaces || !append
					? SuperMagicApi.getWorkspaces({
							page,
							page_size: SEARCH_PAGE_SIZE,
							workspace_name: searchName,
						})
					: Promise.resolve(null),
				!append
					? SuperMagicApi.getProjectsWithCollaboration({
							page: 1,
							page_size: 100,
							project_name: searchName,
						})
					: Promise.resolve(null),
			])
		},
		{
			manual: true,
			debounceWait: 300,
			onSuccess: ([workspaceResponse, projectResponse], [{ page, append }]) => {
				isSearchPendingRef.current = false
				const workspaceList = workspaceResponse?.list || []
				const projectList = projectResponse?.list || []
				updateSearchState((draft) => {
					draft.hasMoreWorkspaces = Boolean(
						workspaceResponse && page * SEARCH_PAGE_SIZE < workspaceResponse.total,
					)
					draft.workspaces = append
						? [...draft.workspaces, ...workspaceList]
						: workspaceList
					draft.projects = append ? [...draft.projects, ...projectList] : projectList
					draft.page = page
				})
			},
			onError: (_error, [{ append }]) => {
				isSearchPendingRef.current = false
				if (!append) {
					updateSearchState((draft) => {
						draft.workspaces = []
						draft.projects = []
					})
				}
			},
		},
	)

	const searchWorkspaces = useCallback(
		(workspaceName: string) => {
			if (!workspaceName.trim()) {
				cancelSearch()
				isSearchPendingRef.current = false
				updateSearchState((draft) => {
					draft.page = 1
					draft.hasMoreWorkspaces = true
					draft.workspaces = toJS(workspaces)
					draft.projects = []
				})
				return
			}

			// Invalidate a previous in-flight request before the next debounced search starts.
			cancelSearch()
			isSearchPendingRef.current = true
			updateSearchState((draft) => {
				draft.page = 1
				draft.hasMoreWorkspaces = true
			})
			runSearch({ keyword: workspaceName, page: 1, append: false })
		},
		[cancelSearch, runSearch, updateSearchState, workspaces],
	)

	const loadNextPage = useCallback(() => {
		if (!isSearchMode) {
			void loadMoreWorkspaces()
			return
		}

		if (
			!searchState.value.trim() ||
			isSearchLoading ||
			isSearchPendingRef.current ||
			!searchState.hasMoreWorkspaces
		)
			return

		isSearchPendingRef.current = true
		runSearch({ keyword: searchState.value, page: searchState.page + 1, append: true })
	}, [
		isSearchLoading,
		isSearchMode,
		loadMoreWorkspaces,
		searchState.hasMoreWorkspaces,
		searchState.page,
		searchState.value,
		runSearch,
	])

	useEffect(() => {
		const sentinel = loadMoreSentinelRef.current
		if (!sentinel || typeof IntersectionObserver === "undefined") return
		const scrollContainer = sentinel.closest<HTMLElement>(
			"[data-testid='sidebar-content-root']",
		)
		if (!scrollContainer) return

		const observer = new IntersectionObserver(
			(entries) => {
				if (entries[0]?.isIntersecting) loadNextPage()
			},
			// Observe the shared sidebar scroll container. An initially visible sentinel
			// naturally loads enough pages to fill tall screens without manual measurements.
			{ root: scrollContainer, threshold: 0 },
		)
		observer.observe(sentinel)
		return () => observer.disconnect()
	}, [displayedWorkspaces.length, loadNextPage])

	const handleSearchOpen = useCallback(() => {
		updateSearchState((draft) => {
			draft.workspaces = toJS(workspaces)
			draft.projects = []
			draft.page = 1
			draft.hasMoreWorkspaces = true
		})
		setIsSearchMode(true)
	}, [updateSearchState, workspaces])

	const handleSearchClose = useCallback(() => {
		cancelSearch()
		isSearchPendingRef.current = false
		updateSearchState((draft) => {
			draft.value = ""
			draft.workspaces = []
			draft.projects = []
			draft.page = 1
			draft.hasMoreWorkspaces = true
		})
		setIsSearchMode(false)
	}, [cancelSearch, updateSearchState])

	useEffect(() => {
		if (workspaces.length > 0) return
		if (workspaceStore.isWorkspaceListLoading) return
		if (hasRequestedInitialLoadRef.current) return

		hasRequestedInitialLoadRef.current = true
		void superMagicService.workspace.fetchWorkspaces({
			page: 1,
			pageSize: SEARCH_PAGE_SIZE,
			isAutoSelect: false,
			isSelectLast: false,
		})
	}, [workspaces.length])

	useEffect(() => {
		if (!selectedWorkspaceId) return

		sidebarStore.setActiveWorkspace(selectedWorkspaceId)
		sidebarStore.setWorkspaceExpanded(selectedWorkspaceId, true)

		const workspaceIdSegment = toTestIdSegment(selectedWorkspaceId)
		const animationFrameId = window.requestAnimationFrame(() => {
			const workspaceElement = workspaceListRef.current?.querySelector<HTMLElement>(
				`[data-workspace-id-segment="${workspaceIdSegment}"]`,
			)
			workspaceElement?.scrollIntoView({
				behavior: "smooth",
				block: "start",
			})
		})

		return () => window.cancelAnimationFrame(animationFrameId)
	}, [selectedWorkspaceId])

	return (
		<SidebarGroup
			className="flex w-full shrink-0 flex-col py-0 pl-2 pr-0"
			data-testid="sidebar-workspace-list"
		>
			{isSearchMode ? (
				<div className="flex h-9 items-center gap-1 px-2 pr-3 duration-200 animate-in fade-in">
					<InputGroup className="h-7 flex-1 rounded-md bg-sidebar duration-300 animate-in fade-in slide-in-from-left-4 [&:has([data-slot=input-group-control]:focus-visible)]:border-sidebar-border [&:has([data-slot=input-group-control]:focus-visible)]:ring-0">
						<InputGroupAddon align="inline-start">
							<Search size={16} />
						</InputGroupAddon>
						<InputGroupInput
							className="h-6"
							placeholder={t("super:workspace.searchWorkspace")}
							value={searchState.value}
							onChange={(event) => {
								const value = event.target.value
								updateSearchState((draft) => {
									draft.value = value
								})
							}}
							onValueChangeAfterComposition={searchWorkspaces}
							autoFocus
							data-testid="sidebar-workspace-list-search-input"
						/>
					</InputGroup>
					<Button
						type="button"
						size="icon-sm"
						className="size-7 border bg-white text-foreground duration-300 animate-in fade-in hover:bg-accent"
						onClick={handleSearchClose}
						aria-label={t("common.cancel")}
						data-testid="sidebar-workspace-list-search-close"
					>
						<X className="size-4" />
					</Button>
				</div>
			) : (
				<SidebarGroupLabel className="h-8 px-2 text-xs font-medium leading-4 text-[#737373] opacity-70 dark:text-[#a3a3a3] dark:opacity-100">
					{t("sidebar:workspace.title")}
				</SidebarGroupLabel>
			)}
			<div
				className={cn(
					"absolute right-3.5 top-1.5 z-10 flex items-center gap-0.5 opacity-70",
					"group-data-[collapsible=icon]:hidden",
					isSearchMode && "hidden",
				)}
				data-testid="sidebar-workspace-list-actions"
			>
				<button
					type="button"
					aria-label={t("super:workspace.searchWorkspace")}
					data-testid="sidebar-workspace-list-search"
					className="outline-hidden relative flex h-5 w-5 shrink-0 items-center justify-center rounded-md p-0 text-sidebar-foreground ring-sidebar-ring transition-transform hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 [&>svg]:size-4"
					onClick={handleSearchOpen}
				>
					<Search className="h-4 w-4" />
				</button>
				{isInitialWorkspaceListLoading && (
					<Loader2
						className="h-4 w-4 shrink-0 animate-spin text-[rgb(var(--muted-foreground-rgb))] opacity-70"
						aria-hidden
						data-testid="sidebar-workspace-list-loading"
					/>
				)}
				<button
					type="button"
					aria-label={t("sidebar:workspace.refresh")}
					data-testid="sidebar-workspace-list-refresh"
					disabled={isRefreshing}
					className={cn(
						"outline-hidden relative flex h-5 w-5 shrink-0 items-center justify-center rounded-md p-0 text-sidebar-foreground ring-sidebar-ring transition-transform hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 [&>svg]:size-4",
						"after:absolute after:-inset-2 md:after:hidden",
					)}
					onClick={() => void handleRefresh()}
				>
					<RefreshCw className={cn("h-4 w-4", isRefreshing && "animate-spin")} />
				</button>
				<button
					type="button"
					aria-label={t("sidebar:workspace.add")}
					data-testid="sidebar-workspace-list-add"
					className={cn(
						"outline-hidden relative flex h-5 w-5 shrink-0 items-center justify-center rounded-md p-0 text-sidebar-foreground ring-sidebar-ring transition-transform hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 [&>svg]:size-4",
						"after:absolute after:-inset-2 md:after:hidden",
					)}
					onClick={handleStartCreateWorkspace}
				>
					<Plus className="h-4 w-4" />
				</button>
			</div>
			<SidebarGroupContent>
				<SidebarMenu>
					<div className="w-full pr-3">
						{beforeItems}
						<div ref={workspaceListRef}>
							{isCreatingWorkspace && (
								<div className="w-full duration-150 animate-in fade-in slide-in-from-top-2">
									<CreateWorkspaceInput
										onCancel={handleCancelCreateWorkspace}
										onCreated={handleWorkspaceCreated}
									/>
								</div>
							)}
							{displayedWorkspaces.map((workspace, index) => (
								<WorkspaceItem
									key={workspace.id}
									workspace={workspace}
									searchProjects={
										isSearchMode && projectsByWorkspaceId.has(workspace.id)
											? projectsByWorkspaceId.get(workspace.id)
											: undefined
									}
									className={cn(
										"mb-[2px]",
										index === displayedWorkspaces.length - 1 && "mb-0",
									)}
								/>
							))}
							{isSearchLoading && (
								<div className="flex h-8 items-center justify-center text-xs text-muted-foreground">
									<Loader2 className="size-4 animate-spin" />
								</div>
							)}
							{!isSearchMode && isLoadingMoreWorkspaces && (
								<div className="flex h-8 items-center justify-center text-xs text-muted-foreground">
									<Loader2 className="size-4 animate-spin" />
								</div>
							)}
							<div ref={loadMoreSentinelRef} className="h-px" aria-hidden="true" />
						</div>
					</div>
				</SidebarMenu>
			</SidebarGroupContent>
		</SidebarGroup>
	)
}

export default observer(WorkspaceList)
