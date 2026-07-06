import { useCallback, useMemo } from "react"

import { getNativePort } from "@/platform/native"
import { RouteName } from "@/routes/constants"
import useNavigate from "@/routes/hooks/useNavigate"
import { isMagicApp } from "@/utils/devices"
import { useSuperMobileShellNavItems } from "@/pages/superMagicMobile/components/MobileShell/hooks/useSuperMobileShellNavItems"

import type { MobileShellMenuNavItem } from "../MobileShellMenuContext"
import type {
	SuperMobileShellNativeRecordingTab,
	SuperMobileShellNavigationOptions,
	SuperMobileShellNavigationResult,
} from "./types"

/** Opens the app-native recording tab because Magic App owns recording navigation. */
function openNativeRecordingPage(tab: SuperMobileShellNativeRecordingTab) {
	void getNativePort().navigation.changeBottomTab({
		tab,
		bottomTabHeight: 0,
	})
}

/** Builds the shared shell navigation executor around the overlayable nav item hook. */
export function useSuperMobileShellNavigation(
	options: SuperMobileShellNavigationOptions,
): SuperMobileShellNavigationResult {
	const { isSidebarOpen, setIsSidebarOpen, runAfterSidebarCloseFrame } = options
	const navigate = useNavigate({
		fallbackRoute: { name: RouteName.MobileHome },
	})
	const resolvedNavItems = useSuperMobileShellNavItems()

	const navItems = useMemo<MobileShellMenuNavItem[]>(
		() =>
			resolvedNavItems.map(({ key, icon, label }) => ({
				key,
				icon,
				label,
			})),
		[resolvedNavItems],
	)

	const navigateWithoutViewTransition = useCallback(
		(name: RouteName) => {
			// Sidebar close already animates the shell; page View Transition snapshots stack old/new shells and cause multi-shell flicker.
			const navigateToRoute = () => navigate({ name, viewTransition: false })
			if (isSidebarOpen) {
				runAfterSidebarCloseFrame(navigateToRoute)
				return
			}
			navigateToRoute()
		},
		[isSidebarOpen, navigate, runAfterSidebarCloseFrame],
	)

	/** Routes resolved menu keys through shared shell behavior while item config stays overlayable. */
	const onNavigate = useCallback(
		(key: string) => {
			setIsSidebarOpen(false)
			const targetItem = resolvedNavItems.find((item) => item.key === key)

			if (targetItem?.nativeRecordingTab && isMagicApp) {
				openNativeRecordingPage(targetItem.nativeRecordingTab)
				return
			}

			navigateWithoutViewTransition(targetItem?.routeName ?? RouteName.MobileHome)
		},
		[navigateWithoutViewTransition, resolvedNavItems, setIsSidebarOpen],
	)

	/** Keeps brand navigation aligned with the same sidebar-close timing as menu item navigation. */
	const onGoHome = useCallback(() => {
		setIsSidebarOpen(false)
		navigateWithoutViewTransition(RouteName.MobileHome)
	}, [navigateWithoutViewTransition, setIsSidebarOpen])

	return {
		navItems,
		onNavigate,
		onGoHome,
	}
}
