import type {
	DemoPanelConfig,
	LocaleText,
	OptionGroup,
	OptionItem,
} from "@/pages/superMagic/components/MainInputContainer/panels/types"

export const DEFAULT_INSPIRATION_GROUP_KEY = "__default__"

export function getBaseInspirationConfig(
	inspiration: DemoPanelConfig | undefined,
): DemoPanelConfig {
	return (
		inspiration ??
		({
			type: "demo" as DemoPanelConfig["type"],
			demo: { groups: [] },
		} satisfies DemoPanelConfig)
	)
}

export function createDefaultInspirationGroup(
	groupName: LocaleText,
	children: OptionItem[] = [],
): OptionGroup {
	return {
		group_key: DEFAULT_INSPIRATION_GROUP_KEY,
		group_name: groupName,
		children,
	}
}

export function getFallbackGroupKey(inspiration: DemoPanelConfig | undefined): string {
	return (
		inspiration?.demo?.default_selected_group_key ??
		inspiration?.demo?.groups?.[0]?.group_key ??
		""
	)
}

export function patchInspirationGroups(
	inspiration: DemoPanelConfig | undefined,
	mapFn: (groups: OptionGroup[]) => OptionGroup[],
): DemoPanelConfig {
	const base = getBaseInspirationConfig(inspiration)
	return {
		...base,
		demo: {
			...base.demo,
			groups: mapFn(base.demo.groups ?? []),
		},
	}
}
