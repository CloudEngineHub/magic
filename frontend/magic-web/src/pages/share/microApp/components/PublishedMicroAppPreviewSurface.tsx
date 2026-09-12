import { FileCode2, Loader2 } from "lucide-react"
import { useTranslation } from "react-i18next"
import { ErrorDisplay, PasswordVerification, ShareEmptyState } from "@/pages/share/components"
import MicroAppSafetyNotice from "@/pages/share/microApp/components/MicroAppSafetyNotice"
import type { UsePublishedMicroAppPreviewReturn } from "@/pages/share/microApp/hooks/usePublishedMicroAppPreview"
import { buildPreviewFile } from "@/pages/share/microApp/utils/publishedMicroAppPreview"
import HtmlPreviewContent from "@/pages/superMagic/components/Detail/contents/HTML"
import { MicroAppPermissionIllustration } from "@/pages/superMagic/components/MicroAppStateIllustration"

const NOOP_LEAVE = () => undefined

export interface PublishedMicroAppPreviewSurfaceProps {
	preview: UsePublishedMicroAppPreviewReturn
	onLeave?: () => void
	testIdPrefix: "micro-app-tab" | "micro-app-share"
	rootTestId?: string
	onHtmlPermissionManagerChange?: (manager: { open: () => void } | null) => void
}

function PublishedMicroAppPreviewEmpty({ testId }: { testId: string }) {
	const { t } = useTranslation("super")

	return (
		<div
			className="flex h-full w-full flex-col items-center justify-center gap-3 bg-muted/20 px-8 text-center"
			data-testid={testId}
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

function PublishedMicroAppPreviewSurface({
	preview,
	onLeave,
	testIdPrefix,
	rootTestId,
	onHtmlPermissionManagerChange,
}: PublishedMicroAppPreviewSurfaceProps) {
	const { t } = useTranslation("super")
	const {
		emptyStateInfo,
		handleSwitchOrganization,
		isSwitching,
		loading,
		error,
		isNeedPassword,
		shareData,
		previewFile,
		hasConfirmedSafetyNotice,
		confirmSafetyNotice,
		displayAppName,
		coverUrl,
		resourceId,
		passwordFromUrl,
		handleVerifySuccess,
		getShareData,
		setError,
		reload,
		installFlow,
		previewMode,
		setPreviewMode,
		handleOpenFileTab,
		attachmentsTree,
		attachmentList,
		shareMeta,
		defaultEntryFile,
	} = preview

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
		<div className="h-full min-h-0 w-full overflow-hidden" data-testid={rootTestId}>
			{loading ? (
				<div
					className="flex h-full items-center justify-center"
					data-testid={`${testIdPrefix}-loading`}
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
							testId={`${testIdPrefix}-error-illustration`}
						/>
					}
				/>
			) : null}

			{!loading && !error && shareData && !previewFile ? (
				<PublishedMicroAppPreviewEmpty testId={`${testIdPrefix}-empty`} />
			) : null}

			{!loading && !error && previewFile && !hasConfirmedSafetyNotice ? (
				<MicroAppSafetyNotice
					appName={displayAppName}
					coverUrl={coverUrl}
					onConfirm={confirmSafetyNotice}
					onLeave={onLeave ?? NOOP_LEAVE}
				/>
			) : null}

			{!loading && !error && previewFile && hasConfirmedSafetyNotice ? (
				<div
					className="h-full w-full overflow-hidden bg-background"
					data-testid={`${testIdPrefix}-preview`}
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
						onHtmlPermissionManagerChange={onHtmlPermissionManagerChange}
						className="h-full"
					/>
				</div>
			) : null}
		</div>
	)
}

export default PublishedMicroAppPreviewSurface
