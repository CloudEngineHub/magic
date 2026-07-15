import { useMemo } from "react"
import { useSceneStateStore } from "../stores"
import { TopicMode } from "@/pages/superMagic/pages/Workspace/TopicMode"
import { roleStore } from "@/pages/superMagic/stores/RoleStore"
import {
	deriveCurrentSceneConfig,
	resolveCurrentSceneConfigSource,
	shouldUseSlidesFixedScene,
} from "./currentSceneConfigResolver"
import { useSlidesTemplateState } from "../scenes/Slides/useSlidesTemplateState"

/**
 * Returns current scene skill config, loading state, and derived panels.
 * Panels come from config.panels or config.scenes_config (Playbook format).
 */
interface UseCurrentSceneSkillOptions {
	topicMode?: TopicMode
}

export function useCurrentSceneConfig(options: UseCurrentSceneSkillOptions = {}) {
	const sceneStateStore = useSceneStateStore()

	const effectiveTopicMode = options.topicMode ?? roleStore.currentRole
	const isSlidesFixedScene = shouldUseSlidesFixedScene(effectiveTopicMode)
	const slidesTemplateState = useSlidesTemplateState(isSlidesFixedScene)
	const { sceneConfig, isConfigLoading } = resolveCurrentSceneConfigSource({
		isSlidesFixedScene,
		sceneStoreConfig: sceneStateStore.currentSceneConfig,
		sceneStoreLoading: sceneStateStore.isLoading,
		slidesSceneConfig: slidesTemplateState.sceneConfig,
		slidesSceneLoading: slidesTemplateState.isLoading,
	})

	const configs = useMemo(() => {
		return deriveCurrentSceneConfig(sceneConfig, effectiveTopicMode)
	}, [effectiveTopicMode, sceneConfig])

	return {
		sceneConfig,
		placeholder: configs.placeholder,
		editorType: configs.editorType,
		isConfigLoading,
		panels: configs.panels,
		isLoading: !sceneConfig && isConfigLoading,
	}
}
