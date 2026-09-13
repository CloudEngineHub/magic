import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react"
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
	const isOpenRef = useRef(Boolean(props.open))

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
			const requestId = ++requestIds.current[tab]
			const setLoading =
				tab === CollaborationProjectType.Received ? setLoadingReceived : setLoadingShared
			const setProjects =
				tab === CollaborationProjectType.Received ? setReceivedProjects : setSharedProjects

			setLoading(true)
			SuperMagicApi.getCollaborationProjects({
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
			})
				.then((res) => {
					if (isOpenRef.current && requestIds.current[tab] === requestId)
						setProjects(res?.list || [])
				})
				.catch(() => {
					if (
						isOpenRef.current &&
						requestIds.current[tab] === requestId &&
						resetWhenError
					)
						setProjects([])
				})
				.finally(() => {
					if (isOpenRef.current && requestIds.current[tab] === requestId)
						setLoading(false)
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

	useEffect(() => {
		const requests = requestIds.current
		isOpenRef.current = Boolean(props.open)
		if (props.open) {
			setCurrentTab(CollaborationProjectType.Received)
			fetchForTab(CollaborationProjectType.Received, { resetWhenError: true })
			fetchForTab(CollaborationProjectType.Shared, { resetWhenError: true })
		}
		return () => {
			isOpenRef.current = false
			requests[CollaborationProjectType.Received] += 1
			requests[CollaborationProjectType.Shared] += 1
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [props.open])

	// Refresh all tabs when filter/sort params change
	useEffect(() => {
		if (!props.open) return
		refetchAllTabs()
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [debouncedSearchValue, creatorFilter, sortType])

	const handleClose = useMemoizedFn(() => {
		isOpenRef.current = false
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
