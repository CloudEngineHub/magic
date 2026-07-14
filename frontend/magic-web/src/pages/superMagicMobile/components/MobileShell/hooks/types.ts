import type { Dispatch, SetStateAction } from "react"

import type { FUNCTION_PERMISSION_CODE } from "@/apis/modules/function-permission"
import type { RouteName } from "@/routes/constants"
import type { MobileShellMenuContextValue, MobileShellMenuNavItem } from "../MobileShellMenuContext"

export type SuperMobileShellNativeRecordingTab = "ai_recording"
type SuperMobileShellSupportedPermissionCode = typeof FUNCTION_PERMISSION_CODE.MagicClawAccess

export interface SuperMobileShellNavConfigItem {
	/** Stable menu key shared by UI test ids, grouping, and route lookup. */
	key: string
	/** Icon rendered by the shared mobile shell sidebar. */
	icon: MobileShellMenuNavItem["icon"]
	/** Translation key resolved by the nav item hook so overlays can swap labels declaratively. */
	labelKey: string
	/** Route used by the default navigation executor when no native action applies. */
	routeName: RouteName
	/** Optional Magic App native recording tab override for recording-style menu entries. */
	nativeRecordingTab?: SuperMobileShellNativeRecordingTab
	/** Optional function permission required before the menu item can be shown. */
	requiredPermissionCode?: SuperMobileShellSupportedPermissionCode
}

export interface SuperMobileShellResolvedNavItem extends MobileShellMenuNavItem {
	/** Route metadata consumed by the default shell navigation executor. */
	routeName: RouteName
	/** Optional Magic App native recording tab override for recording-style menu entries. */
	nativeRecordingTab?: SuperMobileShellNativeRecordingTab
}

export interface SuperMobileShellNavigationOptions {
	/** Current shell view, reserved for edition-specific navigation strategies. */
	activeView: string
	/** Current sidebar state lets navigation defer route changes until close animation starts. */
	isSidebarOpen: boolean
	/** Shared sidebar setter keeps menu clicks and brand clicks consistent with the shell. */
	setIsSidebarOpen: Dispatch<SetStateAction<boolean>>
	/** Runs route changes after the close animation has committed its first paint. */
	runAfterSidebarCloseFrame: (action: () => void) => void
}

export type SuperMobileShellNavigationResult = Pick<
	MobileShellMenuContextValue,
	"navItems" | "onNavigate" | "onGoHome"
>
