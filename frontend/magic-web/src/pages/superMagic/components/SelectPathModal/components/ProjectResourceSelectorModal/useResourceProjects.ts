import { useEffect, useRef, useState } from "react"
import { useMemoizedFn } from "ahooks"
import { useTranslation } from "react-i18next"
import { MagicClawApi, SuperMagicApi, type MagicClawItem } from "@/apis"
import magicToast from "@/components/base/MagicToaster/utils"
import { skillsService, type UserSkillView } from "@/services/skills/SkillsService"
import { crewService, type MyCrewView } from "@/services/crew/CrewService"
import {
	ProjectStatus,
	type Workspace,
	type ProjectListItem,
	type CollaborationProjectListItem,
} from "../../../../pages/Workspace/types"
import { TopicMode } from "../../../../pages/Workspace/TopicMode"
import {
	SHARE_WORKSPACE_ID,
	MY_CLAW_WORKSPACE_ID,
	MY_SKILLS_WORKSPACE_ID,
	MY_AGENTS_WORKSPACE_ID,
	MY_MICRO_APPS_WORKSPACE_ID,
} from "../../../../constants"
import { loadMicroAppProjectPage } from "../../utils/microAppProjects"

export const RESOURCE_WORKSPACE_IDS = new Set<string>([
	MY_SKILLS_WORKSPACE_ID,
	MY_AGENTS_WORKSPACE_ID,
])
/** Align with MySkills / MyCrew list page size; selector loads more on demand. */
const RESOURCE_PROJECTS_PAGE_SIZE = 20

export type ResourceProject = ProjectListItem & {
	resourceType?: "skill" | "agent"
	resourceId?: string
	project_id?: string | null
}

