import { renderHook } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import useUserMenu from "../useUserMenu"

const { mockIsMagicApp } = vi.hoisted(() => ({
	mockIsMagicApp: vi.fn(),
}))

vi.mock("react-i18next", () => ({
	useTranslation: () => ({
		t: (key: string) => key,
	}),
}))

vi.mock("../useLanguageOptions", () => ({
	__esModule: true,
	default: () => ({
		languageOptions: [],
		languageLabel: "ZH",
	}),
}))

vi.mock("@/models/user", () => ({
	userStore: {
		user: {
			isAdmin: false,
			isPersonalOrganization: false,
		},
	},
}))

vi.mock("@/utils/devices", () => ({
	get isMagicApp() {
		return mockIsMagicApp()
	},
}))

/**
 * 提取菜单 key，忽略 divider 等无 key 项，便于断言结构变化。
 */
function getMenuKeys(menu: Array<Record<string, unknown>>) {
	return menu.map((item) => item?.key).filter((key): key is string => typeof key === "string")
}

describe("useUserMenu", () => {
	beforeEach(() => {
		mockIsMagicApp.mockReset()
		mockIsMagicApp.mockReturnValue(false)
	})

	it("shows the download client entry outside Magic App", () => {
		const { result } = renderHook(() => useUserMenu({}))

		expect(getMenuKeys(result.current.menu as Array<Record<string, unknown>>)).toContain(
			"downloadClient",
		)
		expect(getMenuKeys(result.current.menu as Array<Record<string, unknown>>)).not.toContain(
			"aboutUs",
		)
	})

	it("replaces the download client entry with about us inside Magic App", () => {
		mockIsMagicApp.mockReturnValue(true)

		const { result } = renderHook(() => useUserMenu({}))

		expect(getMenuKeys(result.current.menu as Array<Record<string, unknown>>)).not.toContain(
			"downloadClient",
		)
		expect(getMenuKeys(result.current.menu as Array<Record<string, unknown>>)).toContain(
			"aboutUs",
		)
	})
})
