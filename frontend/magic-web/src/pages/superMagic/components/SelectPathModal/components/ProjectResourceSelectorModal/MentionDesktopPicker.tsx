import { useMemo, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import { ArrowLeft, FolderSearch } from "lucide-react"
import { Button } from "@/components/shadcn-ui/button"
import { Input } from "@/components/shadcn-ui/input"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/shadcn-ui/popover"
import { useUserInfo } from "@/models/user/hooks"
import { useOverlayZIndex } from "@/hooks/useOverlayZIndex"
import type { FileManagerLocationSnapshot } from "@/models/config/repositories/SuperProjectStateTypes"
import { isMicroAppEnabled } from "@/services/microAppFeature"
import { ProjectsPanel, ProjectsPanelList } from "../../../WorkspacesMenu/components/ProjectsPanel"
import { useProjectManagerWindow } from "../../../WorkspacesMenu/useProjectManagerWindow"
import { ViewToggle } from "../../../WorkspacesMenu/components/CollaborationProjectsPanel/components"
import { useViewTogglePersistValue } from "../../../WorkspacesMenu/components/CollaborationProjectsPanel/components/ViewToggle/hooks"
import { ViewMode } from "../../../EmptyWorkspacePanel/components/ProjectItem"
import { FileManager } from "../../../TopicFilesButton/components/FileManager/FileManager"
import type {
	FileManagerCheckChange,
	FileManagerRevealRequest,
} from "../../../TopicFilesButton/components/FileManager/types"
import type { AttachmentItem } from "../../../TopicFilesButton/hooks"
import {
	getFilePresentationIndex,
	resolveFilePresentation,
} from "../../../TopicFilesButton/utils/file-presentation"
import { resolveAttachmentId } from "../../../TopicFilesButton/utils/attachmentIndex"
import type { FileHelpContext } from "../../../TopicFilesButton/utils/magic-system-folder"
import type { ProjectListItem, Workspace } from "../../../../pages/Workspace/types"
import {
	MY_AGENTS_WORKSPACE_DATA,
	MY_AGENTS_WORKSPACE_ID,
	MY_CLAW_WORKSPACE_DATA,
	MY_CLAW_WORKSPACE_ID,
	MY_MICRO_APPS_WORKSPACE_DATA,
	MY_SKILLS_WORKSPACE_DATA,
	SHARE_WORKSPACE_DATA,
} from "../../../../constants"
import type { ProjectResourceSelection } from "../../types"
import { MentionSelectionPanel, type MentionSelectionItem } from "./MentionSelectionPanel"
import { MentionSourceSidebar } from "./MentionSourceSidebar"
import { useSelectionListViewport } from "./useSelectionListViewport"

interface Props {
	title: string
	workspaces: Workspace[]
	workspace: Workspace | null
	project: ProjectListItem | null
	projects: ProjectListItem[]
	attachments: AttachmentItem[]
	loading: boolean
	error: boolean
	submitting: boolean
	includeFixedWorkspaces: boolean
	excludeProjectIds: string[]
	selections: ProjectResourceSelection[]
	hasMore: boolean
	loadingMore: boolean
	onLoadMore: () => void
	onWorkspace: (workspace: Workspace) => void
	onProject: (project: ProjectListItem, action: "select" | "enter") => void
	onBack: () => void
	onRefresh: () => void
	onCheck: (change: FileManagerCheckChange) => void
	onRemove: (selection: ProjectResourceSelection) => void
	onClear: () => void
	onNavigate: (selection: ProjectResourceSelection) => void
	onSubmit: () => void
	onClose: () => void
}

function selectionKey(selection: ProjectResourceSelection) {
	return selection.level === "project"
		? `project:${selection.project.id}`
		: `attachment:${selection.project.id}:${resolveAttachmentId(selection.attachment)}`
}

/** 只组合现有管理器的选择模式；项目、附件请求和全局勾选仍由 selector 持有。 */
export function MentionDesktopPicker(props: Props) {
	const { t } = useTranslation("super")
	const { userInfo } = useUserInfo()
	const layer = useOverlayZIndex({ open: true, zIndexScope: "fullscreen" })
	const identity = `${userInfo?.organization_code ?? ""}/${userInfo?.user_id ?? ""}`
	const frame = useProjectManagerWindow(true, {
		preferenceKey: "file_picker",
		recommendedSize: { width: 1380, height: 800 },
		minSize: { width: 960, height: 560 },
	})
	const [query, setQuery] = useState("")
	const [reveal, setReveal] = useState<FileManagerRevealRequest>()
	const [rootVisit, setRootVisit] = useState(0)
	const [cartOpen, setCartOpen] = useState(false)
	const revealId = useRef(0)
	const locations = useRef(new Map<string, FileManagerLocationSnapshot>())
	const { viewMode = ViewMode.LIST, setViewMode } = useViewTogglePersistValue({
		localStorageKey: "file_picker_projects_view",
		defaultValue: ViewMode.LIST,
	})
	const projects = useMemo(
		() =>
			props.projects.filter(
				(project) =>
					!props.excludeProjectIds.includes(project.id) &&
					(project.project_name || t("project.unnamedProject"))
						.toLocaleLowerCase()
						.includes(query.trim().toLocaleLowerCase()),
			),
		[props.projects, props.excludeProjectIds, query, t],
	)
	const viewport = useSelectionListViewport(
		'[data-testid="shared-workspace-dialog-project-item"]',
		projects.length,
		`${viewMode}:${props.project?.id ?? ""}`,
	)
	const special = [
		...(props.includeFixedWorkspaces
			? [SHARE_WORKSPACE_DATA(t), MY_CLAW_WORKSPACE_DATA(t)]
			: []),
		MY_SKILLS_WORKSPACE_DATA(t),
		MY_AGENTS_WORKSPACE_DATA(t),
		...(isMicroAppEnabled() ? [MY_MICRO_APPS_WORKSPACE_DATA(t)] : []),
	]
	const specialIds = new Set(special.map((workspace) => workspace.id))
	const regular = props.workspaces.filter(
		(workspace) => !specialIds.has(workspace.id) && workspace.workspace_type !== "micro-app",
	)
	const contextFor = (
		selection: Pick<ProjectResourceSelection, "workspace" | "project">,
	): FileHelpContext => ({
		kind:
			selection.workspace.id === MY_CLAW_WORKSPACE_ID
				? "claw"
				: selection.workspace.id === MY_AGENTS_WORKSPACE_ID
					? "crew"
					: "project",
		projectId: selection.project.id,
	})
	const context: FileHelpContext = useMemo(
		() => ({
			kind:
				props.workspace?.id === MY_CLAW_WORKSPACE_ID
					? "claw"
					: props.workspace?.id === MY_AGENTS_WORKSPACE_ID
						? "crew"
						: "project",
			projectId: props.project?.id ?? "",
		}),
		[props.workspace?.id, props.project?.id],
	)
	const selectedItems: MentionSelectionItem[] = props.selections.map((selection) => {
		const common = {
			key: selectionKey(selection),
			sourceName: `${selection.workspace.name} / ${selection.project.project_name || t("project.unnamedProject")}`,
		}
		return selection.level === "project"
			? {
					...common,
					projectName: selection.project.project_name || t("project.unnamedProject"),
				}
			: {
					...common,
					presentation: resolveFilePresentation(selection.attachment, {
						context: contextFor(selection),
						...(selection.project.id === props.project?.id
							? { index: getFilePresentationIndex(props.attachments) }
							: {}),
					}),
				}
	})
	const selectedProjects = new Set(
		props.selections
			.filter((selection) => selection.level === "project")
			.map((selection) => selection.project.id),
	)
	const checkedIds = new Set(
		props.selections.flatMap((selection) =>
			selection.level === "attachment" && selection.project.id === props.project?.id
				? [resolveAttachmentId(selection.attachment) ?? ""]
				: [],
		),
	)
	const navigate = (key: string, target: "project" | "file") => {
		const selection = props.selections.find((item) => selectionKey(item) === key)
		if (!selection) return
		setQuery("")
		setCartOpen(false)
		if (target === "file" && selection.level === "attachment") {
			setReveal({
				fileId: resolveAttachmentId(selection.attachment) ?? "",
				requestId: ++revealId.current,
			})
		} else {
			locations.current.delete(selection.project.id)
			setReveal(undefined)
			setRootVisit((value) => value + 1)
		}
		props.onNavigate(selection)
	}
	const panel = (
		<MentionSelectionPanel
			items={selectedItems}
			onRemove={(key) => {
				const selection = props.selections.find((item) => selectionKey(item) === key)
				if (selection) props.onRemove(selection)
			}}
			onClear={props.onClear}
			onNavigate={navigate}
		/>
	)
	return (
		<ProjectsPanel
			open
			modal
			zIndex={layer.contentZIndex}
			title={props.title}
			titleIcon={<FolderSearch size={16} />}
			windowOptions={frame.windowOptions}
			onRestoreRecommendedSize={frame.restoreRecommendedSize}
			resizeGuide={{ visible: frame.resizeGuideVisible, onDismiss: frame.dismissResizeGuide }}
			onClose={props.onClose}
			toolbar={false}
			searchValue=""
			onSearchValueChange={() => undefined}
		>
			<div className="flex min-h-0 flex-1 flex-col [container-type:inline-size]">
				<div className="flex min-h-0 flex-1">
					<MentionSourceSidebar
						workspaces={regular}
						specialWorkspaces={special}
						current={props.workspace}
						onSelect={(workspace) => {
							setQuery("")
							setReveal(undefined)
							props.onWorkspace(workspace)
						}}
					/>
					<div className="flex min-h-0 min-w-0 flex-1 flex-col">
						{props.project && props.workspace ? (
							<>
								<div className="flex min-h-11 shrink-0 items-center border-b px-3">
									<Button
										variant="ghost"
										size="sm"
										onClick={() => {
											setReveal(undefined)
											props.onBack()
										}}
									>
										<ArrowLeft size={16} />
										{props.workspace.name}
									</Button>
								</div>
								<div className="min-h-0 flex-1">
									<FileManager
										key={`${identity}:${props.project.id}:${rootVisit}`}
										mode="select"
										rootId=""
										rootName={
											props.project.project_name ||
											t("project.unnamedProject")
										}
										scopeKey={`file_picker:${identity}:${props.project.id}`}
										identityKey={identity}
										projectId={props.project.id}
										selectedProject={props.project}
										context={context}
										attachments={props.attachments}
										checkedIds={checkedIds}
										onCheckChange={props.onCheck}
										isActive
										dataReady={!props.loading && !props.error}
										loading={props.loading}
										error={props.error}
										onRefresh={props.onRefresh}
										onOpen={() => undefined}
										initialState={locations.current.get(props.project.id)}
										onStateChange={(snapshot) => {
											if (props.project)
												locations.current.set(props.project.id, snapshot)
										}}
										revealRequest={reveal}
									/>
								</div>
							</>
						) : (
							<>
								<div className="flex shrink-0 flex-wrap items-center gap-3 border-b px-4 py-3">
									<span className="min-w-0 flex-1 truncate text-sm font-medium">
										{props.workspace?.name || t("selectPathModal.workspace")}
									</span>
									<Input
										className="h-8 w-48"
										value={query}
										placeholder={t("project.searchProject")}
										onChange={(event) => setQuery(event.target.value)}
									/>
								</div>
								<ProjectsPanelList
									projects={projects}
									loading={props.loading}
									viewMode={viewMode}
									toolbar={<ViewToggle value={viewMode} onChange={setViewMode} />}
									itemProps={{
										onClick: (project) => {
											setReveal(undefined)
											props.onProject(project, "enter")
										},
									}}
									selection={{
										checkedIds: selectedProjects,
										onCheck: (project) => props.onProject(project, "select"),
									}}
									listViewport={viewport}
									error={
										props.error ? (
											<Button variant="ghost" onClick={props.onRefresh}>
												{t("common.retry")}
											</Button>
										) : undefined
									}
									footer={
										props.hasMore ? (
											<Button
												variant="ghost"
												disabled={props.loadingMore}
												onClick={props.onLoadMore}
											>
												{t("selectPathModal.loadMore")}
											</Button>
										) : undefined
									}
								/>
							</>
						)}
					</div>
					<div className="hidden min-h-0 [@container_(min-width:1050px)]:flex">
						{panel}
					</div>
				</div>
				<div className="flex min-h-14 shrink-0 items-center justify-between gap-3 border-t px-4">
					<span className="text-xs text-muted-foreground">
						{t("fileManager.selectedCount", { count: props.selections.length })}
					</span>
					<div className="flex items-center gap-2">
						<Popover open={cartOpen} onOpenChange={setCartOpen}>
							<PopoverTrigger asChild>
								<Button
									variant="outline"
									className="[@container_(min-width:1050px)]:hidden"
								>
									{t("fileManager.selectedFiles")} ({props.selections.length})
								</Button>
							</PopoverTrigger>
							<PopoverContent
								align="end"
								className="flex h-[min(480px,65dvh)] w-64 overflow-hidden p-0"
							>
								{panel}
							</PopoverContent>
						</Popover>
						<Button variant="outline" onClick={props.onClose}>
							{t("common.cancel")}
						</Button>
						<Button
							disabled={!props.selections.length || props.submitting}
							onClick={props.onSubmit}
						>
							{t("selectPathModal.confirm")} ({props.selections.length})
						</Button>
					</div>
				</div>
			</div>
		</ProjectsPanel>
	)
}
