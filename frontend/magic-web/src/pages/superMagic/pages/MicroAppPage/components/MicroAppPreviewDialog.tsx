import { useEffect, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@/components/shadcn-ui/dialog"
import Detail, { type DetailRef } from "@/pages/superMagic/components/Detail"
import type { AttachmentItem } from "@/pages/superMagic/components/TopicFilesButton/hooks"
import type { ProjectListItem, Topic } from "@/pages/superMagic/pages/Workspace/types"

interface MicroAppPreviewDialogProps {
	open: boolean
	file: AttachmentItem | null
	attachments: AttachmentItem[]
	attachmentList: AttachmentItem[]
	selectedProject: ProjectListItem | null
	selectedTopic: Topic | null
	projectId?: string
	onOpenChange: (open: boolean) => void
}

function getFileTitle(file: AttachmentItem | null): string {
	return file?.display_filename || file?.file_name || file?.filename || file?.name || ""
}

export default function MicroAppPreviewDialog({
	open,
	file,
	attachments,
	attachmentList,
	selectedProject,
	selectedTopic,
	projectId,
	onOpenChange,
}: MicroAppPreviewDialogProps) {
	const { t } = useTranslation("super")
	const detailRef = useRef<DetailRef>(null)
	const [userSelectDetail, setUserSelectDetail] = useState<unknown>()
	const [activeFileId, setActiveFileId] = useState<string | null>(null)

	useEffect(() => {
		if (!open || !file) return

		const rafId = window.requestAnimationFrame(() => {
			setUserSelectDetail(null)
			setActiveFileId(file.file_id || null)
			detailRef.current?.openFileTab(file)
		})

		return () => {
			window.cancelAnimationFrame(rafId)
		}
	}, [file, open])

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="flex h-[86vh] max-w-[min(1120px,calc(100vw-48px))] grid-rows-none flex-col gap-3 p-0">
				<DialogHeader className="border-b border-border px-4 py-3">
					<DialogTitle className="truncate pr-8 text-sm font-medium">
						{getFileTitle(file) || t("microAppPage.previewDialog.title")}
					</DialogTitle>
					<DialogDescription className="sr-only">
						{t("microAppPage.previewDialog.description")}
					</DialogDescription>
				</DialogHeader>
				<div className="min-h-0 flex-1 overflow-hidden px-3 pb-3">
					<Detail
						ref={detailRef}
						disPlayDetail={userSelectDetail}
						userSelectDetail={userSelectDetail}
						setUserSelectDetail={setUserSelectDetail}
						attachments={attachments}
						attachmentList={attachmentList}
						topicId={selectedTopic?.id}
						baseShareUrl={`${window.location.origin}/share`}
						currentTopicStatus={selectedTopic?.task_status}
						messages={[]}
						allowEdit
						selectedTopic={selectedTopic}
						selectedProject={selectedProject}
						activeFileId={activeFileId}
						onActiveFileChange={setActiveFileId}
						projectId={projectId}
						showFallbackWhenEmpty
					/>
				</div>
			</DialogContent>
		</Dialog>
	)
}
