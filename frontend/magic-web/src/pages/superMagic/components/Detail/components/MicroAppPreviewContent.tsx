import { type ComponentProps, useCallback, useMemo, useState } from "react"
import { useTranslation } from "react-i18next"
import { FileCode2, Loader2 } from "lucide-react"
import { ErrorDisplay, PasswordVerification, ShareEmptyState } from "@/pages/share/components"
import MicroAppSafetyNotice from "@/pages/share/microApp/components/MicroAppSafetyNotice"
import useMicroAppInstallFlow from "@/pages/share/microApp/hooks/useMicroAppInstallFlow"
import useMicroAppSafetyNoticeConfirmation from "@/pages/share/microApp/hooks/useMicroAppSafetyNoticeConfirmation"
import useMicroAppShareData from "@/pages/share/microApp/hooks/useMicroAppShareData"
import HtmlPreviewContent from "@/pages/superMagic/components/Detail/contents/HTML"
import { MicroAppPermissionIllustration } from "@/pages/superMagic/components/MicroAppStateIllustration"
import type { AttachmentItem } from "@/pages/superMagic/components/TopicFilesButton/hooks"
import { resolveSelectedHtmlEntry } from "@/pages/superMagic/pages/MicroAppPage/utils/microAppFiles"

type MicroAppPreviewMode = NonNullable<ComponentProps<typeof HtmlPreviewContent>["viewMode"]>

export interface MicroAppPreviewContentProps {
	appId: string
	appName?: string
}

function MicroAppPreviewEmpty() {
	const { t } = useTranslation("super")

	return (
		<div
			className="flex h-full w-full flex-col items-center justify-center gap-3 bg-muted/20 px-8 text-center"
			data-testid="micro-app-tab-empty"
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

function MicroAppPreviewContent({ appId, appName }: MicroAppPreviewContentProps) {
	const { t } = useTranslation("super")
	const [previewMode, setPreviewMode] = useState<MicroAppPreviewMode>("desktop")
	const [activeFileId, setActiveFileId] = useState<string | null>(null)
	const { hasConfirmedSafetyNotice, confirmSafetyNotice } =
		useMicroAppSafetyNoticeConfirmation(appId)
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

	const defaultOpenFileId = useMemo(
		() => resolvePublishedDefaultOpenFileId(shareData),
		[shareData],
	)
	const defaultEntryFile = useMemo(
		() =>
			resolveSelectedHtmlEntry({ items: attachmentList, selectedFileId: defaultOpenFileId }),
		[attachmentList, defaultOpenFileId],
	)
	const displayAppName = appName?.trim() || shareMeta.projectName
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
		return
	}, [])

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
		<div className="h-full min-h-0 w-full overflow-hidden" data-testid="micro-app-tab-content">
			{loading ? (
				<div
					className="flex h-full items-center justify-center"
					data-testid="micro-app-tab-loading"
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
							testId="micro-app-tab-error-illustration"
						/>
					}
				/>
			) : null}

			{!loading && !error && shareData && !previewFile ? <MicroAppPreviewEmpty /> : null}

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
					data-testid="micro-app-tab-preview"
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
						className="h-full"
					/>
				</div>
			) : null}
		</div>
	)
}

export default MicroAppPreviewContent
