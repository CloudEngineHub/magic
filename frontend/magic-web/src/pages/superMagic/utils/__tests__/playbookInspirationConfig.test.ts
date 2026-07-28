import { describe, expect, it } from "vitest"
import { SkillPanelType } from "@/pages/superMagic/components/MainInputContainer/panels/types"
import { normalizeLegacyInspirationConfig } from "../playbookInspirationConfig"

describe("normalizeLegacyInspirationConfig", () => {
	it("moves legacy playbook prompts from description to value", () => {
		const legacyPrompt = { default: "Legacy prompt", zh_CN: "旧提示词" }
		const normalized = normalizeLegacyInspirationConfig({
			type: SkillPanelType.DEMO,
			demo: {
				groups: [
					{
						group_key: "default",
						group_name: "Default",
						children: [
							{
								value: "k8m4n2p9q1",
								label: "Demo",
								description: legacyPrompt,
							},
						],
					},
				],
			},
		})

		const normalizedItem = normalized?.demo.groups[0]?.children?.[0]
		expect(normalizedItem).toEqual({
			value: legacyPrompt,
			label: "Demo",
		})
		expect(normalizedItem).not.toHaveProperty("description")
	})

	it("preserves correctly mapped prompts when no legacy description exists", () => {
		const config = {
			type: SkillPanelType.DEMO,
			demo: {
				groups: [
					{
						group_key: "default",
						group_name: "Default",
						children: [
							{
								value: { default: "Write a summary", zh_CN: "撰写摘要" },
								label: "Demo",
							},
						],
					},
				],
			},
		} as const

		const normalized = normalizeLegacyInspirationConfig(config)

		expect(normalized).toBe(config)
	})
})
