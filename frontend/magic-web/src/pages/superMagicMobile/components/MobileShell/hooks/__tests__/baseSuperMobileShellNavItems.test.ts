import { describe, expect, it } from "vitest"

import { RouteName } from "@/routes/constants"
import { BASE_SUPER_MOBILE_SHELL_NAV_ITEMS } from "../baseSuperMobileShellNavItems"

describe("BASE_SUPER_MOBILE_SHELL_NAV_ITEMS", () => {
	it("includes the micro apps entry on mobile", () => {
		expect(BASE_SUPER_MOBILE_SHELL_NAV_ITEMS).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					key: "microApps",
					labelKey: "mobile.shell.navMicroApps",
					routeName: RouteName.MicroApps,
				}),
			]),
		)
	})
})
