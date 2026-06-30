import { describe, expect, it } from "vitest"
import { RoutePath } from "@/constants/routes"
import { RouteName } from "@/routes/constants"
import { superMagicCrewRoutes } from "../superMagicCrewRoutes"

describe("superMagicCrewRoutes", () => {
	it("registers the crew conversation route", () => {
		const route = superMagicCrewRoutes.find((item) => item.name === RouteName.CrewConversation)

		expect(RoutePath.CrewConversation).toBe("/super/crew/:code")
		expect(route?.path).toBe("/:clusterCode/super/crew/:code")
	})
})
