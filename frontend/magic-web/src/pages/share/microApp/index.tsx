import { type ComponentProps, useCallback, useEffect, useMemo, useState } from "react"
import { useParams } from "react-router"
import { useTranslation } from "react-i18next"
import { FileCode2, Loader2 } from "lucide-react"
import { ErrorDisplay, PasswordVerification, ShareEmptyState } from "@/pages/share/components"
import HtmlPreviewContent from "@/pages/superMagic/components/Detail/contents/HTML"
import { MicroAppPermissionIllustration } from "@/pages/superMagic/components/MicroAppStateIllustration"
import type { AttachmentItem } from "@/pages/superMagic/components/TopicFilesButton/hooks"
import { resolveSelectedHtmlEntry } from "@/pages/superMagic/pages/MicroAppPage/utils/microAppFiles"
import MicroAppInstallDialog from "./components/MicroAppInstallDialog"
import MicroAppSafetyNotice from "./components/MicroAppSafetyNotice"
import MicroAppShareHeader from "./components/MicroAppShareHeader"
import useMicroAppInstallFlow from "./hooks/useMicroAppInstallFlow"
import useMicroAppManifestLinks from "./hooks/useMicroAppManifestLinks"
import useMicroAppSafetyNoticeConfirmation from "./hooks/useMicroAppSafetyNoticeConfirmation"
import useMicroAppShareData from "./hooks/useMicroAppShareData"

type MicroAppPreviewMode = NonNullable<ComponentProps<typeof HtmlPreviewContent>["viewMode"]>

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

function resolvePublishedDefaultOpenFileId(shareData: unknown): string | null {
	const value = shareData as {
		default_open_file_id?: unknown
		data?: { default_open_file_id?: unknown; data?: { default_open_file_id?: unknown } }
	}
	const id =
		value?.default_open_file_id ??
		value?.data?.default_open_file_id ??
		value?.data?.data?.default_open_file_id
	return id === null || id === undefined || id === "" ? null : String(id)
}

export default function MicroAppSharePage() {
	const { t } = useTranslation("super")
	const { appId = "" } = useParams<{ appId: string }>()
	useMicroAppManifestLinks(appId)
	const [previewMode, setPreviewMode] = useState<MicroAppPreviewMode>("desktop")
	const [activeFileId, setActiveFileId] = useState<string | null>(null)
	// 分享页隐藏了 HTML 文件头，通过管理句柄复用预览内部的同一个授权面板。
	const [permissionManager, setPermissionManager] = useState<{ open: () => void } | null>(null)
	const { hasConfirmedSafetyNotice, confirmSafetyNotice } =
		useMicroAppSafetyNoticeConfirmation(appId)
	const {
		shareData,
		resourceId,
		coverUrl,
		fullScreen,
		displayModeResolved,
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

	const defaultOpenFileId = useMemo(
		() => resolvePublishedDefaultOpenFileId(shareData),
		[shareData],
	)
	const defaultEntryFile = useMemo(
		() =>
			resolveSelectedHtmlEntry({ items: attachmentList, selectedFileId: defaultOpenFileId }),
		[attachmentList, defaultOpenFileId],
	)
	const displayAppName = shareMeta.projectName
	useEffect(() => {
		setPermissionManager(null)
	}, [appId])
	const previewFile = useMemo(
		() => attachmentList.find((item) => item.file_id === activeFileId) || defaultEntryFile,
		[activeFileId, attachmentList, defaultEntryFile],
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
			{displayModeResolved && !fullScreen ? (
				<MicroAppShareHeader
					appName={displayAppName}
					showInstall={installFlow.showInstall}
					showPermissionManager={hasConfirmedSafetyNotice && Boolean(permissionManager)}
					onInstall={installFlow.handleInstall}
					onOpenPermissionManager={handleOpenPermissionManager}
				/>
			) : null}
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
						onConfirm={confirmSafetyNotice}
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
							showFileHeader={false}
							showFooter={false}
							viewMode={previewMode}
							onViewModeChange={setPreviewMode}
							activeFileId={previewFile.file_id}
							projectId={shareMeta.projectId}
							virtualStorageMarkerId={defaultEntryFile?.file_id}
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
