import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import {
	CollaborationProjectCreator,
	CollaborationProjectType,
	type CollaborationProjectListItem,
	Workspace,
	CollaborationJoinMethod,
} from "@/pages/superMagic/pages/Workspace/types"
import { SuperMagicApi } from "@/apis"
import SuperMagicService from "@/pages/superMagic/services"
import { useDebounce, useMemoizedFn } from "ahooks"
import { CreatorFilter, SortSelector, ViewToggle } from "./components"
import { SortType, ViewMode } from "../../../EmptyWorkspacePanel/components/ProjectItem"
import { Tabs } from "antd"
import useCollaboratorUpdatePanel from "../../../WithCollaborators/hooks/useCollaboratorUpdatePanel"
import useAddCollaborationToWorkspaceModal from "../AddCollaborationToWorkspaceModal/hooks/useAddCollaborationToWorkspaceModal"
import { FetchWorkspacesParams } from "@/pages/superMagic/hooks/useWorkspace"
import { FetchProjectsParams } from "@/pages/superMagic/hooks/useProjects"
import { useViewTogglePersistValue } from "./components/ViewToggle/hooks"
import routeManageService from "@/pages/superMagic/services/routeManageService"
import { userStore } from "@/models/user"
import magicToast from "@/components/base/MagicToaster/utils"

import { ProjectsPanelList } from "../ProjectsPanel"

interface CollaborationProjectsContentProps {
	open: boolean
	searchValue: string
	onClose?: () => void
	onCollaborationProjectClick: (project: CollaborationProjectListItem) => void
	workspaces: Workspace[]
	selectedWorkspace: Workspace | null
	fetchProjects: (params: FetchProjectsParams) => void
	fetchWorkspaces: (params: FetchWorkspacesParams) => void
}

interface ProjectListProps {
	projects: CollaborationProjectListItem[]
	loading: boolean
	tabType: CollaborationProjectType
	currentTab: CollaborationProjectType
	joinType: CollaborationJoinMethod
	creatorFilter: CollaborationProjectCreator[]
	sortType: SortType
	viewMode: ViewMode
	onCreatorFilterChange: (value: CollaborationProjectCreator) => void
	onSortTypeChange: (value: SortType) => void
	onViewModeChange: (value: ViewMode) => void
	onProjectClick: (project: CollaborationProjectListItem) => void
	onPinProject: (project: CollaborationProjectListItem, isPin: boolean) => void
	onAddCollaborators: (project: CollaborationProjectListItem) => void
	onAddWorkspaceShortcut: (project: CollaborationProjectListItem) => void
	onCancelWorkspaceShortcut: (projectId: string, workspaceId?: string) => void
	onShortcutNavigateToWorkspace: (project: CollaborationProjectListItem) => void
	refetchProjects: () => void
}

function SharedProjectList({
	projects,
	loading,
	tabType,
	currentTab,
	joinType,
	creatorFilter,
	sortType,
	viewMode,
	onCreatorFilterChange,
	onSortTypeChange,
	onViewModeChange,
	onProjectClick,
	...actions
}: ProjectListProps) {
	return (
		<ProjectsPanelList
			projects={projects}
			loading={loading}
			tabType={tabType}
			viewMode={viewMode}
			toolbar={
				<>
					{tabType === CollaborationProjectType.Received &&
						currentTab === CollaborationProjectType.Received &&
						joinType === CollaborationJoinMethod.Internal && (
							<CreatorFilter value={creatorFilter} onChange={onCreatorFilterChange} />
						)}
					<SortSelector value={sortType} onChange={onSortTypeChange} />
					<ViewToggle value={viewMode} onChange={onViewModeChange} />
				</>
			}
			itemProps={{
				...actions,
				onClick: onProjectClick,
				sortType,
				inCollaborationPanel: true,
			}}
		/>
	)
}

