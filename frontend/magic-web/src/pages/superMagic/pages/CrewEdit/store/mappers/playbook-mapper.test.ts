import { describe, expect, it } from "vitest"
import { SkillPanelType } from "@/pages/superMagic/components/MainInputContainer/panels/types"
import { mapPlaybookToScene, mapSceneToPlaybookParams } from "./playbook-mapper"

describe("mapPlaybookToScene", () => {
	it("migrates a legacy inspiration prompt while preserving value", () => {
		const scene = mapPlaybookToScene({
			id: "playbook-1",
			name: "Scene",
			description: null,
			icon: null,
			enabled: true,
			updatedAt: "2026-07-29T00:00:00Z",
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
		})

		expect(scene.configs?.inspiration?.demo.groups[0]?.children?.[0]).toEqual({
			value: "stable-id",
			description: "Legacy prompt",
			prompt: "Legacy prompt",
		})
	})
})

describe("mapSceneToPlaybookParams", () => {
	it("persists legacy descriptions as prompts while preserving value identity", () => {
		const params = mapSceneToPlaybookParams({
			id: "playbook-1",
			name: "Scene",
			description: "Description",
			icon: "sparkles",
			enabled: true,
			update_at: "2026-07-29T00:00:00Z",
			configs: {
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
										description: "Legacy prompt",
									},
								],
							},
						],
					},
				},
			},
		})

		const item = params.config.scenes_config?.inspiration?.demo.groups[0]?.children?.[0]
		expect(item).toEqual({
			value: "stable-id",
			description: "Legacy prompt",
			prompt: "Legacy prompt",
		})
	})
})
