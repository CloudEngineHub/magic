import { lazy, Suspense, useMemo } from "react"
import { Loader2 } from "lucide-react"
import { useTranslation } from "react-i18next"

import type { AttachmentItem } from "@/pages/superMagic/components/TopicFilesButton/hooks"
import { DetailType } from "@/pages/superMagic/components/Detail/types"
import type { ProjectListItem } from "@/pages/superMagic/pages/Workspace/types"

const HTMLPreview = lazy(() => import("@/pages/superMagic/components/Detail/contents/HTML"))

interface MicroAppMobileEntryPreviewProps {
	entryFile: AttachmentItem | null
	attachments: AttachmentItem[]
	attachmentList: AttachmentItem[]
	selectedProject: ProjectListItem | null
	allowEdit: boolean
	onOpenFile: (fileItem?: unknown) => void
}

function MicroAppMobileEntryPreview({
	entryFile,
	attachments,
	attachmentList,
	selectedProject,
	allowEdit,
	onOpenFile,
}: MicroAppMobileEntryPreviewProps) {
	const { t } = useTranslation("super")
	const entryData = useMemo(() => {
		if (!entryFile?.file_id) return null

		const fileName =
			entryFile.display_filename || entryFile.file_name || entryFile.filename || "index.html"

		return {
			...entryFile,
			file_id: entryFile.file_id,
			file_name: fileName,
			file_extension: entryFile.file_extension || fileName.split(".").pop() || "html",
		}
	}, [entryFile])

	if (!entryData) {
		return (
			<div
				className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center"
				data-testid="micro-app-mobile-preview-empty"
			>
				<p className="text-sm font-medium text-foreground">
					{t("microAppPage.preview.emptyTitle")}
				</p>
				<p className="text-xs leading-5 text-muted-foreground">
					{t("microAppPage.preview.emptyDescription")}
				</p>
			</div>
		)
	}

	return (
		<Suspense
			fallback={
				<div className="flex h-full items-center justify-center">
					<Loader2 className="size-6 animate-spin text-muted-foreground" />
				</div>
			}
		>
			<HTMLPreview
				type={DetailType.Html}
				data={entryData}
				attachments={attachments}
				attachmentList={attachmentList}
				selectedProject={selectedProject}
				activeFileId={entryData.file_id}
				updatedAt={entryData.updated_at}
				allowEdit={allowEdit}
				viewMode="desktop"
				openFileTab={onOpenFile}
				showFileHeader={false}
				showFooter={false}
				className="h-full min-h-0 w-full"
			/>
		</Suspense>
	)
}

export default MicroAppMobileEntryPreview
