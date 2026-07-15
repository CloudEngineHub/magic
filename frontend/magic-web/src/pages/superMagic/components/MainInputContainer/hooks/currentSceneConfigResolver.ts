import type { LocaleText, SkillPanelConfig } from "../panels/types"
import { SceneEditorKey } from "../../../types/skill"
import { TopicMode } from "@/pages/superMagic/pages/Workspace/TopicMode"
import { isSlidesMode, slidesFixedSceneConfig } from "../scenes/Slides/slidesTemplateState"

/** Config with panels (SkillConfig) or scenes_config (PlaybookConfig). */
export interface ConfigWithPanels {
	panels?: SkillPanelConfig[]
	config?: {
		scenes_config?: Record<string, SkillPanelConfig | undefined>
		editor_type?: SceneEditorKey
	}
	placeholder?: LocaleText
}

interface ResolveSceneConfigSourceParams {
	isSlidesFixedScene: boolean
	sceneStoreConfig?: unknown
	sceneStoreLoading: boolean
	slidesSceneConfig?: ConfigWithPanels
	slidesSceneLoading: boolean
}

export function shouldUseSlidesFixedScene(topicMode: TopicMode | undefined) {
	return isSlidesMode(topicMode)
}

export function resolveCurrentSceneConfigSource({
	isSlidesFixedScene,
	sceneStoreConfig,
	sceneStoreLoading,
	slidesSceneConfig,
	slidesSceneLoading,
}: ResolveSceneConfigSourceParams) {
	if (isSlidesFixedScene) {
		return {
			sceneConfig:
				slidesSceneConfig ?? (slidesSceneLoading ? undefined : slidesFixedSceneConfig),
			isConfigLoading: slidesSceneLoading,
		}
	}

	return {
		sceneConfig: sceneStoreConfig as ConfigWithPanels | undefined,
		isConfigLoading: sceneStoreLoading,
	}
}

export function deriveCurrentSceneConfig(
	sceneConfig: ConfigWithPanels | undefined,
	topicMode: TopicMode | undefined,
) {
	const isRecordSummaryMode = topicMode === TopicMode.RecordSummary

	return {
		panels: Object.values(sceneConfig?.config?.scenes_config || {}).filter(
			Boolean,
		) as SkillPanelConfig[],
		editorType: sceneConfig
			? (sceneConfig.config?.editor_type ?? SceneEditorKey.General)
			: isRecordSummaryMode
				? SceneEditorKey.RecordSummary
				: undefined,
		placeholder: sceneConfig?.placeholder,
	}
}
