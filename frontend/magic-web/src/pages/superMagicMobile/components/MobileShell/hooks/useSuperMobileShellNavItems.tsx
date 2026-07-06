import { useMemo } from "react"
import { useTranslation } from "react-i18next"

import { hasOrganizationAppsShortcuts } from "@/layouts/BaseLayoutMobile/components/MobileTabBar/constants/tabsConfig.shared"
import { userStore } from "@/models/user"

import { BASE_SUPER_MOBILE_SHELL_NAV_ITEMS } from "./baseSuperMobileShellNavItems"
import type { SuperMobileShellResolvedNavItem } from "./types"

/** Resolves default shell nav config into UI-ready items while keeping this as the smallest overlay point. */
export function useSuperMobileShellNavItems(): SuperMobileShellResolvedNavItem[] {
	const { t } = useTranslation("super")
	const shouldShowAppsEntry = hasOrganizationAppsShortcuts({
		isPersonalOrganization: userStore.user.isPersonalOrganization,
	})

	return useMemo<SuperMobileShellResolvedNavItem[]>(() => {
		return BASE_SUPER_MOBILE_SHELL_NAV_ITEMS.filter(
			(item) => item.key !== "apps" || shouldShowAppsEntry,
		).map(({ labelKey, ...item }) => ({
			...item,
			// Config-driven overlay items need variable label keys; keep keys static in config modules.
			label: t(labelKey),
		}))
	}, [shouldShowAppsEntry, t])
}
