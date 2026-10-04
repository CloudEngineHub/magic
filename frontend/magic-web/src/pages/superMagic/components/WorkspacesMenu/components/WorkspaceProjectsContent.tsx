import { useEffect, useRef, useState } from "react"
import { useMemoizedFn, useDebounce } from "ahooks"
import { reaction } from "mobx"
import { useTranslation } from "react-i18next"
import { Plus } from "lucide-react"
import { MagicClawApi, SuperMagicApi, type MicroAppListItem } from "@/apis"
import MagicEmpty from "@/components/base/MagicEmpty"
import { Button } from "@/components/shadcn-ui/button"
import CreateProjectInput from "@/layouts/BaseLayout/components/MagicSidebar/WorkspaceList/CreateProjectInput"
import {
	ProjectStatus,
	type ProjectListItem,
	type Workspace,
} from "@/pages/superMagic/pages/Workspace/types"
import { TopicMode } from "@/pages/superMagic/pages/Workspace/TopicMode"
import {
	MICRO_APPS_WORKSPACE_ID,
	MY_AGENTS_WORKSPACE_ID,
	MY_CLAW_WORKSPACE_ID,
	MY_SKILLS_WORKSPACE_ID,
} from "@/pages/superMagic/constants"
import { skillsService, type UserSkillView } from "@/services/skills/SkillsService"
import { crewService, type MyCrewView } from "@/services/crew/CrewService"
import projectStore from "@/pages/superMagic/stores/core/project"
import recentProjectsStore from "@/pages/superMagic/stores/core/recentProjects"
import RecentProjectItem from "./RecentProjectItem"
import { ProjectResourceItem } from "../../SelectPathModal/components/ProjectResourceSelectorModal/ProjectResourceItem"
import {
	getResourceProjectType,
	type ResourceProject,
} from "../../SelectPathModal/resourceProjectTypes"
import ProjectItem, { SortType, ViewMode } from "../../EmptyWorkspacePanel/components/ProjectItem"
import useProjectItemActionProps from "../../EmptyWorkspacePanel/hooks/useProjectItemActionProps"
import { ViewToggle } from "./CollaborationProjectsPanel/components"
import { useViewTogglePersistValue } from "./CollaborationProjectsPanel/components/ViewToggle/hooks"
import { ProjectsPanelList } from "./ProjectsPanel"

interface WorkspaceProjectsContentProps {
	searchValue: string
	onClearSearch: () => void
	open: boolean
	/** 不指定目录时浏览跨工作区最近项目；查询状态仍由本窗口独立持有。 */
	workspace?: Workspace
	onClose: () => void
	initialCreating?: boolean
	onCancelCreating?: () => void
}

const PAGE_SIZE = 100

const SPECIAL_WORKSPACE_IDS = new Set([
	MY_CLAW_WORKSPACE_ID,
	MICRO_APPS_WORKSPACE_ID,
	MY_AGENTS_WORKSPACE_ID,
	MY_SKILLS_WORKSPACE_ID,
])

function makeSpecialProject(
	workspace: Workspace,
	values: Pick<ProjectListItem, "id" | "project_name" | "project_mode"> &
		Partial<Pick<ProjectListItem, "project_description" | "created_at" | "updated_at">>,
): ProjectListItem {
	return {
		id: values.id,
		project_status: ProjectStatus.WAITING,
		project_mode: values.project_mode,
		project_description: values.project_description,
		workspace_id: workspace.id,
		workspace_name: workspace.name,
		work_dir: "",
		project_name: values.project_name,
		current_topic_id: "",
		current_topic_status: "",
		created_at: values.created_at || "",
		updated_at: values.updated_at || "",
		tag: "",
	}
}

/**
 * 特殊工作区使用各自已有的列表接口，项目管理器只负责把结果转换成统一项目行。
 * 最近项目不走这里，而是使用 participated 接口的一次服务端查询。
 */
