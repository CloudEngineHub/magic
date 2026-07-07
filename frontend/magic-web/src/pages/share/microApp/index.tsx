import { useCallback, useMemo, useState } from "react"
import { useParams } from "react-router"
import { useTranslation } from "react-i18next"
import { FileCode2, Loader2 } from "lucide-react"
import { ErrorDisplay, PasswordVerification, ShareEmptyState } from "@/pages/share/components"
import HtmlPreviewContent from "@/pages/superMagic/components/Detail/contents/HTML"
import type { AttachmentItem } from "@/pages/superMagic/components/TopicFilesButton/hooks"
import { resolveSelectedHtmlEntry } from "@/pages/superMagic/pages/MicroAppPage/utils/microAppFiles"
import type { MicroAppPreviewMode } from "@/pages/superMagic/pages/MicroAppPage/components/MicroAppHeader"
import useMicroAppShareData from "./hooks/useMicroAppShareData"

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
	const { resourceId = "" } = useParams<{ resourceId: string }>()
	const [previewMode, setPreviewMode] = useState<MicroAppPreviewMode>("desktop")
	const {
		shareData,
		shareMeta,
		attachmentsTree,
		attachmentList,
		loading,
		error,
		isNeedPassword,
		passwordFromUrl,
		emptyStateInfo,
		handleSwitchOrganization,
		isSwitching,
		getShareData,
		setError,
		setVerifiedPassword,
		reload,
	} = useMicroAppShareData({ resourceId })

	const entryFile = useMemo(
		() => resolveSelectedHtmlEntry({ items: attachmentList, selectedFileId: null }),
		[attachmentList],
	)

	const selectedProject = useMemo(
		() =>
			shareMeta.projectId
				? ({
						id: shareMeta.projectId,
						project_name: shareMeta.projectName,
						name: shareMeta.projectName,
					} as any)
				: null,
		[shareMeta.projectId, shareMeta.projectName],
	)

	const handleVerifySuccess = useCallback(
		(_data: any, password?: string) => {
			setError(null)
			setVerifiedPassword(password)
		},
		[setError, setVerifiedPassword],
	)

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
			className="h-screen w-screen overflow-hidden bg-background"
			data-testid="micro-app-share-page"
		>
			<main className="h-full w-full overflow-hidden">
				{loading ? (
					<div
						className="flex h-full items-center justify-center"
						data-testid="micro-app-share-loading"
					>
						<Loader2 className="size-6 animate-spin text-muted-foreground" />
					</div>
				) : null}

				{isNeedPassword && !shareData && !entryFile && !error && !loading ? (
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
					/>
				) : null}

				{error && !loading ? (
					<ErrorDisplay
						errorMessage={t("microAppShare.errorTitle")}
						onRetry={reload}
						isFileShare
					/>
				) : null}

				{!loading && !error && shareData && !entryFile ? <MicroAppShareEmpty /> : null}

				{!loading && !error && entryFile ? (
					<div
						className="h-full w-full overflow-hidden bg-background"
						data-testid="micro-app-share-preview"
					>
						<HtmlPreviewContent
							data={buildPreviewFile(entryFile)}
							attachments={attachmentsTree}
							attachmentList={attachmentList}
							allowEdit={false}
							selectedProject={selectedProject}
							selectedTopic={null}
							showFileHeader={false}
							showFooter={false}
							viewMode={previewMode}
							onViewModeChange={setPreviewMode}
							activeFileId={entryFile.file_id}
							projectId={shareMeta.projectId}
							openFileTab={() => {}}
							className="h-full"
						/>
					</div>
				) : null}
			</main>
		</div>
	)
}
