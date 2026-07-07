import { describe, expect, it } from "vitest"
import { RoutePath } from "@/constants/routes"
import { RouteName } from "@/routes/constants"
import { microAppPublicRoutes, superMagicMicroAppRoutes } from "../superMagicMicroAppRoutes"

describe("superMagicMicroAppRoutes", () => {
	it("registers workspace micro app routes", () => {
		const listRoute = superMagicMicroAppRoutes.find((item) => item.name === RouteName.MicroApps)
		const detailRoute = superMagicMicroAppRoutes.find((item) => item.name === RouteName.MicroApp)

		expect(RoutePath.MicroApps).toBe("/super/micro-apps")
		expect(RoutePath.MicroApp).toBe("/super/micro-app/:projectId")
		expect(listRoute?.path).toBe("/:clusterCode/super/micro-apps")
		expect(detailRoute?.path).toBe("/:clusterCode/super/micro-app/:projectId")
	})

	it("registers public micro app share route", () => {
		const shareRoute = microAppPublicRoutes.find((item) => item.name === RouteName.MicroAppShare)

		expect(RoutePath.MicroAppShare).toBe("/micro-app/:resourceId")
		expect(shareRoute?.path).toBe("/micro-app/:resourceId")
	})
})
