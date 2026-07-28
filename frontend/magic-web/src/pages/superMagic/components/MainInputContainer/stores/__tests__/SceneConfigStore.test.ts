import { describe, expect, it } from "vitest"
import type { PlaybookItem } from "@/apis/modules/crew"
import { SkillPanelType } from "../../panels/types"
import { SceneConfigStore } from "../SceneConfigStore"

describe("SceneConfigStore", () => {
	it("migrates unversioned legacy inspiration before caching a playbook", () => {
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
		} as PlaybookItem

		store.setSkillConfigs("playbook-1", playbook)

		const normalizedItem =
			store.getSkillConfigs("playbook-1")?.config?.scenes_config?.inspiration?.demo.groups[0]
				?.children?.[0]
		expect(
			store.getSkillConfigs("playbook-1")?.config?.scenes_config?.inspiration?.schema_version,
		).toBe(2)
		expect(normalizedItem).toEqual({
			item_key: "k8m4n2p9q1",
			value: "Insert this prompt",
		})
	})
})
