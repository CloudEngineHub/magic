import { describe, expect, it } from "vitest"

import { resolveEmbeddedShellState } from "../resolveEmbeddedShellState"

describe("resolveEmbeddedShellState", () => {
	it.each([
		["/demo/super/micro-apps", "mobile-micro-apps-page"],
		["/demo/super/micro-apps/list", "mobile-micro-apps-list-page"],
		["/demo/super/micro-app/project-1", "mobile-micro-app-detail-page"],
	])("uses the mobile shell without the legacy header for %s", (pathname, testIdPrefix) => {
		expect(resolveEmbeddedShellState(pathname)).toEqual({
			enabled: true,
			activeView: "microApps",
			testIdPrefix,
			showMainHeader: false,
		})
	})
})
