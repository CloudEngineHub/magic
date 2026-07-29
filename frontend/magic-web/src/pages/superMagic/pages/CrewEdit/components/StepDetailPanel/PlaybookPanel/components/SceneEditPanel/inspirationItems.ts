import type {
	LocaleText,
	OptionGroup,
	OptionItem,
} from "@/pages/superMagic/components/MainInputContainer/panels/types"
import { getOptionValue } from "@/pages/superMagic/components/MainInputContainer/panels/utils"

export type InspirationItemData = Omit<
	Partial<OptionItem>,
	"value" | "label" | "prompt" | "description"
> & {
	label: LocaleText
	prompt: LocaleText
}

export function updateInspirationItem(
	groups: OptionGroup[],
	targetValue: string,
	data: InspirationItemData,
	targetGroupKey: string,
): OptionGroup[] {
	if (!groups.some((group) => group.group_key === targetGroupKey)) return groups

	const sourceGroup = groups.find((group) =>
		(group.children ?? []).some((item) => getOptionValue(item) === targetValue),
	)
	if (!sourceGroup) return groups

	const currentItem = (sourceGroup.children ?? []).find(
		(item) => getOptionValue(item) === targetValue,
	)
	if (!currentItem) return groups

	// The prompt can change, but value remains the persisted identity used by CRUD and defaults.
	const updatedItem: OptionItem = {
		...currentItem,
		...data,
		value: currentItem.value,
		description: undefined,
	}

	return groups.map((group) => {
		if (group.group_key === sourceGroup.group_key) {
			if (sourceGroup.group_key === targetGroupKey) {
				return {
					...group,
					children: (group.children ?? []).map((item) =>
						getOptionValue(item) === targetValue ? updatedItem : item,
					),
				}
			}

			return {
				...group,
				children: (group.children ?? []).filter(
					(item) => getOptionValue(item) !== targetValue,
				),
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
	targetValues: ReadonlySet<string>,
): OptionGroup[] {
	if (targetValues.size === 0) return groups

	return groups.map((group) => ({
		...group,
		children: (group.children ?? []).filter((item) => !targetValues.has(getOptionValue(item))),
	}))
}
