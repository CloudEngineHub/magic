import { describe, expect, it } from "vitest"
import type { LocaleText } from "@/opensource/pages/superMagic/components/MainInputContainer/panels/types"
import type { SceneItem } from "../../../types"
import { DEFAULT_INSPIRATION_GROUP_KEY, SceneEditStore } from "../store"

const defaultGroupName: LocaleText = {
	default: "Default Group",
}

const customGroupName: LocaleText = {
	default: "Custom Group",
	zh_CN: "自定义分组",
	en_US: "Custom Group",
}

function createScene(): SceneItem {
	return {
		id: "scene-1",
		name: "Scene",
		description: "Description",
		icon: "circle",
		enabled: true,
		update_at: new Date().toISOString(),
		configs: {
			inspiration: {
				type: "demo",
				demo: {
					groups: [],
				},
			},
		},
	}
}

describe("SceneEditStore inspiration defaults", () => {
	it("creates a stable default group when first item is added", () => {
		const store = new SceneEditStore(createScene())

		store.createInspirationItem(
			{
				label: "Item",
				prompt: "Prompt",
			},
			"",
			defaultGroupName,
		)

		const inspiration = store.inspiration

		expect(inspiration?.demo.default_selected_group_key).toBe(DEFAULT_INSPIRATION_GROUP_KEY)
		expect(inspiration?.demo.groups).toHaveLength(1)
		expect(inspiration?.demo.groups[0]?.group_key).toBe(DEFAULT_INSPIRATION_GROUP_KEY)
		expect(inspiration?.demo.groups[0]?.group_name).toEqual(defaultGroupName)
		expect(inspiration?.demo.groups[0]?.children).toHaveLength(1)
		expect(inspiration?.demo.groups[0]?.children?.[0]).toMatchObject({
			label: "Item",
			prompt: "Prompt",
		})
		expect(typeof inspiration?.demo.groups[0]?.children?.[0]?.value).toBe("string")
		expect(inspiration?.demo.groups[0]?.children?.[0]).not.toHaveProperty("description")
	})

	it("keeps value stable while editing and moving the prompt", () => {
		const store = new SceneEditStore(createScene())
		const customGroupKey = store.createInspirationGroup(
			{ group_name: customGroupName },
			defaultGroupName,
		)
		store.createInspirationItem(
			{ label: "Original", prompt: "Same prompt" },
			DEFAULT_INSPIRATION_GROUP_KEY,
		)

		const original = store.inspiration?.demo.groups[0]?.children?.[0]
		expect(original).toBeDefined()
		if (!original || typeof original.value !== "string") return

		store.editInspirationItem(
			original.value,
			{ label: "Updated", prompt: { default: "Updated prompt" } },
			customGroupKey,
		)

		const moved = store.inspiration?.demo.groups.find(
			(group) => group.group_key === customGroupKey,
		)?.children?.[0]
		expect(moved).toMatchObject({
			value: original.value,
			label: "Updated",
			prompt: { default: "Updated prompt" },
		})
		expect(
			store.inspiration?.demo.groups.find(
				(group) => group.group_key === DEFAULT_INSPIRATION_GROUP_KEY,
			)?.children,
		).toEqual([])
	})

	it("deletes one item when multiple items share the same prompt", () => {
		const store = new SceneEditStore(createScene())
		store.createInspirationItem({ label: "First", prompt: "Same prompt" }, "", defaultGroupName)
		store.createInspirationItem(
			{ label: "Second", prompt: "Same prompt" },
			DEFAULT_INSPIRATION_GROUP_KEY,
		)

		const items = store.inspiration?.demo.groups[0]?.children ?? []
		expect(items).toHaveLength(2)
		const firstValue = items[0]?.value
		expect(typeof firstValue).toBe("string")
		if (typeof firstValue !== "string") return

		store.deleteInspirationItem(firstValue)

		expect(store.inspiration?.demo.groups[0]?.children?.map((item) => item.label)).toEqual([
			"Second",
		])
	})

	it("does not treat localized display values as inspiration identities", () => {
		const scene = createScene()
		if (!scene.configs?.inspiration) return
		scene.configs.inspiration.demo.groups = [
			{
				group_key: DEFAULT_INSPIRATION_GROUP_KEY,
				group_name: defaultGroupName,
				children: [
					{
						value: { default: "display-derived-id" },
						label: "Invalid item",
						prompt: "Prompt",
					},
				],
			},
		]
		const store = new SceneEditStore(scene)

		store.deleteInspirationItem("display-derived-id")

		expect(store.inspiration?.demo.groups[0]?.children).toHaveLength(1)
	})

	it("keeps the default group when first custom group is created", () => {
		const store = new SceneEditStore(createScene())

		const customGroupKey = store.createInspirationGroup(
			{
				group_name: customGroupName,
			},
			defaultGroupName,
		)

		const inspiration = store.inspiration

		expect(inspiration?.demo.default_selected_group_key).toBe(DEFAULT_INSPIRATION_GROUP_KEY)
		expect(inspiration?.demo.groups).toHaveLength(2)
		expect(inspiration?.demo.groups[0]?.group_key).toBe(DEFAULT_INSPIRATION_GROUP_KEY)
		expect(inspiration?.demo.groups[0]?.group_name).toEqual(defaultGroupName)
		expect(inspiration?.demo.groups[1]?.group_key).toBe(customGroupKey)
		expect(inspiration?.demo.groups[1]?.group_name).toEqual(customGroupName)
	})
})
