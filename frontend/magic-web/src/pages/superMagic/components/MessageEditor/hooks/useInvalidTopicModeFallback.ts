import { useMemoizedFn } from "ahooks"
import { createTopicForMessageContext } from "@/pages/superMagic/services/messageSendPreparation"
import type { SceneEditorContext } from "../../MainInputContainer/components/editors/types"
import { shouldShowInvalidTopicModeFallback } from "../utils/shouldShowInvalidTopicModeFallback"

export function useInvalidTopicModeFallback(editorContext: SceneEditorContext) {
	const InvalidModeFallback = editorContext.invalidModeFallback
	const isActive = shouldShowInvalidTopicModeFallback({
		invalidModeFallback: InvalidModeFallback,
		selectedTopic: editorContext.selectedTopic,
		topicMode: editorContext.topicMode,
	})

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
