import type { AttachmentItem } from "@/pages/superMagic/components/TopicFilesButton/hooks"
import type { ProjectListItem } from "@/pages/superMagic/pages/Workspace/types"
import type { TopicStore } from "@/pages/superMagic/stores/core/topic"
import MicroAppEntryPreview from "./MicroAppEntryPreview"

interface MicroAppMobileEntryPreviewProps {
	entryFile: AttachmentItem | null
	attachments: AttachmentItem[]
	attachmentList: AttachmentItem[]
	projectId?: string
	topicStore?: TopicStore
	selectedProject: ProjectListItem | null
	allowEdit: boolean
	onOpenFile: (fileItem?: unknown) => void
	isBuilding?: boolean
}

function MicroAppMobileEntryPreview({
	entryFile,
	attachments,
	attachmentList,
	projectId,
	topicStore,
	selectedProject,
	allowEdit,
	onOpenFile,
	isBuilding = false,
}: MicroAppMobileEntryPreviewProps) {
	return (
		<MicroAppEntryPreview
			entryFile={entryFile}
			attachments={attachments}
			attachmentList={attachmentList}
			projectId={projectId}
			topicStore={topicStore}
			selectedProject={selectedProject}
			allowEdit={allowEdit}
			onOpenFile={onOpenFile}
			storageMarkerId={entryFile?.file_id}
			viewMode="desktop"
			emptyTestId="micro-app-mobile-preview-empty"
			buildingTestId="micro-app-mobile-preview-building"
			isBuilding={isBuilding}
		/>
	)
}

export default MicroAppMobileEntryPreview
