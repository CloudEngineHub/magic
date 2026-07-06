import { renderHook } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { RouteName } from "@/routes/constants"
import { useSuperMobileShellNavItems } from "../useSuperMobileShellNavItems"

const { userStoreMock } = vi.hoisted(() => ({
	userStoreMock: {
		user: {
			isPersonalOrganization: false,
		},
	},
}))

vi.mock("@/models/user", () => ({
	userStore: userStoreMock,
}))

vi.mock("@/layouts/BaseLayoutMobile/components/MobileTabBar/constants/tabsConfig.shared", () => ({
	hasOrganizationAppsShortcuts: ({
		isPersonalOrganization,
	}: {
		isPersonalOrganization: boolean
	}) => !isPersonalOrganization,
}))

vi.mock("react-i18next", async (importOriginal) => {
	const actual = await importOriginal<typeof import("react-i18next")>()

	return {
		...actual,
		useTranslation: () => ({
			t: (key: string) => `label:${key}`,
		}),
	}
})

vi.mock("@/pages/superMagicMobile/components/icons/MagiClawNavIcon", () => ({
	MagiClawNavIcon: () => null,
}))

describe("useSuperMobileShellNavItems", () => {
	beforeEach(() => {
		userStoreMock.user.isPersonalOrganization = false
	})

	it("resolves default shell nav config into localized menu items", () => {
		const { result } = renderHook(() => useSuperMobileShellNavItems())

		expect(
			result.current.map(({ key, label, routeName, nativeRecordingTab }) => ({
				key,
				label,
				routeName,
				nativeRecordingTab,
			})),
		).toEqual([
			{
				key: "home",
				label: "label:mobile.shell.navSuper",
				routeName: RouteName.MobileHome,
				nativeRecordingTab: undefined,
			},
			{
				key: "chats",
				label: "label:mobile.shell.navChats",
				routeName: RouteName.SuperChatsList,
				nativeRecordingTab: undefined,
			},
			{
				key: "workspaces",
				label: "label:mobile.shell.navWorkspaces",
				routeName: RouteName.SuperWorkspacesList,
				nativeRecordingTab: undefined,
			},
			{
				key: "recording",
				label: "label:mobile.shell.navRecording",
				routeName: RouteName.AudioRecordings,
				nativeRecordingTab: "ai_recording",
			},
			{
				key: "myCrew",
				label: "label:mobile.shell.navMyCrew",
				routeName: RouteName.MyCrew,
				nativeRecordingTab: undefined,
			},
			{
				key: "magiClaw",
				label: "label:mobile.shell.navMagiClaw",
				routeName: RouteName.MagiClaw,
				nativeRecordingTab: undefined,
			},
			{
				key: "apps",
				label: "label:mobile.shell.navApps",
				routeName: RouteName.SuperApps,
				nativeRecordingTab: undefined,
			},
			{
				key: "trash",
				label: "label:mobile.shell.navTrash",
				routeName: RouteName.RecycleBin,
				nativeRecordingTab: undefined,
			},
		])
	})

	it("hides apps entry when organization shortcuts are unavailable", () => {
		userStoreMock.user.isPersonalOrganization = true

		const { result } = renderHook(() => useSuperMobileShellNavItems())

		expect(result.current.map(({ key }) => key)).not.toContain("apps")
	})
})
