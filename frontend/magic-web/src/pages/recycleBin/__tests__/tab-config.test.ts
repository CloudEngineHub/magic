import { renderHook } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import {
	RECYCLE_BIN_RESOURCE_TYPE_TO_TAB_ID,
	createRecycleBinTabCounts,
	getRecycleBinTabs,
	useRecycleBinTabLabel,
} from "../tab-config"

vi.mock("@/routes/history", () => ({
	baseHistory: { replace: vi.fn() },
}))

vi.mock("react-i18next", () => ({
	useTranslation: () => ({
		t: (key: string, options?: { count?: number }) => `${key}:${options?.count ?? 0}`,
	}),
}))

describe("recycle bin micro app tab", () => {
	it("maps resource type 5 to the desktop and mobile tab configuration", () => {
		const counts = createRecycleBinTabCounts()
		counts.microApps = 2
		const { result: pcLabel } = renderHook(() => useRecycleBinTabLabel("pc"))
		const { result: mobileLabel } = renderHook(() => useRecycleBinTabLabel("mobile"))

		expect(RECYCLE_BIN_RESOURCE_TYPE_TO_TAB_ID[5]).toBe("microApps")
		expect(getRecycleBinTabs({ counts })).toContainEqual({
			id: "microApps",
			count: 2,
		})
		expect(pcLabel.current("microApps", 2)).toBe("recycleBin.tabs.microApps:2")
		expect(mobileLabel.current("microApps", 2)).toBe("mobile.recycleBin.tabs.microApps:2")
	})
})
