import { lazy } from "react"
import type { RouteObject } from "react-router"
import { RoutePath } from "@/constants/routes"
import { DesktopOnlyRoute } from "@/routes/components/ViewportRouteGuard"
import { RouteName } from "@/routes/constants"

const SlidesTemplatesPage = lazy(() => import("@/pages/superMagic/pages/SlidesTemplates"))
const Navigate = lazy(() => import("@/routes/components/Navigate"))

export const superMagicSlidesTemplateRoutes = [
	{
		name: RouteName.SuperSlidesTemplates,
		path: `/:clusterCode${RoutePath.SuperSlidesTemplates}`,
		element: (
			<DesktopOnlyRoute>
				<SlidesTemplatesPage />
			</DesktopOnlyRoute>
		),
		meta: {
			title: "routes.slidesTemplates",
		},
	},
	{
		name: RouteName.SuperSlidesTemplatesLegacy,
		path: `/:clusterCode${RoutePath.SuperSlidesTemplatesLegacy}`,
		element: <Navigate name={RouteName.SuperSlidesTemplates} replace />,
	},
] as Array<RouteObject>
