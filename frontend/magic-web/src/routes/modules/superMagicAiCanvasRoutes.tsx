import { lazy } from "react"
import type { RouteObject } from "react-router"
import { RoutePath } from "@/constants/routes"
import { RouteName } from "@/routes/constants"

const AiCanvasPage = lazy(() => import("@/pages/superMagic/pages/AiCanvasPage"))

/**
 * AI canvas home. Its projects open in the normal project route; TopicPage switches to the
 * canvas-only layout by project_mode, so topic switching and shared links keep working.
 */
export const superMagicAiCanvasRoutes: RouteObject[] = [
	{
		name: RouteName.AiCanvas,
		path: `/:clusterCode${RoutePath.AiCanvas}`,
		element: <AiCanvasPage />,
		meta: {
			title: "routes.aiCanvas",
		},
	},
]
