import { describe, expect, it } from "vitest"
import { SkillPanelType } from "@/pages/superMagic/components/MainInputContainer/panels/types"
import { mapPlaybookToScene, mapSceneToPlaybookParams } from "./playbook-mapper"

describe("mapPlaybookToScene", () => {
	it("preserves list snapshot config without generating editable item identities", () => {
		const scene = mapPlaybookToScene({
			id: "playbook-1",
			name: "Scene",
			description: null,
			icon: null,
			enabled: true,
			updatedAt: "2026-07-28T00:00:00Z",
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
		})

		const listItem = scene.configs?.inspiration?.demo.groups[0]?.children?.[0]
		expect(scene.configs?.inspiration?.schema_version).toBeUndefined()
		expect(listItem).toEqual({
			value: "k8m4n2p9q1",
			description: "Insert this prompt",
		})
		expect(listItem).not.toHaveProperty("item_key")
	})

	it("migrates unversioned legacy inspiration at the save boundary", () => {
		const params = mapSceneToPlaybookParams({
			id: "playbook-1",
			name: "Scene",
			description: "Description",
			icon: "sparkles",
			enabled: true,
			update_at: "2026-07-28T00:00:00Z",
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
										value: "report2026",
										description: "Display description",
									},
								],
							},
						],
					},
				},
			},
		})

		const inspiration = params.config.scenes_config?.inspiration
		const savedItem = inspiration?.demo.groups[0]?.children?.[0]
		expect(inspiration?.schema_version).toBe(2)
		expect(savedItem?.item_key).toBe("report2026")
		expect(savedItem?.value).toBe("Display description")
		expect(savedItem).not.toHaveProperty("description")
	})
})
