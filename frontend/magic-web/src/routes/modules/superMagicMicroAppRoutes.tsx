import { lazy } from "react"
import type { RouteObject } from "react-router"
import { RoutePath } from "@/constants/routes"
import { RouteName } from "@/routes/constants"

const MicroAppsPage = lazy(() => import("@/pages/superMagic/pages/MicroAppsPage"))
const MicroAppPage = lazy(() => import("@/pages/superMagic/lazy/MicroAppPage"))
const MicroAppSharePage = lazy(() => import("@/pages/share/microApp"))

export const superMagicMicroAppRoutes: RouteObject[] = [
	{
		name: RouteName.MicroApps,
		path: `/:clusterCode${RoutePath.MicroApps}`,
		element: <MicroAppsPage />,
		meta: {
			title: "routes.application",
		},
	},
	{
		name: RouteName.MicroAppsList,
		path: `/:clusterCode${RoutePath.MicroAppsList}`,
		element: <MicroAppsPage mobileView="list" />,
		meta: {
			title: "routes.application",
		},
	},
	{
		name: RouteName.MicroApp,
		path: `/:clusterCode${RoutePath.MicroApp}`,
		element: <MicroAppPage />,
	},
]

export const microAppPublicRoutes: RouteObject[] = [
	{
		name: RouteName.MicroAppShare,
		path: RoutePath.MicroAppShare,
		element: <MicroAppSharePage />,
	},
]
