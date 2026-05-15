import { lazy, memo, Suspense, useCallback, useMemo, useState } from "react"
import { ArrowLeft, Ellipsis, Files, PanelLeftClose, PanelLeftOpen } from "lucide-react"
import { IconShare3 } from "@tabler/icons-react"
import { useTranslation } from "react-i18next"
import { cn } from "@/lib/utils"
import { Button } from "@/components/shadcn-ui/button"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/shadcn-ui/tooltip"
import ProjectSider from "../../../components/ProjectSider"
import TopicFilesButton from "../../../components/TopicFilesButton"
import ProjectActionsDropdown from "../../../components/ProjectActionsDropdown"
import useProjectItemActionProps from "../../../components/EmptyWorkspacePanel/hooks/useProjectItemActionProps"
import { useShareProject } from "../../../layouts/MainLayout/hooks/useShareProject"
import { isReadOnlyProject, canManageProject } from "../../../utils/permission"
import { openProjectInNewTab } from "../../../utils/project"
import useProjectRename from "../../../hooks/useProjectRename"
import projectFilesStore from "@/stores/projectFiles"
import { ShareMode, ShareType } from "../../../components/Share/types"
import { generateShareUrl } from "../../../components/ShareManagement/utils/shareTypeHelpers"
import { ProjectListItem, Workspace, WorkspaceStatus } from "../../../pages/Workspace/types"
import IconWorkspaceProjectFolder from "@/enhance/tabler/icons-react/icons/IconWorkspaceProjectFolder"
import SidebarCreateInput from "@/layouts/BaseLayout/components/MagicSidebar/components/SidebarCreateInput"

const ShareModal = lazy(() => import("@/pages/superMagic/components/Share/Modal"))
const SimilarSharesDialog = lazy(
	() => import("@/pages/superMagic/components/Share/SimilarSharesDialog"),
)
const ShareSuccessModal = lazy(
	() => import("@/pages/superMagic/components/Share/FileShareModal/ShareSuccessModal"),
)

interface AppSidebarProps {
	selectedProject: ProjectListItem | null
	topicFilesProps: any
	collapsed: boolean
	onToggleCollapse: () => void
	onBack?: () => void
}

function AppSidebar({
	selectedProject,
	topicFilesProps,
	collapsed,
	onToggleCollapse,
	onBack,
}: AppSidebarProps) {
	const { t } = useTranslation("super")
	const [isFolderHovered, setIsFolderHovered] = useState(false)

	const items = useMemo(
		() => [
			{
				key: "topicFiles",
				title: t("topicFiles.fileTitle"),
				icon: <Files size={16} />,
				content: <TopicFilesButton {...topicFilesProps} />,
			},
		],
		[t, topicFilesProps],
	)

	// ─── 收起态：图标竖条 ───────────────────────────────────────────────────────
	if (collapsed) {
		return (
			<div className="flex h-full w-full flex-col items-center gap-1 py-2">
				{/* 展开按钮 */}
				<Tooltip>
					<TooltipTrigger asChild>
						<Button
							variant="ghost"
							size="icon"
							className="size-8 text-muted-foreground hover:text-foreground"
							onClick={onToggleCollapse}
						>
							<PanelLeftOpen size={16} />
						</Button>
					</TooltipTrigger>
					<TooltipContent side="right" sideOffset={8}>
						{t("topicFiles.expandSidebar", "展开侧栏")}
					</TooltipContent>
				</Tooltip>

				{/* 项目图标 — 悬停显示返回箭头，点击返回 */}
				<Tooltip>
					<TooltipTrigger asChild>
						<Button
							variant="ghost"
							size="icon"
							className="size-8 text-muted-foreground hover:text-foreground"
							onMouseEnter={() => setIsFolderHovered(true)}
							onMouseLeave={() => setIsFolderHovered(false)}
							onClick={onBack}
						>
							<div className="relative flex size-5 items-center justify-center">
								<IconWorkspaceProjectFolder
									size={20}
									className={cn(
										"absolute inset-0 transition-opacity duration-150",
										isFolderHovered ? "opacity-0" : "opacity-100",
									)}
								/>
								<ArrowLeft
									size={18}
									className={cn(
										"absolute inset-0 m-auto transition-opacity duration-150",
										isFolderHovered ? "opacity-100" : "opacity-0",
									)}
								/>
							</div>
						</Button>
					</TooltipTrigger>
					<TooltipContent side="right" sideOffset={8}>
						{isFolderHovered
							? t("topicFiles.backToHome", "返回首页")
							: selectedProject?.name || t("topicFiles.fileTitle")}
					</TooltipContent>
				</Tooltip>

				{/* 文件列表图标 — 点击展开面板 */}
				<Tooltip>
					<TooltipTrigger asChild>
						<Button
							variant="ghost"
							size="icon"
							className="size-8 text-muted-foreground hover:text-foreground"
							onClick={onToggleCollapse}
						>
							<Files size={18} />
						</Button>
					</TooltipTrigger>
					<TooltipContent side="right" sideOffset={8}>
						{t("topicFiles.fileTitle")}
					</TooltipContent>
				</Tooltip>

				{/* 弹性间距 */}
				<div className="flex-1" />
			</div>
		)
	}

	// ─── 展开态：完整侧栏 ───────────────────────────────────────────────────────
	return (
		<div className="flex h-full w-full flex-col gap-2">
			{/* 自定义顶部栏 */}
			<AppSidebarHeader
				selectedProject={selectedProject}
				onBack={onBack}
				onToggleCollapse={onToggleCollapse}
			/>
			{/* 文件列表 */}
			<div className="flex flex-1 flex-col overflow-hidden rounded-lg border border-border bg-background">
				<div className="min-h-0 flex-1 overflow-hidden">
					<ProjectSider items={items} className="h-full" />
				</div>
			</div>
		</div>
	)
}

