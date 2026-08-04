import { describe, expect, it } from "vitest"
import { RoutePath } from "@/constants/routes"
import { RouteName } from "@/routes/constants"
import { microAppPublicRoutes, superMagicMicroAppRoutes } from "../superMagicMicroAppRoutes"

describe("superMagicMicroAppRoutes", () => {
	it("registers workspace micro app routes", () => {
		const listRoute = superMagicMicroAppRoutes.find((item) => item.name === RouteName.MicroApps)
		const mobileListRoute = superMagicMicroAppRoutes.find(
			(item) => item.name === RouteName.MicroAppsList,
		)
		const detailRoute = superMagicMicroAppRoutes.find(
			(item) => item.name === RouteName.MicroApp,
		)

		expect(RoutePath.MicroApps).toBe("/super/micro-apps")
		expect(RoutePath.MicroAppsList).toBe("/super/micro-apps/list")
		expect(RoutePath.MicroApp).toBe("/super/micro-app/:appId")
		expect(listRoute?.path).toBe("/:clusterCode/super/micro-apps")
		expect(mobileListRoute?.path).toBe("/:clusterCode/super/micro-apps/list")
		expect(detailRoute?.path).toBe("/:clusterCode/super/micro-app/:appId")
	})

	it("registers public micro app share route", () => {
		const shareRoute = microAppPublicRoutes.find(
			(item) => item.name === RouteName.MicroAppShare,
		)

		expect(RoutePath.MicroAppShare).toBe("/micro-app/:appId")
		expect(shareRoute?.path).toBe("/micro-app/:appId")
	})
})
