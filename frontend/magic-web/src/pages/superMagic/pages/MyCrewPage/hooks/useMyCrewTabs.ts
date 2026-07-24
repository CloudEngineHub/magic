import { useCallback, useEffect, useState } from "react"
import {
	getMyCrewAvailableTabs,
	MY_CREW_TAB_VALUES,
	normalizeMyCrewTabValue,
	type MyCrewCrewTypeTab,
} from "../tab-state"

export function useMyCrewTabs() {
	const [activeTabState, setActiveTabState] = useState<MyCrewCrewTypeTab>(
		MY_CREW_TAB_VALUES.created,
	)
	const availableTabs = getMyCrewAvailableTabs()
	const crewTypeTab = normalizeMyCrewTabValue(activeTabState)

	useEffect(() => {
		if (crewTypeTab === activeTabState) return
		setActiveTabState(crewTypeTab)
	}, [activeTabState, crewTypeTab])

	const setCrewTypeTab = useCallback((nextTab: MyCrewCrewTypeTab) => {
		setActiveTabState(normalizeMyCrewTabValue(nextTab))
	}, [])

	return {
		crewTypeTab,
		setCrewTypeTab,
		availableTabs,
		isCreatedTab: crewTypeTab === MY_CREW_TAB_VALUES.created,
		isHiredTab: crewTypeTab === MY_CREW_TAB_VALUES.hired,
		isCollaboratedTab: crewTypeTab === MY_CREW_TAB_VALUES.collaborated,
	}
}