async function loadSpecialWorkspaceProjects(
	workspaceId: string,
	workspace: Workspace | undefined,
): Promise<{ list: ProjectListItem[]; total: number }> {
	if (!workspace) return { list: [], total: 0 }

	if (workspaceId === MY_CLAW_WORKSPACE_ID) {
		const response = await MagicClawApi.queryMagicClawList({ page: 1, page_size: PAGE_SIZE })
		return {
			total: response.total,
			list: response.list.map((item) => {
				const project = makeSpecialProject(workspace, {
					id: item.project_id,
					project_name: item.name,
					project_mode: TopicMode.MagiClaw,
					project_description: item.description || undefined,
				})
				return { ...project, claw_code: item.code }
			}),
		}
	}

	if (workspaceId === MICRO_APPS_WORKSPACE_ID) {
		const response = await SuperMagicApi.getMicroApps({
			scope: "created",
			page: 1,
			page_size: PAGE_SIZE,
		})
		return {
			total: response.total,
			list: response.list
				.filter(
					(item: MicroAppListItem): item is MicroAppListItem & { project_id: string } =>
						Boolean(item.project_id),
				)
				.map((item) => ({
					...makeSpecialProject(workspace, {
						id: item.project_id,
						project_name: item.app_name,
						project_mode: TopicMode.MicroApp,
						project_description: item.app_description,
						updated_at: item.updated_at || "",
					}),
					micro_app_id: item.app_id,
				})),
		}
	}

	if (workspaceId === MY_SKILLS_WORKSPACE_ID || workspaceId === MY_AGENTS_WORKSPACE_ID) {
		const response =
			workspaceId === MY_SKILLS_WORKSPACE_ID
				? await skillsService.getCreatedSkills({ page: 1, page_size: PAGE_SIZE })
				: await crewService.getCreatedAgents({ page: 1, page_size: PAGE_SIZE })
		const list = response.list.map((item: UserSkillView | MyCrewView) => {
			const isSkill = workspaceId === MY_SKILLS_WORKSPACE_ID
			const resource = item as UserSkillView & MyCrewView
			return makeSpecialProject(workspace, {
				id: resource.projectId || resource.id,
				project_name: resource.name,
				project_mode: isSkill ? TopicMode.SkillProjectCreator : TopicMode.AgentCreator,
				project_description: resource.description,
				updated_at: resource.updatedAt,
			})
		})
		return { total: response.total, list }
	}

	return { list: [], total: 0 }
}

