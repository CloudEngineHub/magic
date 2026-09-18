import { useTranslation } from "react-i18next"

import TopicFilesButton from "@/pages/superMagic/components/TopicFilesButton"
import type { AttachmentItem } from "@/pages/superMagic/components/TopicFilesButton/hooks"
import type { ProjectListItem, Topic } from "@/pages/superMagic/pages/Workspace/types"

interface PublishedMicroAppAttachmentsPanelProps {
	attachments: AttachmentItem[]
	projectId?: string
	selectedProject?: ProjectListItem | null
	selectedTopic?: Topic | null
	setUserSelectDetail: (detail: unknown) => void
	onFileClick?: (fileItem: unknown) => void
}

/**
 * Runtime attachments belong to the current user's project, so the
 * standard file tree keeps create, upload, rename and delete enabled.
 */
export default function PublishedMicroAppAttachmentsPanel({
	attachments,
	projectId,
	selectedProject,
	selectedTopic,
	setUserSelectDetail,
	onFileClick,
}: PublishedMicroAppAttachmentsPanelProps) {
	const { t } = useTranslation("super")

	return (
		<div
			className="flex h-full min-h-0 flex-col pt-1"
			data-testid="published-micro-app-attachments-panel"
		>
			<TopicFilesButton
				attachments={attachments}
				projectId={projectId}
				selectedProject={selectedProject}
				selectedTopic={selectedTopic}
				title={t("attachmentList.projectFiles")}
				allowEdit
				showFileManager
				onFileClick={onFileClick}
				setUserSelectDetail={setUserSelectDetail}
			/>
		</div>
	)
}
