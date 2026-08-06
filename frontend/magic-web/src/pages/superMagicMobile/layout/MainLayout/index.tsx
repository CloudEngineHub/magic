import { useCallback, useMemo } from "react"
import { Outlet, useLocation } from "react-router"
import { useTranslation } from "react-i18next"
import SuperMagicMobileLayout from "../../components/Layout"
import MainHeader from "./components/MainHeader"
import { useNavigate } from "@/routes/hooks/useNavigate"
import { SuperMobileShellRouteLayout } from "@/pages/superMagicMobile/components/MobileShell/SuperMobileShellRouteLayout"
import { resolveEmbeddedShellState } from "./resolveEmbeddedShellState"

/**
 * Mobile SuperMagic layout: header + child routes.
 * Default header back uses history.go(-1); child headers pass fallbackRoute via useNavigate when needed.
 */
export default function SuperMagicMobileMainLayout() {
	const navigate = useNavigate()
	const { pathname } = useLocation()
	const { t } = useTranslation("super")

	/** Default back: history first; useNavigate falls back to MobileHome when length is insufficient. */
	const onBackClick = useCallback(() => {
		navigate({ delta: -1, viewTransition: false })
	}, [navigate])

	const shellState = useMemo(() => resolveEmbeddedShellState(pathname), [pathname])
	const panel = (
		<SuperMagicMobileLayout
			header={
				shellState.showMainHeader ? <MainHeader onBackClick={onBackClick} /> : undefined
			}
		>
			<Outlet />
		</SuperMagicMobileLayout>
	)

	if (!shellState.enabled) {
		return panel
	}

	return (
		<SuperMobileShellRouteLayout
			activeView={shellState.activeView}
			testIdPrefix={shellState.testIdPrefix}
			closeSidebarAriaLabel={t("mobile.shell.closeSidebar")}
		>
			{panel}
		</SuperMobileShellRouteLayout>
	)
}
