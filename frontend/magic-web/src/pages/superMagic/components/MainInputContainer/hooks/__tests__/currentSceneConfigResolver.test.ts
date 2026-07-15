import { describe, expect, it } from "vitest"
import { SceneEditorKey } from "@/pages/superMagic/types/skill"
import { TopicMode } from "@/pages/superMagic/pages/Workspace/TopicMode"
import { SkillPanelType } from "@/pages/superMagic/components/MainInputContainer/panels/types"
import {
	deriveCurrentSceneConfig,
	resolveCurrentSceneConfigSource,
	shouldUseSlidesFixedScene,
	type ConfigWithPanels,
} from "../currentSceneConfigResolver"

const sceneConfig: ConfigWithPanels = {
	placeholder: "test",
	config: {
		editor_type: SceneEditorKey.General,
		scenes_config: {
			main: {
				type: SkillPanelType.GUIDE,
				title: "Guide",
				guide: {
					items: [],
				},
			},
			empty: undefined,
		},
	},
}

describe("currentSceneConfigResolver", () => {
	it("enables fixed slides scene for PPT mode in all environments", () => {
		expect(shouldUseSlidesFixedScene(TopicMode.PPT)).toBe(true)
		expect(shouldUseSlidesFixedScene(TopicMode.General)).toBe(false)
	})

	it("uses slides scene config when fixed slides scene is enabled", () => {
		const resolved = resolveCurrentSceneConfigSource({
			isSlidesFixedScene: true,
			sceneStoreConfig: undefined,
			sceneStoreLoading: true,
			slidesSceneConfig: sceneConfig,
			slidesSceneLoading: false,
		})

		expect(resolved.sceneConfig).toBe(sceneConfig)
		expect(resolved.isConfigLoading).toBe(false)
	})

	it("does not fall back to empty slides config while slides templates are loading", () => {
		const resolved = resolveCurrentSceneConfigSource({
			isSlidesFixedScene: true,
			sceneStoreConfig: undefined,
			sceneStoreLoading: false,
			slidesSceneConfig: undefined,
			slidesSceneLoading: true,
		})

		expect(resolved.sceneConfig).toBeUndefined()
		expect(resolved.isConfigLoading).toBe(true)
	})

	it("uses scene store config when fixed slides scene is disabled", () => {
		const resolved = resolveCurrentSceneConfigSource({
			isSlidesFixedScene: false,
			sceneStoreConfig: sceneConfig,
			sceneStoreLoading: true,
			slidesSceneConfig: undefined,
			slidesSceneLoading: false,
		})

		expect(resolved.sceneConfig).toBe(sceneConfig)
		expect(resolved.isConfigLoading).toBe(true)
	})

	it("derives panels, editor type, and placeholder", () => {
		const derived = deriveCurrentSceneConfig(sceneConfig, TopicMode.General)

		expect(derived.panels).toHaveLength(1)
		expect(derived.editorType).toBe(SceneEditorKey.General)
		expect(derived.placeholder).toBe("test")
	})

	it("returns record summary editor type before remote config loads", () => {
		const derived = deriveCurrentSceneConfig(undefined, TopicMode.RecordSummary)

		expect(derived.panels).toEqual([])
		expect(derived.editorType).toBe(SceneEditorKey.RecordSummary)
	})
})
