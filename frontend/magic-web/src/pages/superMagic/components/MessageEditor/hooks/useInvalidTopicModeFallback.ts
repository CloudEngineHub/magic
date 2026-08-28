import { useEffect } from "react"
import { useMemoizedFn } from "ahooks"
import { createTopicForMessageContext } from "@/pages/superMagic/services/messageSendPreparation"
import { getFallbackTopicModeIdentifier } from "@/services/superMagic/DefaultAgentSelectionService"
import superMagicModeService from "@/services/superMagic/SuperMagicModeService"
import type { TopicMode } from "@/pages/superMagic/pages/Workspace/TopicMode"
import type { SceneEditorContext } from "../../MainInputContainer/components/editors/types"
import {
	hasSavedTopicMode,
	shouldShowInvalidTopicModeFallback,
} from "../utils/shouldShowInvalidTopicModeFallback"

export function useInvalidTopicModeFallback(editorContext: SceneEditorContext) {
	const InvalidModeFallback = editorContext.invalidModeFallback
	const messagesLength = editorContext.messagesLength ?? 0
	const selectedTopic = editorContext.selectedTopic
	const topicMode = editorContext.topicMode
	const recoverTopicMode = editorContext.recoverTopicMode
	const hasSavedMode = hasSavedTopicMode(selectedTopic)
	const isModeAvailabilityResolved = superMagicModeService.isModeAvailabilityResolved
	const isModeValid = superMagicModeService.isModeValid(
		topicMode as TopicMode,
		selectedTopic?.agent_code,
	)

	const isActive = shouldShowInvalidTopicModeFallback({
		invalidModeFallback: InvalidModeFallback,
		selectedTopic,
		topicMode,
		messagesLength,
	})

	useEffect(() => {
		if (!selectedTopic || !recoverTopicMode) return
		// 已保存的模式失效时保留服务端状态，让输入区展示明确的不可用提示。
		if (!isModeAvailabilityResolved || hasSavedMode || messagesLength > 0 || isModeValid) return

		const fallbackMode = getFallbackTopicModeIdentifier()
		if (fallbackMode === topicMode) return

		recoverTopicMode(fallbackMode)
	}, [
		hasSavedMode,
		isModeAvailabilityResolved,
		isModeValid,
		messagesLength,
		recoverTopicMode,
		selectedTopic,
		topicMode,
	])

	const onCreateTopic = useMemoizedFn(async () => {
		if (editorContext.createTopic) {
			await editorContext.createTopic({ selectedProject: editorContext.selectedProject })
			return
		}

		await createTopicForMessageContext({
			selectedProject: editorContext.selectedProject,
			selectedTopic: editorContext.selectedTopic,
			selectedWorkspace: editorContext.selectedWorkspace,
			setSelectedProject: editorContext.setSelectedProject,
			setSelectedTopic: editorContext.setSelectedTopic,
			setSelectedWorkspace: editorContext.setSelectedWorkspace,
			topicStore: editorContext.topicStore,
		})
	})

	return {
		isActive,
		InvalidModeFallback,
		onCreateTopic,
	}
}
