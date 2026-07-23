import type { AttachmentItem } from "@/pages/superMagic/components/TopicFilesButton/hooks"
import type { ProjectListItem } from "@/pages/superMagic/pages/Workspace/types"
import MicroAppEntryPreview from "./MicroAppEntryPreview"

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
	return (
		<MicroAppEntryPreview
			entryFile={entryFile}
			attachments={attachments}
			attachmentList={attachmentList}
			selectedProject={selectedProject}
			allowEdit={allowEdit}
			onOpenFile={onOpenFile}
			viewMode="desktop"
			emptyTestId="micro-app-mobile-preview-empty"
		/>
	)
}

export default MicroAppMobileEntryPreview
