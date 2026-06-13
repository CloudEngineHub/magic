import { describe, expect, it } from "vitest"
import { getPromptRichTextPlainText } from "../../panels/promptRichText"
import {
	SELF_MEDIA_CARD_COUNT_PRESETS,
	buildSelfMediaComposerPresetContent,
	getDefaultSelfMediaComposerConfig,
	isSelfMediaComposerContext,
	resolveSelfMediaCardCount,
	resolveSelfMediaVisualPreset,
	shouldShowSelfMediaComposerConfigPanel,
} from "../selfMediaComposerConfig"
import { ScenePanelVariant } from "../../components/LazyScenePanel/types"

describe("selfMediaComposerConfig", () => {
	it("builds prompt suffix with English codes and final numeric card count", () => {
		const content = buildSelfMediaComposerPresetContent({
			platform: "rednote",
			visualPreset: "code-dispatch",
			cardCount: 8,
		})

		expect(getPromptRichTextPlainText(content)).toBe(
			"platform: rednote; visualPreset: code-dispatch; cardCount: 8.",
		)
	})

	it("supports localized field labels while keeping values as English codes", () => {
		const content = buildSelfMediaComposerPresetContent(
			{
				platform: "rednote",
				visualPreset: "code-dispatch",
				cardCount: 8,
			},
			{
				platform: "平台",
				visualPreset: "模板",
				cardCount: "卡片数量",
			},
		)

		expect(getPromptRichTextPlainText(content)).toBe(
			"平台: rednote; 模板: code-dispatch; 卡片数量: 8.",
		)
	})

	it("omits cardCount for wechat official accounts", () => {
		const content = buildSelfMediaComposerPresetContent({
			platform: "wechat-official-accounts",
			visualPreset: "custom",
			cardCount: 6,
		})

		expect(getPromptRichTextPlainText(content)).toBe(
			"platform: wechat-official-accounts; visualPreset: custom.",
		)
	})

	it("builds prompt suffix only from selected self-media fields", () => {
		expect(
			getPromptRichTextPlainText(
				buildSelfMediaComposerPresetContent({ platform: "rednote" }),
			),
		).toBe("platform: rednote.")
		expect(
			getPromptRichTextPlainText(
				buildSelfMediaComposerPresetContent({ visualPreset: "personal-insight" }),
			),
		).toBe("visualPreset: personal-insight.")
		expect(
			getPromptRichTextPlainText(buildSelfMediaComposerPresetContent({ cardCount: 8 })),
		).toBe("cardCount: 8.")
		expect(buildSelfMediaComposerPresetContent({})).toBeUndefined()
	})

	it("switches to the first preset when the current preset does not belong to the platform", () => {
		expect(resolveSelfMediaVisualPreset("instagram", "code-dispatch")).toBe("ins-modern")
		expect(resolveSelfMediaVisualPreset("wechat-official-accounts", "code-dispatch")).toBe(
			"custom",
		)
	})

	it("resolves custom card count as a clamped number instead of the word custom", () => {
		expect(
			resolveSelfMediaCardCount({ mode: "custom", customValue: "8", platform: "rednote" }),
		).toBe(8)
		expect(
			resolveSelfMediaCardCount({ mode: "custom", customValue: "28", platform: "rednote" }),
		).toBe(20)
		expect(
			resolveSelfMediaCardCount({ mode: "custom", customValue: "0", platform: "rednote" }),
		).toBe(1)
		expect(
			resolveSelfMediaCardCount({ mode: "custom", customValue: "", platform: "instagram" }),
		).toBe(6)
	})

	it("defaults to rednote with the self media composer default choices", () => {
		expect(getDefaultSelfMediaComposerConfig()).toEqual({
			platform: "rednote",
			visualPreset: "personal-insight",
			cardCount: 6,
		})
		expect(SELF_MEDIA_CARD_COUNT_PRESETS).toEqual([3, 6, 9, 12])
	})

	it("only enables the panel in the ip manager scene context", () => {
		expect(isSelfMediaComposerContext({ topicMode: "ip-manager" })).toBe(true)
		expect(
			isSelfMediaComposerContext({ topicMode: "CustomAgent", agentCode: "ip-manager" }),
		).toBe(true)
		expect(
			isSelfMediaComposerContext({
				topicMode: "CustomAgent",
				selectedTopic: { agent_code: "ip-manager" },
			}),
		).toBe(true)
		expect(isSelfMediaComposerContext({ topicMode: "general" })).toBe(false)
	})

	it("shows the panel after an ip manager scene is selected even before scene config exists", () => {
		expect(
			shouldShowSelfMediaComposerConfigPanel({
				context: { topicMode: "ip-manager" },
				hasSelectedScene: true,
				hasAvailableScenes: true,
			}),
		).toBe(true)
		expect(
			shouldShowSelfMediaComposerConfigPanel({
				context: { topicMode: "ip-manager" },
				hasSelectedScene: false,
				hasAvailableScenes: true,
			}),
		).toBe(false)
		expect(
			shouldShowSelfMediaComposerConfigPanel({
				context: { topicMode: "ip-manager" },
				hasSelectedScene: true,
				hasAvailableScenes: true,
				variant: ScenePanelVariant.Mobile,
			}),
		).toBe(false)
	})

	it("shows the panel for ip manager mode when the mode has no playbook scenes", () => {
		expect(
			shouldShowSelfMediaComposerConfigPanel({
				context: { topicMode: "ip-manager" },
				hasSelectedScene: false,
				hasAvailableScenes: false,
			}),
		).toBe(true)
	})
})
