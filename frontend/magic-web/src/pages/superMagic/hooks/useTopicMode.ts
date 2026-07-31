import { useEffect, useState } from "react"
import { reaction } from "mobx"
import { ProjectListItem, Topic } from "../pages/Workspace/types"
import { TopicMode } from "../pages/Workspace/TopicMode"
import { useDeepCompareEffect, useMemoizedFn } from "ahooks"
import ProjectTopicService from "@/services/superMagic/ProjectTopicService"
import { useIsMobile } from "@/hooks/useIsMobile"
import SuperMagicService from "@/pages/superMagic/services"

function useTopicMode({
	selectedTopic,
	selectedProject,
}: {
	selectedTopic: Topic | undefined | null
	selectedProject: ProjectListItem | undefined | null
}) {
	const isMobile = useIsMobile()
	const resolveTopicMode = () =>
		selectedTopic?.topic_mode ||
		ProjectTopicService.getProjectDefaultTopicMode(
			selectedProject?.workspace_id || "",
			selectedProject?.id || "",
		) ||
		TopicMode.General
	const [topicMode, setTopicMode] = useState<TopicMode>(resolveTopicMode)

	useEffect(() => {
		/**
		 * 移动端不能使用聊天模式
		 */
		if (isMobile && topicMode === TopicMode.Chat) {
			setTopicMode(TopicMode.General)
		}
	}, [topicMode, isMobile])

	useDeepCompareEffect(() => {
		setTopicMode(resolveTopicMode())
	}, [selectedTopic, selectedProject])

	useEffect(() => {
		if (selectedTopic?.topic_mode) return

		return reaction(
			() =>
				ProjectTopicService.getProjectDefaultTopicMode(
					selectedProject?.workspace_id || "",
					selectedProject?.id || "",
				),
			(mode) => setTopicMode(mode || TopicMode.General),
		)
	}, [selectedProject?.id, selectedProject?.workspace_id, selectedTopic?.topic_mode])

	const handleSetTopicMode = useMemoizedFn((mode: TopicMode) => {
		setTopicMode(mode)
		if (selectedProject?.workspace_id && selectedProject?.id) {
			ProjectTopicService.setProjectDefaultTopicMode(
				selectedProject?.workspace_id,
				selectedProject?.id,
				mode,
			)
		}
		// 手动切换员工/模式后，同步覆盖创建时继承下来的前端 patch。
		// 否则刷新或重新拉详情时，旧员工会再次覆盖当前选择。
		SuperMagicService.topic.syncTopicFrontendModePatch({
			topic: selectedTopic,
			mode,
		})
	})

	return { topicMode, setTopicMode: handleSetTopicMode }
}

export default useTopicMode
