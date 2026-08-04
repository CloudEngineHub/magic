import { memo, useMemo } from "react"
import { Brain, Files, Timer } from "lucide-react"
import { useTranslation } from "react-i18next"
import { LongTremMemorySider } from "../../../components/LongTremMemory/components/MemorySider"
import IconShareCog from "@/enhance/tabler/icons-react/icons/iconShareCog"
import ProjectCardContainer from "../../../components/ProjectCardContainer"
import ProjectSider from "../../../components/ProjectSider"
import ShareManagementPanel from "../../../components/ShareManagement/ShareManagementPanel"
import SiderTask from "../../../components/SiderTask"
import TopicFilesButton from "../../../components/TopicFilesButton"
import { ProjectListItem, Topic, Workspace } from "../../../pages/Workspace/types"

interface TopicSidebarProps {
	selectedProject: ProjectListItem | null
	selectedWorkspace: Workspace | null
	selectedTopic: Topic | null
	isReadOnly: boolean
	topicFilesProps: any
	/** When true, hides the project header card in the sidebar */
	hideProjectCard?: boolean
	/** Chat detail pages only expose files and share tabs in ProjectSider */
	siderVariant?: "default" | "chat"
}

function TopicSidebar({
	selectedProject,
	selectedWorkspace,
	selectedTopic,
	isReadOnly,
	topicFilesProps,
	hideProjectCard = false,
	siderVariant = "default",
}: TopicSidebarProps) {
	const { t } = useTranslation("super")
	const { t: tLongMemory } = useTranslation("super/longMemory")
	const isChatSider = siderVariant === "chat"
	// Chat sidebars use a shorter label to avoid implying the list is project-scoped metadata.
	const topicFilesTitle = isChatSider ? t("topicFiles.fileTitle") : t("topicFiles.title")
	const items = useMemo(
		() => [
			{
				key: "topicFiles",
				title: topicFilesTitle,
				icon: <Files size={16} />,
				// Keep the panel header aligned with the active sidebar label in chat scenes.
				content: <TopicFilesButton {...topicFilesProps} title={topicFilesTitle} />,
			},
			...(isChatSider
				? []
				: [
						{
							key: "task",
							title: t("scheduleTask.title"),
							icon: <Timer size={16} />,
							content: (
								<SiderTask
									selectWorkspaceId={selectedWorkspace?.id}
									selectProjectId={selectedProject?.id}
									selectTopicId={selectedTopic?.id}
								/>
							),
							visible: !isReadOnly,
						},
						{
							key: "longMemory",
							title: tLongMemory("longMemory"),
							icon: <Brain size={16} />,
							content: (
								<LongTremMemorySider
									projectId={selectedProject?.id}
									selectedProject={selectedProject}
									selectedWorkspace={selectedWorkspace}
									activeFileId={topicFilesProps.activeFileId}
									onFileClick={topicFilesProps.onFileClick}
								/>
							),
						},
					]),
			{
				key: "share",
				title: t("shareManagement.title"),
				icon: <IconShareCog size={16} color="currentColor" />,
				content: <ShareManagementPanel projectId={selectedProject?.id} />,
			},
		],
		[
			isChatSider,
			isReadOnly,
			selectedProject?.id,
			selectedTopic?.id,
			selectedWorkspace?.id,
			t,
			tLongMemory,
			topicFilesTitle,
			topicFilesProps,
		],
	)

	return (
		<div className="flex h-full flex-col gap-2">
			{hideProjectCard ? null : (
				<ProjectCardContainer
					selectedProject={selectedProject}
					selectedWorkspace={selectedWorkspace}
				/>
			)}
			<ProjectSider
				items={items}
				className="flex-1 overflow-hidden rounded-lg border border-border bg-background"
			/>
		</div>
	)
}

export default memo(TopicSidebar)
