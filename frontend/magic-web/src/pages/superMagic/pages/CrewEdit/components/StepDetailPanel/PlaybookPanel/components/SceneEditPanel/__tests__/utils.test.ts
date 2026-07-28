import { describe, expect, it } from "vitest"
import type { PlaybookItem } from "@/apis/modules/crew"
import { SkillPanelType } from "@/pages/superMagic/components/MainInputContainer/panels/types"
import { playbookToSceneItem } from "../utils"

describe("playbookToSceneItem", () => {
	it("migrates all legacy inspiration prompts when loading the edit scene", () => {
		const scene = playbookToSceneItem({
			id: "playbook-1",
			name_i18n: { default: "Scene" },
			description_i18n: null,
			icon: null,
			theme_color: null,
			enabled: true,
			updated_at: "2026-07-28T00:00:00Z",
			config: {
				scenes_config: {
					inspiration: {
						type: SkillPanelType.DEMO,
						demo: {
							groups: [
								{
									group_key: "default",
									group_name: "Default",
									children: [
										{
											value: "k8m4n2p9q1",
											description: "Insert this prompt",
										},
									],
								},
							],
						},
					},
				},
			},
		} as PlaybookItem)

		const normalizedItem = scene.configs?.inspiration?.demo.groups[0]?.children?.[0]
		expect(normalizedItem).toEqual({
			value: "Insert this prompt",
		})
		expect(normalizedItem).not.toHaveProperty("description")
	})
})
