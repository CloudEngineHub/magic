import { useEffect } from "react"
import { useLocation, useNavigate } from "react-router"
import { observer } from "mobx-react-lite"
import { RoutePath } from "@/constants/routes"
import { shouldForceSiteClose } from "@/constants/maintenance"
import { globalConfigStore } from "@/stores/globalConfig"
import { history } from "@/routes/history"
import { getHomeURL } from "@/utils/redirect"

function MaintenanceGuard() {
	const location = useLocation()
	const navigate = useNavigate()
	const { maintenanceConfig, maintenanceConfigReady } = globalConfigStore
	const isFrontendPath =
		!location.pathname.startsWith("/admin") &&
		!location.pathname.startsWith("/api") &&
		!location.pathname.startsWith("/platform")

	useEffect(() => {
		if (!isFrontendPath || !maintenanceConfigReady) return

		const isSiteClose = shouldForceSiteClose(maintenanceConfig)

		if (isSiteClose && location.pathname !== RoutePath.Maintenance) {
			navigate(RoutePath.Maintenance, { replace: true })
			return
		}

		if (!isSiteClose && location.pathname === RoutePath.Maintenance) {
			void getHomeURL().then((homeURL) => {
				history.replace(homeURL)
			})
		}
	}, [isFrontendPath, location.pathname, maintenanceConfig, maintenanceConfigReady, navigate])

	return null
}

export default observer(MaintenanceGuard)
