import { useEffect, useState } from "react"
import { reaction } from "mobx"
import { ProjectListItem, Topic } from "../pages/Workspace/types"
import { TopicMode } from "../pages/Workspace/TopicMode"
import { useDeepCompareEffect, useMemoizedFn } from "ahooks"
import ProjectTopicService from "@/services/superMagic/ProjectTopicService"
import { getFallbackTopicModeIdentifier } from "@/services/superMagic/DefaultAgentSelectionService"
import SuperMagicService from "@/pages/superMagic/services"

function useTopicMode({
	selectedTopic,
	selectedProject,
}: {
	selectedTopic: Topic | undefined | null
	selectedProject: ProjectListItem | undefined | null
}) {
	const resolveTopicMode = () =>
		selectedTopic?.topic_mode ||
		ProjectTopicService.getProjectDefaultTopicMode(
			selectedProject?.workspace_id || "",
			selectedProject?.id || "",
		) ||
		getFallbackTopicModeIdentifier()
	const [topicMode, setTopicModeState] = useState<TopicMode>(resolveTopicMode)

	useDeepCompareEffect(() => {
		setTopicModeState(resolveTopicMode())
	}, [selectedTopic, selectedProject])

	useEffect(() => {
		if (selectedTopic?.topic_mode) return

		return reaction(
			() =>
				ProjectTopicService.getProjectDefaultTopicMode(
					selectedProject?.workspace_id || "",
					selectedProject?.id || "",
				),
			(mode) => setTopicModeState(mode || getFallbackTopicModeIdentifier()),
		)
	}, [selectedProject?.id, selectedProject?.workspace_id, selectedTopic?.topic_mode])

	const recoverTopicMode = useMemoizedFn((mode: TopicMode) => {
		setTopicModeState(mode)
		// Sync the empty topic patch without persisting user preferences.
		SuperMagicService.topic.syncTopicFrontendModePatch({
			topic: selectedTopic,
			mode,
		})
	})

	const handleSetTopicMode = useMemoizedFn((mode: TopicMode) => {
		recoverTopicMode(mode)
		if (selectedProject?.workspace_id && selectedProject?.id) {
			ProjectTopicService.setProjectDefaultTopicMode(
				selectedProject?.workspace_id,
				selectedProject?.id,
				mode,
			)
		}
	})

	return { topicMode, setTopicMode: handleSetTopicMode, recoverTopicMode }
}

export default useTopicMode
