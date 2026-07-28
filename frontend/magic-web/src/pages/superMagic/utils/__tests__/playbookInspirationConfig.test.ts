import { describe, expect, it } from "vitest"
import { SkillPanelType } from "@/pages/superMagic/components/MainInputContainer/panels/types"
import {
	CURRENT_PLAYBOOK_INSPIRATION_SCHEMA_VERSION,
	normalizePlaybookInspirationConfig,
} from "../playbookInspirationConfig"

function createKeyFactory(...keys: string[]) {
	let index = 0
	return () => keys[index++] ?? `generated-${index}`
}

describe("normalizePlaybookInspirationConfig", () => {
	it("migrates an unversioned all-letter legacy key without inspecting its shape", () => {
		const legacyPrompt = { default: "Legacy prompt", zh_CN: "旧提示词" }
		const normalized = normalizePlaybookInspirationConfig({
			type: SkillPanelType.DEMO,
			demo: {
				default_selected_template_key: "wwbarjblkk",
				groups: [
					{
						group_key: "default",
						group_name: "Default",
						children: [
							{
								value: "wwbarjblkk",
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
			item_key: "wwbarjblkk",
			value: legacyPrompt,
			label: "Demo",
		})
		expect(normalized?.schema_version).toBe(CURRENT_PLAYBOOK_INSPIRATION_SCHEMA_VERSION)
		expect(normalized?.demo.default_selected_template_key).toBe("wwbarjblkk")
	})

	it("preserves schema v2 prompt and display description regardless of value shape", () => {
		const config = {
			schema_version: 2,
			type: SkillPanelType.DEMO,
			demo: {
				groups: [
					{
						group_key: "default",
						group_name: "Default",
						children: [
							{
								item_key: "item-summary",
								value: "report2026",
								label: "Demo",
								description: "Display description",
							},
						],
					},
				],
			},
		} as const

		const normalized = normalizePlaybookInspirationConfig(config)

		expect(normalized).toBe(config)
	})

	it("migrates every unversioned item by the config version instead of value shape", () => {
		const normalized = normalizePlaybookInspirationConfig(
			{
				type: SkillPanelType.DEMO,
				demo: {
					default_selected_template_key: "report2026",
					groups: [
						{
							group_key: "default",
							group_name: "Default",
							children: [
								{
									value: "report2026",
									description: "Display description",
								},
								{
									value: "report2026",
									description: "Another description",
								},
							],
						},
					],
				},
			},
			{ createItemKey: createKeyFactory("item-second") },
		)

		expect(normalized?.schema_version).toBe(CURRENT_PLAYBOOK_INSPIRATION_SCHEMA_VERSION)
		expect(normalized?.demo.groups[0]?.children).toEqual([
			{
				item_key: "report2026",
				value: "Display description",
			},
			{
				item_key: "item-second",
				value: "Another description",
			},
		])
		expect(normalized?.demo.default_selected_template_key).toBe("report2026")
	})

	it("repairs duplicate persisted keys so CRUD cannot target multiple items", () => {
		const normalized = normalizePlaybookInspirationConfig(
			{
				schema_version: 2,
				type: SkillPanelType.DEMO,
				demo: {
					groups: [
						{
							group_key: "default",
							group_name: "Default",
							children: [
								{ item_key: "duplicate", value: "First" },
								{ item_key: "duplicate", value: "Second" },
							],
						},
					],
				},
			},
			{ createItemKey: createKeyFactory("replacement") },
		)

		expect(normalized?.demo.groups[0]?.children?.map((item) => item.item_key)).toEqual([
			"duplicate",
			"replacement",
		])
	})
})
