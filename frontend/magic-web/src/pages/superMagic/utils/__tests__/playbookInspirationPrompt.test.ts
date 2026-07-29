import { describe, expect, it } from "vitest"
import {
	type DemoPanelConfig,
	SkillPanelType,
} from "@/pages/superMagic/components/MainInputContainer/panels/types"
import {
	migratePlaybookInspirationPrompt,
	migratePlaybookSceneInspirationPrompts,
} from "../playbookInspirationPrompt"

describe("playbook inspiration prompt migration", () => {
	it("moves a legacy description to prompt without changing value", () => {
		const config = {
			type: SkillPanelType.DEMO,
			demo: {
				default_selected_template_key: "stable-id",
				groups: [
					{
						group_key: "default",
						group_name: "Default",
						children: [
							{
								value: "stable-id",
								description: { default: "Legacy prompt" },
							},
						],
					},
				],
			},
		}

		const migrated = migratePlaybookInspirationPrompt(config)
		const item = migrated?.demo.groups[0]?.children?.[0]

		expect(item).toEqual({
			value: "stable-id",
			prompt: { default: "Legacy prompt" },
		})
		expect(migrated?.demo.default_selected_template_key).toBe("stable-id")
	})

	it("does not overwrite an existing prompt", () => {
		const configs = {
			inspiration: {
				type: SkillPanelType.DEMO,
				demo: {
					groups: [
						{
							group_key: "default",
							group_name: "Default",
							children: [
								{
									value: "stable-id",
									prompt: "Current prompt",
									description: "Display description",
								},
							],
						},
					],
				},
			},
		}

		expect(migratePlaybookSceneInspirationPrompts(configs)).toBe(configs)
	})

	it("keeps legacy configs without groups unchanged", () => {
		const config = {
			type: SkillPanelType.DEMO,
			demo: {},
		} as unknown as DemoPanelConfig

		expect(migratePlaybookInspirationPrompt(config)).toBe(config)
	})
})