export function CollaborationProjectsContent(props: CollaborationProjectsContentProps) {
	const { workspaces, fetchWorkspaces, selectedWorkspace, fetchProjects } = props
	const { t } = useTranslation("super")
	const { isPersonalOrganization } = userStore.user

	const debouncedSearchValue = useDebounce(props.searchValue, { wait: 500 })

	// Per-tab cached data to avoid stale content when switching tabs
	const [receivedProjects, setReceivedProjects] = useState<CollaborationProjectListItem[]>([])
	const [sharedProjects, setSharedProjects] = useState<CollaborationProjectListItem[]>([])
	const [loadingReceived, setLoadingReceived] = useState(false)
	const [loadingShared, setLoadingShared] = useState(false)
	const requestIds = useRef({
		[CollaborationProjectType.Received]: 0,
		[CollaborationProjectType.Shared]: 0,
	})
	const controllers = useRef<Partial<Record<CollaborationProjectType, AbortController>>>({})
	const cancelRequests = useMemoizedFn(() => {
		for (const tab of [CollaborationProjectType.Received, CollaborationProjectType.Shared]) {
			requestIds.current[tab] += 1
			controllers.current[tab]?.abort()
			delete controllers.current[tab]
		}
	})
	const isOpenRef = useRef(false)

	const [currentTab, setCurrentTab] = useState<CollaborationProjectType>(
		CollaborationProjectType.Received,
	)
	const [joinType] = useState<CollaborationJoinMethod>(
		// Team edition cannot share externally; only personal edition can
		isPersonalOrganization ? CollaborationJoinMethod.link : CollaborationJoinMethod.Internal,
	)

	// Control bar states
	const { viewMode, setViewMode } = useViewTogglePersistValue({
		localStorageKey: "collaboration_projects_panel_view_toggle_value",
		defaultValue: ViewMode.LIST,
	})
	const [sortType, setSortType] = useState<SortType>(SortType.PROJECT_UPDATE_TIME)
	const [creatorFilter, setCreatorFilter] = useState<CollaborationProjectCreator[]>([])

	const handleCreatorFilterChange = useMemoizedFn((value: CollaborationProjectCreator) => {
		if (creatorFilter.some((item) => item.user_id === value.user_id))
			setCreatorFilter(creatorFilter.filter((item) => item.user_id !== value.user_id))
		else setCreatorFilter([...creatorFilter, value])
	})

	const handleSortTypeChange = useMemoizedFn((value: SortType) => setSortType(value))
	const handleViewModeChange = useMemoizedFn((value: ViewMode) => setViewMode(value))

	const fetchForTab = useMemoizedFn(
		(
			tab: CollaborationProjectType,
			{ resetWhenError = false }: { resetWhenError?: boolean } = {},
		) => {
			if (!isOpenRef.current) return
			controllers.current[tab]?.abort()
			const controller = new AbortController()
			controllers.current[tab] = controller
			const requestId = ++requestIds.current[tab]
			const isCurrentRequest = () =>
				!controller.signal.aborted &&
				isOpenRef.current &&
				requestIds.current[tab] === requestId
			const setLoading =
				tab === CollaborationProjectType.Received ? setLoadingReceived : setLoadingShared
			const setProjects =
				tab === CollaborationProjectType.Received ? setReceivedProjects : setSharedProjects

			setLoading(true)
			SuperMagicApi.getCollaborationProjects(
				{
					page: 1,
					page_size: 99,
					name: debouncedSearchValue,
					type: tab,
					sort_field: sortType,
					sort_direction: "desc",
					creator_user_ids:
						tab === CollaborationProjectType.Received &&
						joinType === CollaborationJoinMethod.Internal &&
						creatorFilter.length > 0
							? creatorFilter.map((item) => item.user_id)
							: undefined,
					join_method: joinType,
				},
				{ signal: controller.signal },
			)
				.then((res) => {
					if (isCurrentRequest()) setProjects(res?.list || [])
				})
				.catch(() => {
					if (isCurrentRequest() && resetWhenError) setProjects([])
				})
				.finally(() => {
					if (isCurrentRequest()) setLoading(false)
				})
		},
	)

	// Refetch current tab — used by action callbacks (pin, shortcut, etc.)
	const refetchProjects = useMemoizedFn(
		({ resetWhenError = false }: { resetWhenError?: boolean } = {}) => {
			fetchForTab(currentTab, { resetWhenError })
		},
	)

	// Refetch both tabs — used after actions that affect all tabs
	const refetchAllTabs = useMemoizedFn(() => {
		fetchForTab(CollaborationProjectType.Received)
		fetchForTab(CollaborationProjectType.Shared)
	})

	useLayoutEffect(() => {
		if (!props.open) isOpenRef.current = false
		if (props.open) {
			setCurrentTab(CollaborationProjectType.Received)
		}
		return () => {
			isOpenRef.current = false
			cancelRequests()
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [props.open])

	// Refresh all tabs when filter/sort params change
	useEffect(() => {
		if (!props.open) return
		const resetWhenError = !isOpenRef.current
		isOpenRef.current = true
		// 打开和参数变化共用一次预取；动作后的刷新仍由原回调显式触发。
		fetchForTab(CollaborationProjectType.Received, { resetWhenError })
		fetchForTab(CollaborationProjectType.Shared, { resetWhenError })
		return cancelRequests
	}, [
		props.open,
		debouncedSearchValue,
		creatorFilter,
		sortType,
		joinType,
		fetchForTab,
		cancelRequests,
	])

	const handleClose = useMemoizedFn(() => {
		isOpenRef.current = false
		cancelRequests()
		setCurrentTab(CollaborationProjectType.Received)
		handleSortTypeChange(SortType.PROJECT_UPDATE_TIME)
		setCreatorFilter([])
		props.onClose?.()
	})

	const handleProjectClick = useMemoizedFn((project: CollaborationProjectListItem) => {
		props.onCollaborationProjectClick(project)
		handleClose()
	})

	const handlePinProject = useMemoizedFn(
		async (project: CollaborationProjectListItem, isPin: boolean) => {
			const workspaceId =
				project.workspace_id || project.bind_workspace_id || selectedWorkspace?.id
			if (!workspaceId) return
			try {
				await SuperMagicService.project.pinProject(project, isPin)
				refetchAllTabs()
				if (
					project.workspace_id === selectedWorkspace?.id ||
					project.bind_workspace_id === selectedWorkspace?.id
				) {
					fetchProjects?.({
						workspaceId: selectedWorkspace?.id,
						isAutoSelect: false,
						isSelectLast: false,
						isEditLast: false,
						clearWhenNoProjects: false,
					})
				}
			} catch {
				// Error already handled in service
			}
		},
	)

	const [selectedCollaborationProject, setSelectedCollaborationProject] =
		useState<CollaborationProjectListItem | null>(null)

	const { openManageModal, CollaboratorUpdatePanel } = useCollaboratorUpdatePanel({
		selectedProject: selectedCollaborationProject,
		onClose: () => setSelectedCollaborationProject(null),
	})

	const onAddCollaborators = useMemoizedFn((project: CollaborationProjectListItem) => {
		setSelectedCollaborationProject(project)
		openManageModal()
	})

	const { AddCollaborationToWorkspaceModal, onOpen: onAddWorkspaceShortcut } =
		useAddCollaborationToWorkspaceModal({
			workspaces,
			fetchWorkspaces,
			onSuccess: (workspaceId) => {
				refetchAllTabs()
				if (workspaceId === selectedWorkspace?.id) {
					fetchProjects?.({
						workspaceId,
						isAutoSelect: false,
						isSelectLast: false,
						isEditLast: false,
						clearWhenNoProjects: false,
					})
				}
			},
		})

	const cancelWorkspaceShortcut = useMemoizedFn(
		async (projectId: string, workspaceId?: string) => {
			if (!workspaceId) return
			try {
				await SuperMagicService.project.cancelWorkspaceShortcut(projectId, workspaceId)
				magicToast.success(t("project.cancelWorkspaceShortcutSuccess"))
				if (workspaceId === selectedWorkspace?.id) {
					fetchProjects?.({
						workspaceId,
						isAutoSelect: false,
						isSelectLast: false,
						isEditLast: false,
						clearWhenNoProjects: false,
					})
				}
				refetchAllTabs()
			} catch {
				// Error already handled in service
			}
		},
	)

	const shortcutNavigateToWorkspace = useMemoizedFn((project: CollaborationProjectListItem) => {
		if (project.bind_workspace_id) {
			routeManageService.navigateToState({ workspaceId: project.bind_workspace_id })
			handleClose()
		}
	})

	// Shared props for both ProjectList instances
	const sharedListProps = useMemo(
		() => ({
			currentTab,
			joinType,
			creatorFilter,
			sortType,
			viewMode,
			onCreatorFilterChange: handleCreatorFilterChange,
			onSortTypeChange: handleSortTypeChange,
			onViewModeChange: handleViewModeChange,
			onProjectClick: handleProjectClick,
			onPinProject: handlePinProject,
			onAddCollaborators,
			onAddWorkspaceShortcut,
			onCancelWorkspaceShortcut: cancelWorkspaceShortcut,
			onShortcutNavigateToWorkspace: shortcutNavigateToWorkspace,
			refetchProjects,
		}),
		// Only re-compute when stable identities change — all handlers are memoized
		// eslint-disable-next-line react-hooks/exhaustive-deps
		[currentTab, joinType, creatorFilter, sortType, viewMode],
	)

	// Stable per-tab fetch callbacks for ProjectList's refetchProjects prop
	const refetchReceived = useCallback(
		() => fetchForTab(CollaborationProjectType.Received),
		// eslint-disable-next-line react-hooks/exhaustive-deps
		[],
	)
	const refetchShared = useCallback(
		() => fetchForTab(CollaborationProjectType.Shared),
		// eslint-disable-next-line react-hooks/exhaustive-deps
		[],
	)

	return (
		<>
			{/* Tabs — both panes stay mounted to avoid remount lag on switch */}
			<Tabs
				activeKey={currentTab}
				onChange={(key) => setCurrentTab(key as CollaborationProjectType)}
				className="min-h-0 flex-1 [&_.magic-tabs-content-holder]:flex [&_.magic-tabs-content-holder]:min-h-0 [&_.magic-tabs-content-holder]:flex-1 [&_.magic-tabs-content]:flex [&_.magic-tabs-content]:min-h-0 [&_.magic-tabs-content]:flex-1 [&_.magic-tabs-nav]:!mb-0 [&_.magic-tabs-nav]:shrink-0 [&_.magic-tabs-nav]:!pl-5 [&_.magic-tabs-tabpane-active]:flex [&_.magic-tabs-tabpane-active]:min-h-0 [&_.magic-tabs-tabpane-active]:flex-1 [&_.magic-tabs-tabpane-active]:flex-col"
				destroyOnHidden={false}
				data-testid="shared-workspace-dialog-tabs"
				items={[
					{
						label: (
							<span data-testid="shared-workspace-dialog-tab-received">
								{joinType === CollaborationJoinMethod.Internal
									? t("workspace.teamSharedWithMe")
									: t("workspace.externalSharedWithMe")}
							</span>
						),
						key: CollaborationProjectType.Received,
						children: (
							<SharedProjectList
								{...sharedListProps}
								tabType={CollaborationProjectType.Received}
								projects={receivedProjects}
								loading={loadingReceived}
								refetchProjects={refetchReceived}
							/>
						),
					},
					{
						label: (
							<span data-testid="shared-workspace-dialog-tab-shared">
								{t("workspace.sharedByMe")}
							</span>
						),
						key: CollaborationProjectType.Shared,
						children: (
							<SharedProjectList
								{...sharedListProps}
								tabType={CollaborationProjectType.Shared}
								projects={sharedProjects}
								loading={loadingShared}
								refetchProjects={refetchShared}
							/>
						),
					},
				]}
			/>
			{CollaboratorUpdatePanel}
			{AddCollaborationToWorkspaceModal}
		</>
	)
}

export default memo(CollaborationProjectsContent)
