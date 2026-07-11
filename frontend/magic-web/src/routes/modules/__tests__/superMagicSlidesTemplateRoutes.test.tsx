import { describe, expect, it, vi } from "vitest"
import type { RouteObject } from "react-router"
import { RoutePath } from "@/constants/routes"
import { RouteName } from "@/routes/constants"
import { getRoutePath } from "@/routes/history/helpers"
import { registerRoutes } from "@/routes/routes"
import { superMagicSlidesTemplateRoutes } from "../superMagicSlidesTemplateRoutes"

vi.mock("antd", async (importOriginal) => {
	const actual = await importOriginal<typeof import("antd")>()
	const fallbackDatePicker = Object.assign(() => null, {
		RangePicker: () => null,
		MonthPicker: () => null,
		YearPicker: () => null,
		WeekPicker: () => null,
	})

	return {
		...actual,
		DatePicker: actual.DatePicker ?? fallbackDatePicker,
	}
})

function findRouteByName(routes: RouteObject[], routeName: RouteName): RouteObject | undefined {
	for (const route of routes) {
		if (route.name === routeName) return route
		const matchedRoute = route.children ? findRouteByName(route.children, routeName) : undefined
		if (matchedRoute) return matchedRoute
	}

	return undefined
}

describe("superMagicSlidesTemplateRoutes", () => {
	it("registers the PPT template route before dynamic project routes can match it", () => {
		const route = superMagicSlidesTemplateRoutes.find(
			(item) => item.name === RouteName.SuperSlidesTemplates,
		)

		expect(RoutePath.SuperSlidesTemplates).toBe("/super/slides-templates")
		expect(route?.path).toBe("/:clusterCode/super/slides-templates")
		expect((route as { meta?: { title?: string } } | undefined)?.meta?.title).toBe(
			"routes.slidesTemplates",
		)
	})

	it("builds the PPT template route path", () => {
		expect(
			getRoutePath({
				name: RouteName.SuperSlidesTemplates,
				params: { clusterCode: "global" },
			}),
		).toBe("/global/super/slides-templates")
	})

	it("places the PPT template route before dynamic project routes", () => {
		const superRoute = findRouteByName(registerRoutes(), RouteName.Super)
		const childNames = superRoute?.children?.map((route) => route.name)

		expect(childNames?.indexOf(RouteName.SuperSlidesTemplates)).toBeGreaterThanOrEqual(0)
		expect(childNames?.indexOf(RouteName.SuperSlidesTemplates)).toBeLessThan(
			childNames?.indexOf(RouteName.SuperWorkspaceProjectState) ?? -1,
		)
	})
})