export default function WorkspaceProjectsContent({
	searchValue,
	onClearSearch,
	open,
	workspace,
	onClose,
	initialCreating = false,
	onCancelCreating,
}: WorkspaceProjectsContentProps) {
	const { t } = useTranslation("super")
	const workspaceId = workspace?.id
	const recent = !workspace
	const debouncedSearchValue = useDebounce(searchValue, { wait: 500 })
	const { viewMode, setViewMode } = useViewTogglePersistValue({
		localStorageKey: "workspace_projects_panel_view_toggle_value",
		defaultValue: ViewMode.LIST,
	})
	const [projects, setProjects] = useState<ProjectListItem[]>(() =>
		workspaceId ? projectStore.getProjectsByWorkspace(workspaceId) : [],
	)
	const [loading, setLoading] = useState(open)
	const [failed, setFailed] = useState(false)
	const [page, setPage] = useState(1)
	const failedPageRef = useRef(1)
	const [total, setTotal] = useState<number>()
	const [creating, setCreating] = useState(initialCreating)
	const requestId = useRef(0)
	const isOpenRef = useRef(open)
	const actions = useProjectItemActionProps({ selectedWorkspace: workspace ?? null })
	const request = useRef<AbortController | null>(null)
	const modalWasOpen = useRef(false)

	const load = useMemoizedFn(async (nextPage = 1) => {
		if (!isOpenRef.current) return
		const id = ++requestId.current
		request.current?.abort()
		const controller = new AbortController()
		request.current = controller
		setLoading(true)
		setFailed(false)
		try {
			const isSpecialWorkspace = Boolean(
				workspaceId && SPECIAL_WORKSPACE_IDS.has(workspaceId),
			)
			const result = isSpecialWorkspace
				? await loadSpecialWorkspaceProjects(workspaceId as string, workspace)
				: await SuperMagicApi.getProjectsWithCollaboration(
						{
							workspace_id: workspaceId,
							sort_mode: recent ? "recent" : "workspace",
							project_name: debouncedSearchValue,
							page: nextPage,
							page_size: PAGE_SIZE,
							show_collaboration: 1,
							include_special: recent ? 1 : 0,
						},
						{ signal: controller.signal },
					)
			if (id !== requestId.current || controller.signal.aborted) return
			// 搜索和分页只更新本面板；全局导航缓存继续由项目 service 维护。
			const visibleList = isSpecialWorkspace
				? result.list.filter((item) =>
						item.project_name
							.toLocaleLowerCase()
							.includes(debouncedSearchValue.toLocaleLowerCase()),
					)
				: result.list
			setProjects((previous) =>
				nextPage === 1
					? visibleList
					: [
							...previous,
							...visibleList.filter(
								(item) => !previous.some((existing) => existing.id === item.id),
							),
						],
			)
			setPage(nextPage)
			setTotal(isSpecialWorkspace ? visibleList.length : result.total)
		} catch {
			if (id === requestId.current && !controller.signal.aborted) {
				failedPageRef.current = nextPage
				setFailed(true)
			}
		} finally {
			if (id === requestId.current) setLoading(false)
		}
	})

	useEffect(() => {
		isOpenRef.current = open
		if (!open) return
		setProjects(
			debouncedSearchValue || !workspaceId
				? []
				: projectStore.getProjectsByWorkspace(workspaceId),
		)
		setTotal(undefined)
		void load()
		return () => {
			requestId.current += 1
			request.current?.abort()
			isOpenRef.current = false
		}
	}, [open, workspaceId, debouncedSearchValue, load])

	// 普通目录订阅自己的缓存；最近分类订阅 service 的失效版本，搜索／分页不会改写侧栏快照。
	useEffect(() => {
		if (!open) return
		return reaction(
			() =>
				workspaceId
					? projectStore
							.getProjectsByWorkspace(workspaceId)
							.map((item) =>
								[item.id, item.project_name, item.is_pinned, item.updated_at].join(
									":",
								),
							)
							.join("|")
					: recentProjectsStore.revision,
			() => {
				void load()
			},
		)
	}, [open, workspaceId, load])

	useEffect(() => {
		// 与最近项目一致：动作弹窗结束后重查，不能把提前修改缓存当作服务端已完成。
		if (modalWasOpen.current && !actions.isProjectModalOpen) void load()
		modalWasOpen.current = actions.isProjectModalOpen
	}, [actions.isProjectModalOpen, load])

	const refreshAfterShortcutRemoval = (removeShortcut?: (projectId: string) => void) =>
		removeShortcut
			? async (projectId: string) => {
					await removeShortcut(projectId)
					await load()
				}
			: undefined

	const close = useMemoizedFn(() => {
		isOpenRef.current = false
		requestId.current += 1
		request.current?.abort()
		setCreating(false)
		onClose()
	})

	return (
		<>
			<ProjectsPanelList
				projects={projects}
				selectedProjectId={projectStore.selectedProject?.id}
				total={total}
				emptyContent={
					debouncedSearchValue ? (
						<div className="flex flex-col items-center gap-2 py-4">
							<MagicEmpty description={t("sidebarPanels.noMatchingProjects")} />
							<Button variant="outline" onClick={onClearSearch}>
								{t("sidebarPanels.clearSearch")}
							</Button>
						</div>
					) : undefined
				}
				loading={loading}
				viewMode={viewMode}
				renderItem={(props) => {
					const resourceType = workspace
						? getResourceProjectType(props.project)
						: undefined
					if (resourceType) {
						const resourceProject: ResourceProject = {
							...props.project,
							resourceType,
						}
						return (
							<ProjectResourceItem
								project={resourceProject}
								viewMode={props.viewMode}
								onClick={(project) => props.onClick(project)}
							/>
						)
					}
					return recent ? <RecentProjectItem {...props} /> : <ProjectItem {...props} />
				}}
				toolbar={
					<>
						{workspace &&
							(creating ? (
								<CreateProjectInput
									workspaceId={workspace.id}
									onCancel={() => {
										setCreating(false)
										onCancelCreating?.()
									}}
									onCreated={close}
								/>
							) : (
								<Button onClick={() => setCreating(true)}>
									<Plus size={16} />
									{t("sidebarPanels.createProject")}
								</Button>
							))}
						<ViewToggle value={viewMode} onChange={setViewMode} />
					</>
				}
				itemProps={{
					sortType: recent ? SortType.MY_LAST_ACTIVE_TIME : SortType.PROJECT_UPDATE_TIME,
					onClick: (project) => {
						if (project.id !== projectStore.selectedProject?.id)
							actions.handleProjectClick(project)
						close()
					},
					onRenameProject: async (params) => {
						await actions.handleRenameProject(params)
						await load()
					},
					onPinProject: async (project, pinned) => {
						await actions.handlePinProject(project, pinned)
						await load()
					},
					onDeleteProject: actions.handleDeleteProjectConfirm,
					onMoveProject: actions.handleMoveProject,
					onTransferProject: actions.handleTransferProject,
					onAddCollaborators: actions.onAddCollaborators,
					onCancelWorkspaceShortcut: refreshAfterShortcutRemoval(
						actions.handleCancelWorkspaceShortcut,
					),
				}}
				error={
					failed && (
						<div role="alert" className="flex items-center justify-center gap-2 py-4">
							<span>{t("sidebarPanels.projectsLoadFailed")}</span>
							<Button
								variant="outline"
								onClick={() => void load(failedPageRef.current)}
							>
								{t("sidebarPanels.retry")}
							</Button>
						</div>
					)
				}
				footer={
					!failed &&
					total !== undefined &&
					projects.length < total && (
						<div className="flex justify-center py-4">
							<Button
								variant="outline"
								disabled={loading}
								onClick={() => void load(page + 1)}
							>
								{t("sidebarPanels.loadMore")}
							</Button>
						</div>
					)
				}
			/>
			{actions.projectModals}
		</>
	)
}
