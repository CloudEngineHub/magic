import { observer } from "mobx-react-lite"
import { useMemoizedFn } from "ahooks"
import { projectStore, topicStore } from "@/pages/superMagic/stores/core"
import ProjectPageMainTopicsView from "./ProjectTopicListView"
import type { TopicListProps } from "./types"
import type { Topic } from "@/pages/superMagic/pages/Workspace/types"
import SuperMagicService from "@/pages/superMagic/services"
import { useMobileProjectTopicSwitch } from "@/pages/superMagicMobile/hooks/useMobileProjectTopicSwitch"

/** Keeps the project page connected to global stores while the topic view stays reusable. */
const ProjectPageMain = observer(function ProjectPageMain({
	className,
	onTopicMore,
	onTopicPin,
	onTopicDelete,
}: TopicListProps & {
	onTopicMore?: (topic: Topic) => void
	onTopicPin?: (topic: Topic) => void
	onTopicDelete?: (topic: Topic) => void
}) {
	const selectedProject = projectStore.selectedProject
	const { switchToProjectTopic } = useMobileProjectTopicSwitch({
		projectId: selectedProject?.id,
	})

	const handleRefreshTopics = useMemoizedFn(async () => {
		if (!selectedProject?.id) return
		await SuperMagicService.topic.fetchTopics({ projectId: selectedProject.id })
	})

	return (
		<ProjectPageMainTopicsView
			className={className}
			projectId={selectedProject?.id}
			topics={topicStore.topics}
			loading={topicStore.isFetchList}
			onRefresh={handleRefreshTopics}
			onSelectTopic={switchToProjectTopic}
			onTopicMore={onTopicMore}
			onTopicPin={onTopicPin}
			onTopicDelete={onTopicDelete}
		/>
	)
})

ProjectPageMain.displayName = "ProjectPageMain"
export default ProjectPageMain
