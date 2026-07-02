import { FileCode2, Loader2 } from "lucide-react"
import { useTranslation } from "react-i18next"
import HtmlPreviewContent from "@/pages/superMagic/components/Detail/contents/HTML"
import type { AttachmentItem } from "@/pages/superMagic/components/TopicFilesButton/hooks"
import type { ProjectListItem, Topic } from "@/pages/superMagic/pages/Workspace/types"

interface MicroAppHtmlPreviewProps {
	entryFile: AttachmentItem | null
	attachments: AttachmentItem[]
	attachmentList: AttachmentItem[]
	selectedProject: ProjectListItem | null
	selectedTopic: Topic | null
	projectId?: string
	isLoading: boolean
	onOpenPreview: (fileItem?: AttachmentItem) => void
}

function MicroAppHtmlPreviewEmpty({ isLoading }: { isLoading: boolean }) {
	const { t } = useTranslation("super")

	if (isLoading) {
		return (
			<div className="flex h-full w-full items-center justify-center">
				<Loader2 className="size-6 animate-spin text-muted-foreground" />
			</div>
		)
	}

	return (
		<div className="flex h-full w-full flex-col items-center justify-center gap-3 bg-muted/20 px-8 text-center">
			<div className="flex size-12 items-center justify-center rounded-lg border border-border bg-background text-muted-foreground">
				<FileCode2 size={22} />
			</div>
			<div className="space-y-1">
				<p className="text-sm font-medium text-foreground">
					{t("microAppPage.preview.emptyTitle")}
				</p>
				<p className="max-w-[360px] text-sm text-muted-foreground">
					{t("microAppPage.preview.emptyDescription")}
				</p>
			</div>
		</div>
	)
}

export default function MicroAppHtmlPreview({
	entryFile,
	attachments,
	attachmentList,
	selectedProject,
	selectedTopic,
	projectId,
	isLoading,
	onOpenPreview,
}: MicroAppHtmlPreviewProps) {
	if (!entryFile?.file_id) {
		return <MicroAppHtmlPreviewEmpty isLoading={isLoading} />
	}

	return (
		<div
			className="h-full w-full overflow-hidden bg-background"
			data-testid="micro-app-html-preview"
		>
			<HtmlPreviewContent
				data={{
					...entryFile,
					file_id: entryFile.file_id,
					file_name: entryFile.file_name || entryFile.filename || entryFile.name,
					file_extension: entryFile.file_extension,
					display_config: entryFile.display_config,
				}}
				attachments={attachments}
				attachmentList={attachmentList}
				allowEdit={false}
				selectedProject={selectedProject}
				selectedTopic={selectedTopic}
				showFileHeader={false}
				showFooter={false}
				activeFileId={entryFile.file_id}
				projectId={projectId}
				openFileTab={onOpenPreview}
				className="h-full"
			/>
		</div>
	)
}
