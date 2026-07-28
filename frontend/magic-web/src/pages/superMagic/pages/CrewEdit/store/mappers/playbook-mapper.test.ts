import { describe, expect, it } from "vitest"
import { SkillPanelType } from "@/pages/superMagic/components/MainInputContainer/panels/types"
import { mapPlaybookToScene } from "./playbook-mapper"

describe("mapPlaybookToScene", () => {
	it("normalizes legacy inspiration data used while scene details are loading", () => {
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

		const normalizedItem = scene.configs?.inspiration?.demo.groups[0]?.children?.[0]
		expect(normalizedItem).toEqual({ value: "Insert this prompt" })
		expect(normalizedItem).not.toHaveProperty("description")
	})
})
