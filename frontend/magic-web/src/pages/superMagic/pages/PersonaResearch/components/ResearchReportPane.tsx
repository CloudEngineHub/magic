import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react"
import { FileText } from "lucide-react"
import { observer } from "mobx-react-lite"
import { useTranslation } from "react-i18next"
import {
	Empty,
	EmptyDescription,
	EmptyHeader,
	EmptyMedia,
	EmptyTitle,
} from "@/components/shadcn-ui/empty"
import Detail, { type DetailRef } from "@/pages/superMagic/components/Detail"
import { usePersonaResearchStore } from "../context"
import { attachmentVersionKey } from "../services/researchFiles"

export interface ResearchReportPaneRef {
	enterFullscreen: () => void
}

/**
 * The study report on its own: the standard file preview without its tab bar and toolbar, so
 * the report gets the whole panel. Editing and downloading live in the files tab.
 */
const ResearchReportPane = forwardRef<ResearchReportPaneRef, { generating: boolean }>(
	function ResearchReportPane({ generating }, ref) {
		const { t } = useTranslation("personaResearch")
		const store = usePersonaResearchStore()
		const detailRef = useRef<DetailRef>(null)
		const [userSelectDetail, setUserSelectDetail] = useState<unknown>()
		const [fullscreen, setFullscreen] = useState(false)
		const report = store.studyAttachments?.report ?? null
		const versionKey = report ? attachmentVersionKey(report) : ""

		useImperativeHandle(ref, () => ({
			enterFullscreen: () => detailRef.current?.enterPreviewFullscreen(),
		}))

		// Reopen when the agent rewrites the report so the pane never shows a stale version.
		useEffect(() => {
			if (!report) return
			const timer = setTimeout(() => detailRef.current?.openFileTab?.(report), 100)
			return () => clearTimeout(timer)
			// versionKey covers file_id and rewrites.
			// eslint-disable-next-line react-hooks/exhaustive-deps
		}, [versionKey])

		const project = store.selectedProject
		if (!report || !project) {
			return (
				<Empty className="h-full border-0 py-12">
					<EmptyHeader>
						<EmptyMedia variant="icon">
							<FileText />
						</EmptyMedia>
						<EmptyTitle className="text-sm">
							{generating ? t("report.generatingTitle") : t("report.emptyTitle")}
						</EmptyTitle>
						<EmptyDescription className="text-xs">
							{generating ? t("console.reportGenerating") : t("report.empty")}
						</EmptyDescription>
					</EmptyHeader>
				</Empty>
			)
		}

		return (
			<div className="h-full min-h-0" data-testid="persona-research-report">
				<Detail
					key={`${store.selectedTopic?.id}-report`}
					ref={detailRef}
					projectFilesStore={store.projectFilesStore}
					attachmentLoadState={store.projectFilesStore.attachmentLoadState}
					disPlayDetail={userSelectDetail}
					userSelectDetail={userSelectDetail}
					setUserSelectDetail={setUserSelectDetail}
					attachments={store.attachments}
					attachmentList={store.attachmentList}
					topicId={store.selectedTopic?.id}
					currentTopicStatus={store.selectedTopic?.task_status}
					messages={[]}
					selectedTopic={store.selectedTopic}
					selectedProject={project}
					projectId={project.id}
					allowDownload={false}
					persistFileTabs={false}
					hideTabBar
					// The inline pane hides the file header to give the report room; fullscreen shows it
					// again because it holds the exit-fullscreen control.
					showFileHeader={fullscreen}
					onFullscreenChange={setFullscreen}
				/>
			</div>
		)
	},
)

export default observer(ResearchReportPane)
