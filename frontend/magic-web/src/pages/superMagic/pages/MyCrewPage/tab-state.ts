export const MY_CREW_TAB_VALUES = {
	created: "created",
	hired: "hired",
	collaborated: "collaborated",
} as const

export type MyCrewCrewTypeTab = (typeof MY_CREW_TAB_VALUES)[keyof typeof MY_CREW_TAB_VALUES]

const MY_CREW_DEFAULT_TAB = MY_CREW_TAB_VALUES.created
const MY_CREW_AVAILABLE_TABS: MyCrewCrewTypeTab[] = [
	MY_CREW_TAB_VALUES.created,
	MY_CREW_TAB_VALUES.hired,
	MY_CREW_TAB_VALUES.collaborated,
]

export function getMyCrewAvailableTabs(): MyCrewCrewTypeTab[] {
	return MY_CREW_AVAILABLE_TABS
}

function isMyCrewCrewTypeTab(tab: string): tab is MyCrewCrewTypeTab {
	return MY_CREW_AVAILABLE_TABS.some((availableTab) => availableTab === tab)
}

export function normalizeMyCrewTabValue(tab: string | null | undefined): MyCrewCrewTypeTab {
	if (tab && isMyCrewCrewTypeTab(tab)) return tab
	// Removed or malformed persisted tab values must never leave the page without a valid list.
	return MY_CREW_DEFAULT_TAB
}
