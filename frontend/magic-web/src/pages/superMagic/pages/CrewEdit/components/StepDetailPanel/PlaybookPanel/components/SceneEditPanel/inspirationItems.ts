import type {
	LocaleText,
	OptionGroup,
	OptionItem,
} from "@/pages/superMagic/components/MainInputContainer/panels/types"

export type InspirationItemData = Omit<Partial<OptionItem>, "item_key" | "label" | "value"> & {
	label: LocaleText
	value: LocaleText
}

export function updateInspirationItem(
	groups: OptionGroup[],
	targetItemKey: string,
	data: Partial<OptionItem>,
	targetGroupKey: string,
): OptionGroup[] {
	if (!groups.some((group) => group.group_key === targetGroupKey)) return groups

	const sourceGroup = groups.find((group) =>
		(group.children ?? []).some((item) => item.item_key === targetItemKey),
	)
	if (!sourceGroup) return groups

	const currentItem = (sourceGroup.children ?? []).find((item) => item.item_key === targetItemKey)
	if (!currentItem) return groups

	const updatedItem: OptionItem = {
		...currentItem,
		...data,
		item_key: targetItemKey,
	}

	return groups.map((group) => {
		if (group.group_key === sourceGroup.group_key) {
			if (sourceGroup.group_key === targetGroupKey) {
				return {
					...group,
					children: (group.children ?? []).map((item) =>
						item.item_key === targetItemKey ? updatedItem : item,
					),
				}
			}

			return {
				...group,
				children: (group.children ?? []).filter((item) => item.item_key !== targetItemKey),
			}
		}

		if (group.group_key === targetGroupKey) {
			return { ...group, children: [...(group.children ?? []), updatedItem] }
		}

		return group
	})
}

export function removeInspirationItems(
	groups: OptionGroup[],
	targetItemKeys: ReadonlySet<string>,
): OptionGroup[] {
	if (targetItemKeys.size === 0) return groups

	return groups.map((group) => ({
		...group,
		children: (group.children ?? []).filter(
			(item) => !item.item_key || !targetItemKeys.has(item.item_key),
		),
	}))
}