// ─── 展开态顶部栏 ────────────────────────────────────────────────────────────

interface AppSidebarHeaderProps {
	selectedProject: ProjectListItem | null
	onBack?: () => void
	onToggleCollapse: () => void
}

function AppSidebarHeader({ selectedProject, onBack, onToggleCollapse }: AppSidebarHeaderProps) {
	const { t } = useTranslation("super")
	const [isBackHovered, setIsBackHovered] = useState(false)

	const canShare = selectedProject ? !isReadOnlyProject(selectedProject.user_role) : false
	const canManage = selectedProject ? canManageProject(selectedProject.user_role) : false
	const projectName = selectedProject?.project_name || t("project.unnamedProject")

	// ─── 分享 ────────────────────────────────────────────────────────────────────
	const shareProject = useShareProject({
		attachments: projectFilesStore.workspaceFileTree,
		projectName: selectedProject?.project_name,
	})

	// ─── 更多操作 ────────────────────────────────────────────────────────────────
	const actionWorkspace = useMemo<Workspace>(
		() => ({
			id: selectedProject?.workspace_id || "",
			name: selectedProject?.workspace_name || "",
			is_archived: 0,
			current_topic_id: selectedProject?.current_topic_id || "",
			current_project_id: selectedProject?.id ?? null,
			workspace_status: WorkspaceStatus.WAITING,
			project_count: 0,
		}),
		[selectedProject],
	)

	const {
		handleProjectClick,
		handleMoveProject,
		handleTransferProject,
		handleDeleteProjectConfirm,
		handleTogglePinProject,
		handlePinProject,
		onAddCollaborators,
		handleCopyCollaborationLink,
		handleCancelWorkspaceShortcutByProject,
		handleRenameProject,
		projectModals,
	} = useProjectItemActionProps({ selectedWorkspace: actionWorkspace })

	const canRename = canManage && !!handleRenameProject

	const {
		isEditing,
		setIsEditing,
		editingProjectName,
		handleProjectNameChange,
		handleProjectNameBlur,
	} = useProjectRename({
		item: selectedProject ?? { id: "", project_name: "" },
		onRenameProject: canRename ? handleRenameProject : undefined,
	})

	const handleRenameStart = useCallback(() => {
		if (!canRename) return
		setTimeout(() => setIsEditing(true), 200)
	}, [canRename, setIsEditing])

	const blockSelectorClickRef = useState({ current: false })[0]
	const blockSelectorClickTemporarily = useCallback(() => {
		blockSelectorClickRef.current = true
		setTimeout(() => {
			blockSelectorClickRef.current = false
		}, 0)
	}, [blockSelectorClickRef])

	// ─── 重命名态 ────────────────────────────────────────────────────────────────
	if (isEditing && selectedProject) {
		return (
			<div className="rounded-lg border border-border bg-background p-2">
				<SidebarCreateInput
					value={editingProjectName}
					onValueChange={(v) =>
						handleProjectNameChange({
							target: { value: v },
						} as React.ChangeEvent<HTMLInputElement>)
					}
					onSubmit={async () => {
						await handleProjectNameBlur()
					}}
					onCancel={() => setIsEditing(false)}
					placeholder={t("project.unnamedProject")}
				/>
				{projectModals}
			</div>
		)
	}

	return (
		<>
			<div className="flex items-center gap-1.5 rounded-lg border border-border bg-background p-2">
				{/* 返回按钮 */}
				<Tooltip>
					<TooltipTrigger asChild>
						<Button
							variant="ghost"
							size="icon"
							className={cn(
								"size-8 shrink-0 rounded-lg transition-colors",
								isBackHovered
									? "bg-secondary text-foreground"
									: "bg-yellow-300/20 text-foreground",
							)}
							onMouseEnter={() => setIsBackHovered(true)}
							onMouseLeave={() => setIsBackHovered(false)}
							onClick={onBack}
						>
							{isBackHovered ? (
								<ArrowLeft size={16} />
							) : (
								<IconWorkspaceProjectFolder size={16} />
							)}
						</Button>
					</TooltipTrigger>
					<TooltipContent side="bottom">
						{isBackHovered ? t("topicFiles.backToHome", "返回首页") : projectName}
					</TooltipContent>
				</Tooltip>

				{/* 项目名 */}
				<span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
					{projectName}
				</span>

				{/* 分享按钮 */}
				{canShare && (
					<Tooltip>
						<TooltipTrigger asChild>
							<Button
								variant="outline"
								size="icon"
								className="size-7 shrink-0 shadow-xs"
								onClick={shareProject.openShareModal}
							>
								<IconShare3 size={14} className="text-foreground" />
							</Button>
						</TooltipTrigger>
						<TooltipContent side="bottom">
							{t("share.shareProject", "分享")}
						</TooltipContent>
					</Tooltip>
				)}

				{/* 更多操作 */}
				{selectedProject && (
					<ProjectActionsDropdown
						item={selectedProject}
						inCollaborationPanel={false}
						trigger={["click"]}
						placement="bottomRight"
						onOpenChange={(open) => {
							if (open) blockSelectorClickTemporarily()
						}}
						onBeforeAction={blockSelectorClickTemporarily}
						onOpenInNewWindow={openProjectInNewTab}
						onPinProject={handlePinProject}
						onCopyCollaborationLink={handleCopyCollaborationLink}
						onTransferProject={handleTransferProject}
						onMoveProject={handleMoveProject}
						onAddCollaborators={onAddCollaborators}
						onCancelWorkspaceShortcut={undefined}
						onDeleteProject={handleDeleteProjectConfirm}
						onRenameStart={canRename ? handleRenameStart : undefined}
						onRenameProject={canRename ? handleRenameProject : undefined}
					>
						<span>
							<Tooltip>
								<TooltipTrigger asChild>
									<Button
										variant="outline"
										size="icon"
										className="size-7 shrink-0 shadow-xs"
									>
										<Ellipsis size={14} className="text-foreground" />
									</Button>
								</TooltipTrigger>
								<TooltipContent side="bottom">
									{t("common.moreActions", "更多")}
								</TooltipContent>
							</Tooltip>
						</span>
					</ProjectActionsDropdown>
				)}

				{/* 收起侧栏 */}
				<Tooltip>
					<TooltipTrigger asChild>
						<Button
							variant="ghost"
							size="icon"
							className="size-7 shrink-0 text-muted-foreground hover:text-foreground"
							onClick={onToggleCollapse}
						>
							<PanelLeftClose size={14} />
						</Button>
					</TooltipTrigger>
					<TooltipContent side="bottom">
						{t("topicFiles.collapseSidebar", "收起侧栏")}
					</TooltipContent>
				</Tooltip>
			</div>

			{/* 分享弹窗 */}
			{canShare && selectedProject && (
				<Suspense fallback={null}>
					<ShareModal
						open={shareProject.shareModalOpen}
						onCancel={shareProject.closeShareModal}
						shareMode={ShareMode.Project}
						attachments={projectFilesStore.workspaceFileTree}
						attachmentList={projectFilesStore.workspaceFilesList}
						projectName={selectedProject.project_name}
						defaultSelectedFileIds={shareProject.defaultSelectedFileIds}
						resourceId={shareProject.editingResourceId}
						types={[
							ShareType.PasswordProtected,
							ShareType.Public,
							ShareType.Organization,
						]}
					/>
				</Suspense>
			)}

			{canShare && shareProject.similarSharesInfo && (
				<Suspense fallback={null}>
					<SimilarSharesDialog
						open
						onClose={shareProject.closeSimilarSharesDialog}
						shares={shareProject.similarSharesInfo.similarShares}
						onSelectShare={shareProject.handleSelectSimilarShare}
						onCreateNew={shareProject.handleCreateNewShare}
					/>
				</Suspense>
			)}

			{canShare && shareProject.shareSuccessInfo && (
				<Suspense fallback={null}>
					<ShareSuccessModal
						open
						onClose={shareProject.closeSuccessModal}
						onCancelShare={shareProject.handleCancelShare}
						onEditShare={shareProject.handleEditShare}
						shareName={shareProject.shareSuccessInfo.shareInfo.resource_name || ""}
						fileCount={shareProject.shareSuccessInfo.shareInfo?.extend?.file_count || 1}
						mainFileName={
							shareProject.shareSuccessInfo.shareInfo.main_file_name ||
							t("share.untitled")
						}
						shareUrl={generateShareUrl(
							shareProject.shareSuccessInfo.shareInfo.resource_id,
							shareProject.shareSuccessInfo.shareInfo.password,
							"files",
						)}
						projectName={shareProject.shareSuccessInfo.shareInfo.project_name}
						shareType={shareProject.shareSuccessInfo.shareInfo.share_type}
					/>
				</Suspense>
			)}

			{projectModals}
		</>
	)
}

export default memo(AppSidebar)
