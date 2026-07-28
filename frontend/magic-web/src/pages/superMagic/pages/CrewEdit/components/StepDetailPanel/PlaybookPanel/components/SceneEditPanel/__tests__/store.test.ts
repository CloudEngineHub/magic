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
				value: { default: "Prompt", zh_CN: "提示词" },
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
		expect(inspiration?.demo.groups[0]?.children?.[0]?.value).toEqual({
			default: "Prompt",
			zh_CN: "提示词",
		})
	})

	it("edits and deletes only the targeted item when prompt values are duplicated", () => {
		const store = new SceneEditStore(createScene())
		const duplicatedValue = { default: "Prompt", zh_CN: "提示词" }

		store.createInspirationItem(
			{ label: "First item", value: duplicatedValue },
			"",
			defaultGroupName,
		)
		store.createInspirationItem(
			{ label: "Second item", value: duplicatedValue },
			DEFAULT_INSPIRATION_GROUP_KEY,
		)

		const [firstItem, secondItem] = store.inspiration?.demo.groups[0]?.children ?? []
		expect(firstItem).toBeDefined()
		expect(secondItem).toBeDefined()
		if (!firstItem || !secondItem) return

		store.editInspirationItem(
			secondItem,
			{ value: { default: "Updated prompt", zh_CN: "更新后的提示词" } },
			DEFAULT_INSPIRATION_GROUP_KEY,
		)

		const editedItems = store.inspiration?.demo.groups[0]?.children ?? []
		expect(editedItems[0]?.value).toEqual(duplicatedValue)
		expect(editedItems[1]?.value).toEqual({
			default: "Updated prompt",
			zh_CN: "更新后的提示词",
		})

		store.deleteInspirationItem(firstItem)
		expect(store.inspiration?.demo.groups[0]?.children).toEqual([editedItems[1]])
	})

	it("moves and batch deletes targeted items without using prompt values as identifiers", () => {
		const store = new SceneEditStore(createScene())
		const customGroupKey = store.createInspirationGroup(
			{ group_name: customGroupName },
			defaultGroupName,
		)
		const duplicatedValue = { default: "Same prompt", zh_CN: "相同提示词" }

		store.createInspirationItem(
			{ label: "Keep", value: duplicatedValue },
			DEFAULT_INSPIRATION_GROUP_KEY,
		)
		store.createInspirationItem(
			{ label: "Move", value: duplicatedValue },
			DEFAULT_INSPIRATION_GROUP_KEY,
		)
		store.createInspirationItem({ label: "Delete", value: duplicatedValue }, customGroupKey)

		const groups = store.inspiration?.demo.groups ?? []
		const defaultItems = groups.find(
			(group) => group.group_key === DEFAULT_INSPIRATION_GROUP_KEY,
		)?.children
		const customItems = groups.find((group) => group.group_key === customGroupKey)?.children
		const keepItem = defaultItems?.[0]
		const moveItem = defaultItems?.[1]
		const deleteItem = customItems?.[0]
		expect(keepItem).toBeDefined()
		expect(moveItem).toBeDefined()
		expect(deleteItem).toBeDefined()
		if (!keepItem || !moveItem || !deleteItem) return

		store.editInspirationItem(moveItem, { label: "Moved" }, customGroupKey)

		const movedGroups = store.inspiration?.demo.groups ?? []
		const movedDefaultItems = movedGroups.find(
			(group) => group.group_key === DEFAULT_INSPIRATION_GROUP_KEY,
		)?.children
		const movedCustomItems = movedGroups.find(
			(group) => group.group_key === customGroupKey,
		)?.children
		expect(movedDefaultItems).toEqual([keepItem])
		expect(movedCustomItems?.map((item) => item.label)).toEqual(["Delete", "Moved"])

		const movedItem = movedCustomItems?.[1]
		expect(movedItem).toBeDefined()
		if (!movedItem) return

		store.deleteInspirationItems([deleteItem, movedItem])
		expect(
			store.inspiration?.demo.groups.find((group) => group.group_key === customGroupKey)
				?.children,
		).toEqual([])
		expect(
			store.inspiration?.demo.groups.find(
				(group) => group.group_key === DEFAULT_INSPIRATION_GROUP_KEY,
			)?.children,
		).toEqual([keepItem])
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