/** 来源列表只持有项目元数据；切换来源或关闭时使旧请求失效，不加载项目文件树。 */
export function useResourceProjects({
	visible,
	isMentionMode,
	currentWorkspace,
	loading,
	setLoading,
	setLoadError,
}: {
	visible: boolean
	isMentionMode: boolean
	currentWorkspace: Workspace | null
	loading: boolean
	setLoading: (loading: boolean) => void
	setLoadError: (error: boolean) => void
}) {
	const { t } = useTranslation("super")
	const [availableProjects, setAvailableProjects] = useState<ProjectListItem[]>([])
	const [loadingMoreResources, setLoadingMoreResources] = useState(false)
	const [resourceProjectsPage, setResourceProjectsPage] = useState(1)
	const [hasMoreResourceProjects, setHasMoreResourceProjects] = useState(false)
	const loadingMoreResourcesRef = useRef(false)
	const projectsRequestId = useRef(0)
	const microWorkspaceRef = useRef<Workspace | null>(null)
	const cancelProjectRequest = useMemoizedFn(() => {
		projectsRequestId.current += 1
	})
	useEffect(() => {
		return () => {
			cancelProjectRequest()
			microWorkspaceRef.current = null
		}
	}, [visible, cancelProjectRequest])
	// 获取共享项目列表
	const fetchCollaborationProjects = useMemoizedFn(async () => {
		const requestId = ++projectsRequestId.current
		setLoadError(false)
		setLoading(true)
		try {
			const res = await SuperMagicApi.getCollaborationProjects({
				page: 1,
				page_size: 99,
			})
			if (requestId !== projectsRequestId.current) return
			// 将 CollaborationProjectListItem 转换为 ProjectListItem
			const projects: ProjectListItem[] = (res?.list || []).map(
				(item: CollaborationProjectListItem) => ({
					...item,
					tag: "collaboration" as const,
				}),
			)
			setAvailableProjects(projects)
		} catch (error) {
			if (requestId !== projectsRequestId.current) return
			setLoadError(true)
			console.error("Failed to fetch collaboration projects:", error)
			magicToast.error(t("selectPathModal.fetchProjectsFailed"))
			setAvailableProjects([])
		}
		setLoading(false)
	})

	// 获取龙虾列表并转换为项目格式
	const fetchMagicClawProjects = useMemoizedFn(async () => {
		const requestId = ++projectsRequestId.current
		setLoadError(false)
		setLoading(true)
		try {
			const res = await MagicClawApi.queryMagicClawList({
				page: 1,
				page_size: 99,
			})
			if (requestId !== projectsRequestId.current) return
			// 将 MagicClawItem 转换为 ProjectListItem 格式
			const projects: ProjectListItem[] = (res?.list || []).map((item: MagicClawItem) => ({
				id: item.project_id,
				project_status: ProjectStatus.WAITING,
				project_mode: TopicMode.MagiClaw,
				project_description: item.description || undefined,
				workspace_id: MY_CLAW_WORKSPACE_ID,
				work_dir: "",
				workspace_name: t("workspace.myClawWorkspaceName"),
				project_name: item.name,
				current_topic_id: "",
				current_topic_status: "",
				created_at: "",
				updated_at: "",
				tag: "" as const,
			}))
			setAvailableProjects(projects)
		} catch (error) {
			if (requestId !== projectsRequestId.current) return
			setLoadError(true)
			console.error("Failed to fetch magic claw projects:", error)
			magicToast.error(t("selectPathModal.fetchClawsFailed"))
			setAvailableProjects([])
		}
		setLoading(false)
	})

	const mapResourceProject = useMemoizedFn(
		(
			item: UserSkillView | MyCrewView,
			resourceType: "skill" | "agent",
			workspaceId: string,
		): ResourceProject => {
			const projectId = item.projectId || null
			return {
				id: projectId || item.id,
				project_id: projectId,
				resourceType,
				resourceId: item.id,
				project_status: ProjectStatus.WAITING,
				project_mode: "",
				workspace_id: workspaceId,
				work_dir: "",
				workspace_name: "",
				project_name: item.name,
				current_topic_id: "",
				current_topic_status: "",
				created_at: "",
				updated_at: "",
				tag: "",
			}
		},
	)

	const resetResourceProjectsPagination = useMemoizedFn(() => {
		setResourceProjectsPage(1)
		setHasMoreResourceProjects(false)
		setLoadingMoreResources(false)
		loadingMoreResourcesRef.current = false
	})

	const fetchResourceProjects = useMemoizedFn(async (workspaceId: string, page = 1) => {
		const isLoadMore = page > 1
		if (isLoadMore) {
			if (loadingMoreResourcesRef.current || loading || !hasMoreResourceProjects) return
			loadingMoreResourcesRef.current = true
			setLoadingMoreResources(true)
		} else {
			setLoading(true)
			resetResourceProjectsPagination()
		}

		const requestId = ++projectsRequestId.current
		setLoadError(false)
		try {
			const params = { page, page_size: RESOURCE_PROJECTS_PAGE_SIZE }
			const isSkillsWorkspace = workspaceId === MY_SKILLS_WORKSPACE_ID
			const response = isSkillsWorkspace
				? await skillsService.getCreatedSkills(params)
				: await crewService.getCreatedAgents(params)
			const mapped = response.list.map((item) =>
				mapResourceProject(
					item,
					isSkillsWorkspace ? "skill" : "agent",
					isSkillsWorkspace ? MY_SKILLS_WORKSPACE_ID : MY_AGENTS_WORKSPACE_ID,
				),
			)

			if (requestId !== projectsRequestId.current) return
			setAvailableProjects((prev) => {
				if (!isLoadMore) return mapped
				const existingIds = new Set(prev.map((project) => project.id))
				return [...prev, ...mapped.filter((project) => !existingIds.has(project.id))]
			})
			setResourceProjectsPage(response.page)
			setHasMoreResourceProjects(response.page * response.pageSize < response.total)
		} catch (error) {
			if (requestId !== projectsRequestId.current) return
			setLoadError(true)
			console.error("Failed to fetch personal resources:", error)
			magicToast.error(t("selectPathModal.fetchProjectsFailed"))
			if (!isLoadMore) {
				setAvailableProjects([])
				resetResourceProjectsPagination()
			}
		} finally {
			if (requestId === projectsRequestId.current) {
				if (isLoadMore) {
					loadingMoreResourcesRef.current = false
					setLoadingMoreResources(false)
				} else {
					setLoading(false)
				}
			}
		}
	})

	const handleLoadMoreResourceProjects = useMemoizedFn(async () => {
		if (!currentWorkspace) return
		if (currentWorkspace.workspace_type === "micro-app") {
			await fetchMicroAppProjects(resourceProjectsPage + 1)
			return
		}
		if (!RESOURCE_WORKSPACE_IDS.has(currentWorkspace.id)) return
		await fetchResourceProjects(currentWorkspace.id, resourceProjectsPage + 1)
	})

	const fetchMicroAppProjects = useMemoizedFn(async (page = 1) => {
		if (page > 1 && (loadingMoreResourcesRef.current || loading || !hasMoreResourceProjects))
			return
		const requestId = ++projectsRequestId.current
		setLoadError(false)
		if (page === 1) {
			resetResourceProjectsPagination()
			setLoading(true)
		} else {
			loadingMoreResourcesRef.current = true
			setLoadingMoreResources(true)
		}
		try {
			const workspace =
				microWorkspaceRef.current ?? (await SuperMagicApi.getMicroAppWorkspace())
			if (requestId !== projectsRequestId.current) return
			microWorkspaceRef.current = workspace
			const result = await loadMicroAppProjectPage({
				workspace,
				page,
				pageSize: RESOURCE_PROJECTS_PAGE_SIZE,
			})
			if (requestId !== projectsRequestId.current) return
			setAvailableProjects((previous) =>
				page === 1
					? result.list
					: [
							...previous,
							...result.list.filter(
								(item) => !previous.some((existing) => existing.id === item.id),
							),
						],
			)
			setResourceProjectsPage(page)
			setHasMoreResourceProjects(page * RESOURCE_PROJECTS_PAGE_SIZE < result.total)
		} catch (error) {
			if (requestId !== projectsRequestId.current) return
			setLoadError(true)
			magicToast.error(t("selectPathModal.fetchProjectsFailed"))
		} finally {
			if (requestId === projectsRequestId.current) {
				setLoading(false)
				loadingMoreResourcesRef.current = false
				setLoadingMoreResources(false)
			}
		}
	})

	// 获取工作区的项目列表
	const fetchProjectsByWorkspace = useMemoizedFn(async (workspaceId: string) => {
		if (
			isMentionMode &&
			(workspaceId === MY_MICRO_APPS_WORKSPACE_ID ||
				workspaceId === microWorkspaceRef.current?.id)
		) {
			await fetchMicroAppProjects()
			return
		}
		if (RESOURCE_WORKSPACE_IDS.has(workspaceId)) {
			await fetchResourceProjects(workspaceId, 1)
			return
		}
		resetResourceProjectsPagination()
		if (workspaceId === SHARE_WORKSPACE_ID) {
			await fetchCollaborationProjects()
			return
		}
		if (workspaceId === MY_CLAW_WORKSPACE_ID) {
			await fetchMagicClawProjects()
			return
		}
		const requestId = ++projectsRequestId.current
		setLoadError(false)
		setLoading(true)
		try {
			const res = await SuperMagicApi.getProjectsWithCollaboration({
				workspace_id: workspaceId,
				page: 1,
				page_size: 99,
			})
			if (requestId !== projectsRequestId.current) return
			setAvailableProjects(res?.list || [])
		} catch (error) {
			if (requestId !== projectsRequestId.current) return
			setLoadError(true)
			console.error("Failed to fetch projects:", error)
			magicToast.error(t("selectPathModal.fetchProjectsFailed"))
			setAvailableProjects([])
		}
		setLoading(false)
	})

	const resolveSelectionWorkspace = (workspace: Workspace): Workspace =>
		workspace.workspace_type === "micro-app" && microWorkspaceRef.current
			? { ...microWorkspaceRef.current, name: workspace.name }
			: workspace
	return {
		availableProjects,
		setAvailableProjects,
		loadingMoreResources,
		hasMoreResourceProjects,
		resetResourceProjectsPagination,
		fetchProjectsByWorkspace,
		handleLoadMoreResourceProjects,
		cancelProjectRequest,
		resolveSelectionWorkspace,
	}
}
