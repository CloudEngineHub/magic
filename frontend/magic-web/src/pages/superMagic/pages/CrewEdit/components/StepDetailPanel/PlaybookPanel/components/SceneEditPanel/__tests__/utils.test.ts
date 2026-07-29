import { describe, expect, it } from "vitest"
import type { PlaybookItem } from "@/apis/modules/crew"
import { SkillPanelType } from "@/pages/superMagic/components/MainInputContainer/panels/types"
import { playbookToSceneItem } from "../utils"

describe("playbookToSceneItem", () => {
	it("migrates legacy inspiration before opening the editor", () => {
		const scene = playbookToSceneItem({
			id: "playbook-1",
			name_i18n: { default: "Scene" },
			description_i18n: null,
			icon: null,
			theme_color: null,
			enabled: true,
			updated_at: "2026-07-29T00:00:00Z",
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
										{ value: "stable-id", description: "Legacy prompt" },
									],
								},
							],
						},
					},
				},
			},
		} as PlaybookItem)

		expect(scene.configs?.inspiration?.demo.groups[0]?.children?.[0]).toEqual({
			value: "stable-id",
			description: "Legacy prompt",
			prompt: "Legacy prompt",
		})
	})
})
