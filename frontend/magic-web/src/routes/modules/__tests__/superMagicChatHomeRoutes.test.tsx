import { describe, expect, it, vi } from "vitest"
import { getRoutePath, routesMatch } from "@/routes/history/helpers"
import { RouteName } from "@/routes/constants"

vi.mock("@/routes/modules/admin/routes", () => ({ default: [] }))
vi.mock("@dtyq/magic-admin-v2", () => ({ createRouteObjects: () => [], RuntimeMode: {} }))
vi.mock("antd", async (importOriginal) => {
	const actual = await importOriginal<typeof import("antd")>()
	const fallbackDatePicker = Object.assign(() => null, {
		RangePicker: () => null,
		MonthPicker: () => null,
		YearPicker: () => null,
		WeekPicker: () => null,
	})
	return { ...actual, DatePicker: actual.DatePicker ?? fallbackDatePicker }
})

describe("desktop chat home routes", () => {
	it("builds a directly addressable blank composer URL", () => {
		expect(
			getRoutePath({ name: RouteName.SuperChatHome, params: { clusterCode: "global" } }),
		).toBe("/global/super/chat")
	})

	it.each([
		["/global/super/chat", RouteName.SuperChatHome],
		["/global/super/chat/", RouteName.SuperChatHome],
		["/global/super/chats", RouteName.SuperChatsList],
		["/global/super/chat/project-1", RouteName.SuperChatProjectState],
		["/global/super/chat/project-1/topic-1", RouteName.SuperChatProjectState],
		["/global/super/workspace/workspace-1", RouteName.SuperWorkspaceState],
		["/global/super/slide-templates", RouteName.SuperSlidesTemplates],
	])("matches %s without confusing home, list and detail routes", (pathname, name) => {
		expect(routesMatch(pathname)?.route.name).toBe(name)
	})
})
