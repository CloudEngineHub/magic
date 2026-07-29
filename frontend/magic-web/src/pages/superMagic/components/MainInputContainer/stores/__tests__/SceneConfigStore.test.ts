import { describe, expect, it } from "vitest"
import type { PlaybookItem } from "@/apis/modules/crew"
import { SkillPanelType } from "../../panels/types"
import { SceneConfigStore } from "../SceneConfigStore"

describe("SceneConfigStore", () => {
	it("migrates legacy inspiration prompts before caching a playbook", () => {
		const store = new SceneConfigStore()
		const playbook = {
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
											value: "stable-id",
											description: "Legacy prompt",
										},
									],
								},
							],
						},
					},
				},
			},
		} as PlaybookItem

		store.setSkillConfigs("playbook-1", playbook)

		const item =
			store.getSkillConfigs("playbook-1")?.config?.scenes_config?.inspiration?.demo.groups[0]
				?.children?.[0]
		expect(item).toEqual({
			value: "stable-id",
			description: "Legacy prompt",
			prompt: "Legacy prompt",
		})
	})
})
