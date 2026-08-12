import { type ComponentProps, useCallback, useEffect, useMemo, useState } from "react"
import { useParams } from "react-router"
import { useTranslation } from "react-i18next"
import { FileCode2, Loader2 } from "lucide-react"
import { ErrorDisplay, PasswordVerification, ShareEmptyState } from "@/pages/share/components"
import HtmlPreviewContent from "@/pages/superMagic/components/Detail/contents/HTML"
import { MicroAppPermissionIllustration } from "@/pages/superMagic/components/MicroAppStateIllustration"
import type { AttachmentItem } from "@/pages/superMagic/components/TopicFilesButton/hooks"
import { resolveDefaultHtmlEntry } from "@/pages/superMagic/pages/MicroAppPage/utils/microAppFiles"
import {
	ProjectStatus,
	type ProjectListItem,
	TopicMode,
} from "@/pages/superMagic/pages/Workspace/types"
import MicroAppInstallDialog from "./components/MicroAppInstallDialog"
import MicroAppSafetyNotice from "./components/MicroAppSafetyNotice"
import MicroAppShareHeader from "./components/MicroAppShareHeader"
import useMicroAppInstallFlow from "./hooks/useMicroAppInstallFlow"
import useMicroAppManifestLinks from "./hooks/useMicroAppManifestLinks"
import useMicroAppShareData from "./hooks/useMicroAppShareData"

type MicroAppPreviewMode = NonNullable<ComponentProps<typeof HtmlPreviewContent>["viewMode"]>

function createShareProject(projectId: string, projectName: string): ProjectListItem {
	return {
		id: projectId,
		project_name: projectName || projectId,
		project_status: ProjectStatus.WAITING,
		project_mode: TopicMode.General,
		workspace_id: "",
		work_dir: "",
		workspace_name: "",
		current_topic_id: "",
		current_topic_status: "",
		created_at: "",
		updated_at: "",
		tag: "",
	}
}

function MicroAppShareEmpty() {
	const { t } = useTranslation("super")

	return (
		<div
			className="flex h-full w-full flex-col items-center justify-center gap-3 bg-muted/20 px-8 text-center"
			data-testid="micro-app-share-empty"
		>
			<div className="flex size-12 items-center justify-center rounded-lg border border-border bg-background text-muted-foreground">
				<FileCode2 size={22} />
			</div>
			<div className="space-y-1">
				<p className="text-sm font-medium text-foreground">
					{t("microAppShare.noEntryTitle")}
				</p>
				<p className="max-w-[360px] text-sm text-muted-foreground">
					{t("microAppShare.noEntryDescription")}
				</p>
			</div>
		</div>
	)
}

function buildPreviewFile(entryFile: AttachmentItem) {
	return {
		...entryFile,
		file_id: entryFile.file_id,
		file_name: entryFile.file_name || entryFile.filename || entryFile.name,
		file_extension: entryFile.file_extension,
		display_config: entryFile.display_config,
	}
}

