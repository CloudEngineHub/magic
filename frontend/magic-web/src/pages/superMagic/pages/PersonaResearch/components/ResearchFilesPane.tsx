import { forwardRef } from "react"
import { observer } from "mobx-react-lite"
import Detail, { type DetailRef } from "@/pages/superMagic/components/Detail"
import { usePersonaResearchStore } from "../context"

interface ResearchFilesPaneProps {
	userSelectDetail: unknown
	setUserSelectDetail: (detail: unknown) => void
	activeFileId: string | null
	onActiveFileChange: (fileId: string | null) => void
}

/**
 * Hosts the standard file preview for the research studio. The HTML report, plan, desk
 * research and any file or tool result clicked in the conversation open here as tabs.
 */
const ResearchFilesPane = forwardRef<DetailRef, ResearchFilesPaneProps>(function ResearchFilesPane(
	{ userSelectDetail, setUserSelectDetail, activeFileId, onActiveFileChange },
	ref,
) {
	const store = usePersonaResearchStore()
	const selectedProject = store.selectedProject
	const selectedTopic = store.selectedTopic
	if (!selectedProject) return null

	return (
		<div className="h-full min-h-0" data-testid="persona-research-files">
			<Detail
				ref={ref}
				disPlayDetail={userSelectDetail}
				userSelectDetail={userSelectDetail}
				setUserSelectDetail={setUserSelectDetail}
				attachments={store.attachments}
				attachmentList={store.attachmentList}
				topicId={selectedTopic?.id}
				baseShareUrl={`${window.location.origin}/share`}
				currentTopicStatus={selectedTopic?.task_status}
				messages={[]}
				allowEdit
				selectedTopic={selectedTopic}
				selectedProject={selectedProject}
				activeFileId={activeFileId}
				onActiveFileChange={onActiveFileChange}
				projectId={selectedProject.id}
				showFallbackWhenEmpty
				allowDownload
			/>
		</div>
	)
})

export default observer(ResearchFilesPane)
