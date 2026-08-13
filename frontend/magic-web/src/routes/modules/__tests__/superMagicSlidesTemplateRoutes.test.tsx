import { isValidElement } from "react"
import { describe, expect, it, vi } from "vitest"
import type { RouteObject } from "react-router"
import { RoutePath } from "@/constants/routes"
import { RouteName } from "@/routes/constants"
import { getRoutePath } from "@/routes/history/helpers"
import { registerRoutes } from "@/routes/routes"
import ProjectOrganizationAccessGuard from "@/pages/superMagic/components/ProjectOrganizationAccessGuard"
import { superMagicSlidesTemplateRoutes } from "../superMagicSlidesTemplateRoutes"

vi.mock("@/routes/modules/admin/routes", () => ({ default: [] }))

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
	it("registers the slide template route before dynamic project routes can match it", () => {
		const route = superMagicSlidesTemplateRoutes.find(
			(item) => item.name === RouteName.SuperSlidesTemplates,
		)

		expect(RoutePath.SuperSlidesTemplates).toBe("/super/slide-templates")
		expect(route?.path).toBe("/:clusterCode/super/slide-templates")
		expect((route as { meta?: { title?: string } } | undefined)?.meta?.title).toBe(
			"routes.slidesTemplates",
		)
	})

	it("builds the slide template route path", () => {
		expect(
			getRoutePath({
				name: RouteName.SuperSlidesTemplates,
				params: { clusterCode: "global" },
			}),
		).toBe("/global/super/slide-templates")
	})

	it("redirects the legacy plural slide path", () => {
		const legacyRoute = superMagicSlidesTemplateRoutes.find(
			(item) => item.name === RouteName.SuperSlidesTemplatesLegacy,
		)

		expect(RoutePath.SuperSlidesTemplatesLegacy).toBe("/super/slides-templates")
		expect(legacyRoute?.path).toBe("/:clusterCode/super/slides-templates")
	})

	it("keeps guarded project routes inside the persistent Super layout", () => {
		const routes = registerRoutes()
		const superRoute = findRouteByName(routes, RouteName.Super)
		const projectRoute = findRouteByName(routes, RouteName.SuperWorkspaceProjectState)
		const topicRoute = findRouteByName(routes, RouteName.SuperWorkspaceProjectTopicState)
		const childNames = superRoute?.children?.map((route) => route.name)

		expect(childNames).toContain(RouteName.SuperSlidesTemplates)
		expect(childNames).toContain(RouteName.SuperWorkspaceProjectState)
		expect(childNames).toContain(RouteName.SuperWorkspaceProjectTopicState)
		expect(isValidElement(projectRoute?.element)).toBe(true)
		expect(isValidElement(topicRoute?.element)).toBe(true)
		expect((projectRoute?.element as { type?: unknown }).type).toBe(
			ProjectOrganizationAccessGuard,
		)
		expect((topicRoute?.element as { type?: unknown }).type).toBe(
			ProjectOrganizationAccessGuard,
		)
		expect(projectRoute?.children).toBeUndefined()
		expect(topicRoute?.children).toBeUndefined()
	})
})