export default function MicroAppSharePage() {
	const { t } = useTranslation("super")
	const { appId = "" } = useParams<{ appId: string }>()
	useMicroAppManifestLinks(appId)
	const [previewMode, setPreviewMode] = useState<MicroAppPreviewMode>("desktop")
	const [activeFileId, setActiveFileId] = useState<string | null>(null)
	const [confirmedSafetyAppId, setConfirmedSafetyAppId] = useState<string | null>(null)
	// 分享页隐藏了 HTML 文件头，通过管理句柄复用预览内部的同一个授权面板。
	const [permissionManager, setPermissionManager] = useState<{ open: () => void } | null>(null)
	const {
		shareData,
		resourceId,
		coverUrl,
		shareMeta,
		attachmentsTree,
		attachmentList,
		loading,
		error,
		isNeedPassword,
		passwordFromUrl,
		verifiedPassword,
		emptyStateInfo,
		handleSwitchOrganization,
		isSwitching,
		getShareData,
		setError,
		setVerifiedPassword,
		reload,
	} = useMicroAppShareData({ appId })

	const defaultEntryFile = useMemo(
		() => resolveDefaultHtmlEntry(attachmentList),
		[attachmentList],
	)
	const displayAppName = shareMeta.projectName
	// 将确认绑定到 appId，切换分享路由时不会短暂复用上一应用的确认状态。
	const hasConfirmedSafetyNotice = confirmedSafetyAppId === appId
	useEffect(() => {
		setConfirmedSafetyAppId(null)
		setPermissionManager(null)
	}, [appId])
	const previewFile = useMemo(
		() => attachmentList.find((item) => item.file_id === activeFileId) || defaultEntryFile,
		[activeFileId, attachmentList, defaultEntryFile],
	)

	const selectedProject = useMemo<ProjectListItem | null>(
		() =>
			shareMeta.projectId
				? createShareProject(shareMeta.projectId, shareMeta.projectName)
				: null,
		[shareMeta.projectId, shareMeta.projectName],
	)
	const installFlow = useMicroAppInstallFlow({
		appId,
		hasEntryFile: Boolean(previewFile),
		hasError: Boolean(error),
		hasShareData: Boolean(shareData),
		isLoading: loading,
		isNeedPassword,
		resourceId,
		safetyConfirmed: hasConfirmedSafetyNotice,
		verifiedPassword,
	})
	const rememberVerifiedPassword = installFlow.rememberVerifiedPassword

	const handleVerifySuccess = useCallback(
		(_data: unknown, password?: string) => {
			setError(null)
			rememberVerifiedPassword(password)
			setVerifiedPassword(password)
		},
		[rememberVerifiedPassword, setError, setVerifiedPassword],
	)
	const handleOpenFileTab = useCallback((fileItem: AttachmentItem) => {
		if (fileItem.file_id) {
			setActiveFileId(fileItem.file_id)
		}
	}, [])
	const handleLeave = useCallback(() => {
		window.location.replace("/")
	}, [])
	const handleOpenPermissionManager = useCallback(() => {
		permissionManager?.open()
	}, [permissionManager])

	if (emptyStateInfo) {
		return (
			<ShareEmptyState
				currentOrgName={emptyStateInfo.currentOrgName}
				targetOrgName={emptyStateInfo.targetOrgName}
				targetOrgLogo={emptyStateInfo.targetOrgLogo || undefined}
				userInfo={emptyStateInfo.userInfo}
				onSwitch={handleSwitchOrganization}
				isLoading={isSwitching}
				isFileShare
			/>
		)
	}

	return (
		<div
			className="flex h-screen w-screen flex-col overflow-hidden bg-background"
			data-testid="micro-app-share-page"
		>
			<MicroAppShareHeader
				appName={displayAppName}
				showInstall={installFlow.showInstall}
				showPermissionManager={hasConfirmedSafetyNotice && Boolean(permissionManager)}
				onInstall={installFlow.handleInstall}
				onOpenPermissionManager={handleOpenPermissionManager}
			/>
			<MicroAppInstallDialog {...installFlow.dialog} />
			<main className="min-h-0 flex-1 overflow-hidden">
				{loading ? (
					<div
						className="flex h-full items-center justify-center"
						data-testid="micro-app-share-loading"
					>
						<Loader2 className="size-6 animate-spin text-muted-foreground" />
					</div>
				) : null}

				{isNeedPassword && !shareData && !previewFile && !error && !loading ? (
					<PasswordVerification
						resourceId={resourceId}
						initialPassword={passwordFromUrl}
						onVerifySuccess={handleVerifySuccess}
						onVerifyFail={() => setError(null)}
						getShareData={getShareData}
						isFileShare
						maxLength={32}
						uppercase={false}
						title={t("microAppShare.passwordTitle")}
						description={t("microAppShare.passwordDescription")}
						rememberPassword={installFlow.rememberPasswordControl}
					/>
				) : null}

				{error && !loading ? (
					<ErrorDisplay
						errorMessage={t("microAppShare.errorTitle")}
						onRetry={reload}
						isFileShare
						illustration={
							<MicroAppPermissionIllustration
								size="md"
								className="w-[180px]"
								testId="micro-app-share-error-illustration"
							/>
						}
					/>
				) : null}

				{!loading && !error && shareData && !previewFile ? <MicroAppShareEmpty /> : null}

				{!loading && !error && previewFile && !hasConfirmedSafetyNotice ? (
					<MicroAppSafetyNotice
						appName={displayAppName}
						coverUrl={coverUrl}
						onConfirm={() => setConfirmedSafetyAppId(appId)}
						onLeave={handleLeave}
					/>
				) : null}

				{!loading && !error && previewFile && hasConfirmedSafetyNotice ? (
					<div
						className="h-full w-full overflow-hidden bg-background"
						data-testid="micro-app-share-preview"
					>
						<HtmlPreviewContent
							key={previewFile.file_id || previewFile.relative_file_path}
							data={buildPreviewFile(previewFile)}
							attachments={attachmentsTree}
							attachmentList={attachmentList}
							allowEdit={false}
							selectedProject={selectedProject}
							selectedTopic={null}
							showFileHeader={false}
							showFooter={false}
							viewMode={previewMode}
							onViewModeChange={setPreviewMode}
							activeFileId={previewFile.file_id}
							virtualStorageMarkerId={defaultEntryFile?.file_id}
							projectId={shareMeta.projectId}
							openFileTab={handleOpenFileTab}
							onHtmlPermissionManagerChange={setPermissionManager}
							className="h-full"
						/>
					</div>
				) : null}
			</main>
		</div>
	)
}
