import { useEffect, useRef, useState } from "react"
import { useMemoizedFn, useDebounce } from "ahooks"
import { reaction } from "mobx"
import { useTranslation } from "react-i18next"
import { SuperMagicApi } from "@/apis"
import MagicEmpty from "@/components/base/MagicEmpty"
import { Button } from "@/components/shadcn-ui/button"
import CreateProjectInput from "@/layouts/BaseLayout/components/MagicSidebar/WorkspaceList/CreateProjectInput"
import type { ProjectListItem, Workspace } from "@/pages/superMagic/pages/Workspace/types"
import projectStore from "@/pages/superMagic/stores/core/project"
import { ViewMode } from "../../EmptyWorkspacePanel/components/ProjectItem"
import useProjectItemActionProps from "../../EmptyWorkspacePanel/hooks/useProjectItemActionProps"
import { ViewToggle } from "./CollaborationProjectsPanel/components"
import { useViewTogglePersistValue } from "./CollaborationProjectsPanel/components/ViewToggle/hooks"
import { ProjectsPanelList } from "./ProjectsPanel"

interface WorkspaceProjectsContentProps {
	searchValue: string
	onClearSearch: () => void
	open: boolean
	workspace: Workspace
	onClose: () => void
}

const PAGE_SIZE = 100

export default function WorkspaceProjectsContent({
	searchValue,
	onClearSearch,
	open,
	workspace,
	onClose,
}: WorkspaceProjectsContentProps) {
	const { t } = useTranslation("super")
	const debouncedSearchValue = useDebounce(searchValue, { wait: 500 })
	const { viewMode, setViewMode } = useViewTogglePersistValue({
		localStorageKey: "workspace_projects_panel_view_toggle_value",
		defaultValue: ViewMode.LIST,
	})
	const [projects, setProjects] = useState<ProjectListItem[]>(() =>
		projectStore.getProjectsByWorkspace(workspace.id),
	)
	const [loading, setLoading] = useState(open)
	const [failed, setFailed] = useState(false)
	const [page, setPage] = useState(1)
	const failedPageRef = useRef(1)
	const [total, setTotal] = useState<number>()
	const [creating, setCreating] = useState(false)
	const requestId = useRef(0)
	const isOpenRef = useRef(open)
	const actions = useProjectItemActionProps({ selectedWorkspace: workspace })

	const load = useMemoizedFn(async (nextPage = 1) => {
		if (!isOpenRef.current) return
		const id = ++requestId.current
		setLoading(true)
		setFailed(false)
		try {
			const result = await SuperMagicApi.getProjectsWithCollaboration({
				workspace_id: workspace.id,
				project_name: debouncedSearchValue,
				page: nextPage,
				page_size: PAGE_SIZE,
				show_collaboration: 1,
			})
			if (id !== requestId.current) return
			// 搜索和分页只更新本面板；全局导航缓存继续由项目 service 维护。
			setProjects((previous) =>
				nextPage === 1
					? result.list
					: [
							...previous,
							...result.list.filter(
								(item) => !previous.some((existing) => existing.id === item.id),
							),
						],
			)
			setPage(nextPage)
			setTotal(result.total)
		} catch {
			if (id === requestId.current) {
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
		setProjects(debouncedSearchValue ? [] : projectStore.getProjectsByWorkspace(workspace.id))
		setTotal(undefined)
		void load()
		return () => {
			requestId.current += 1
			isOpenRef.current = false
		}
	}, [open, workspace.id, debouncedSearchValue, load])

	// 移动、删除等弹窗仍由原 hook 完成；其 service 刷新工作区后同步面板查询。
	useEffect(() => {
		if (!open) return
		return reaction(
			() =>
				projectStore
					.getProjectsByWorkspace(workspace.id)
					.map((item) =>
						[item.id, item.project_name, item.is_pinned, item.updated_at].join(":"),
					)
					.join("|"),
			() => {
				void load()
			},
		)
	}, [open, workspace.id, load])

	const close = useMemoizedFn(() => {
		isOpenRef.current = false
		requestId.current += 1
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
				toolbar={
					<>
						{creating ? (
							<CreateProjectInput
								workspaceId={workspace.id}
								onCancel={() => setCreating(false)}
								onCreated={close}
							/>
						) : (
							<Button variant="outline" onClick={() => setCreating(true)}>
								{t("sidebarPanels.createProject")}
							</Button>
						)}
						<ViewToggle value={viewMode} onChange={setViewMode} />
					</>
				}
				itemProps={{
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
					onCancelWorkspaceShortcut: actions.handleCancelWorkspaceShortcut,
					refetchProjects: () => {
						void load()
					},
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
