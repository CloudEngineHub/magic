import type { AttachmentItem } from "@/pages/superMagic/components/TopicFilesButton/hooks"
import type { ProjectListItem } from "@/pages/superMagic/pages/Workspace/types"

import PublishedMicroAppConversationProvider from "@/pages/share/microApp/components/PublishedMicroAppConversationProvider"
import MicroAppEntryPreview from "./MicroAppEntryPreview"

interface MicroAppPreviewWorkspaceProps {
	appId: string
	entryFile: AttachmentItem | null
	attachments: AttachmentItem[]
	attachmentList: AttachmentItem[]
	projectId: string
	selectedProject: ProjectListItem | null
	sourceOrganizationCode?: string
	storageMarkerId?: string
	onOpenFile?: (fileItem?: unknown) => void
}

/**
 * Preview mode keeps the development files as the preview source, but uses the
 * published conversation host and runtime-project lifecycle.
 */
export default function MicroAppPreviewWorkspace({
	appId,
	entryFile,
	attachments,
	attachmentList,
	projectId,
	selectedProject,
	sourceOrganizationCode,
	storageMarkerId,
	onOpenFile,
}: MicroAppPreviewWorkspaceProps) {
	return (
		<PublishedMicroAppConversationProvider
			appId={appId}
			appName={selectedProject?.project_name}
			sourceOrganizationCode={sourceOrganizationCode}
		>
			<div
				className="flex h-full min-h-0 min-w-0 flex-1 overflow-hidden bg-background"
				data-testid="micro-app-runtime-preview-workspace"
			>
				<MicroAppEntryPreview
					entryFile={entryFile}
					attachments={attachments}
					attachmentList={attachmentList}
					projectId={projectId}
					selectedProject={selectedProject}
					allowEdit={false}
					onOpenFile={onOpenFile}
					storageMarkerId={storageMarkerId}
					microAppId={appId}
					microAppName={selectedProject?.project_name}
					isBuilding={false}
					emptyTestId="micro-app-runtime-preview-empty"
				/>
			</div>
		</PublishedMicroAppConversationProvider>
	)
}
