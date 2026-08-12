import { fireEvent, screen } from "@testing-library/react"
import { beforeEach, describe, expect, it } from "vitest"
import {
	getMicroAppSharePageMocks,
	renderPage,
	resetMicroAppSharePageMocks,
} from "./MicroAppSharePage.testUtils"

const mocks = getMicroAppSharePageMocks()

async function confirmSafetyNotice() {
	expect(await screen.findByTestId("micro-app-share-safety-notice")).toBeInTheDocument()
	fireEvent.click(screen.getByTestId("micro-app-share-safety-confirm"))
	return screen.findByTestId("mock-html-preview")
}

describe("MicroAppSharePage header", () => {
	beforeEach(resetMicroAppSharePageMocks)

	it("does not render workspace file chrome around the published micro app", async () => {
		renderPage()

		expect(await confirmSafetyNotice()).toBeInTheDocument()
		expect(screen.getByText("Demo App")).toBeInTheDocument()
		expect(screen.queryByTestId("mock-logo")).not.toBeInTheDocument()
		expect(screen.getByTestId("micro-app-share-login")).toBeInTheDocument()
	})

	it("shows signed-in user and organization in the published micro app header", async () => {
		mocks.authorization.current = "token-1"
		mocks.userInfo.current = {
			user_id: "usi_1",
			magic_id: "magic_1",
			nickname: "测试用户",
			real_name: "测试用户",
			avatar: "",
			status: 1,
			organization_code: "magic-org-1",
		}
		mocks.organizationMeta.current = {
			organizations: [
				{
					organization_code: "team-org-1",
					organization_name: "测试团队研发部",
				},
			],
			organizationCode: "magic-org-1",
			magicOrganizationMap: {
				"magic-org-1": {
					organization_name: "测试组织研发部",
				},
			},
			teamshareOrganizationCode: "team-org-1",
			organizationListReady: true,
		}

		renderPage()

		expect(await confirmSafetyNotice()).toBeInTheDocument()
		expect(screen.getByTestId("micro-app-share-user")).toHaveTextContent("测试用户")
		expect(screen.getAllByText("测试团队研发部").length).toBeGreaterThan(0)
		expect(screen.queryByTestId("micro-app-share-login")).not.toBeInTheDocument()
	})

	it("hides the access page header when fullscreen display is enabled", async () => {
		mocks.resolvePublishedMicroApp.mockResolvedValue({
			app_id: "app-1",
			resource_id: "resource-1",
			share_code: "resource-1",
			cover_url: "https://example.com/cover.webp",
			extra: { pure_mode: true },
		})

		renderPage()

		await confirmSafetyNotice()
		expect(screen.queryByTestId("micro-app-share-header")).not.toBeInTheDocument()
		expect(screen.getByTestId("micro-app-share-preview")).toBeInTheDocument()
	})

	it("does not reuse the previous app display mode while switching apps", async () => {
		let resolveSecondApp: (value: {
			app_id: string
			resource_id: string
			extra: { pure_mode: boolean }
		}) => void = () => undefined
		const secondAppResponse = new Promise<{
			app_id: string
			resource_id: string
			extra: { pure_mode: boolean }
		}>((resolve) => {
			resolveSecondApp = resolve
		})

		mocks.resolvePublishedMicroApp.mockImplementation((requestedAppId: string) => {
			if (requestedAppId === "app-1") {
				return Promise.resolve({
					app_id: "app-1",
					resource_id: "resource-1",
					extra: { pure_mode: true },
				})
			}
			return secondAppResponse
		})

		renderPage()
		await confirmSafetyNotice()
		expect(screen.queryByTestId("micro-app-share-header")).not.toBeInTheDocument()

		fireEvent.click(screen.getByTestId("navigate-to-second-micro-app"))
		expect(screen.queryByTestId("micro-app-share-header")).not.toBeInTheDocument()

		resolveSecondApp({
			app_id: "app-2",
			resource_id: "resource-2",
			extra: { pure_mode: false },
		})

		expect(await screen.findByTestId("micro-app-share-header")).toBeInTheDocument()
	})

	it("keeps the published app title read-only", async () => {
		mocks.authorization.current = "token-1"
		mocks.userInfo.current = {
			user_id: "usi_1",
			magic_id: "magic_1",
			nickname: "测试用户",
			real_name: "测试用户",
			avatar: "",
			status: 1,
			organization_code: "magic-org-1",
		}

		renderPage()

		expect(await confirmSafetyNotice()).toBeInTheDocument()
		expect(screen.queryByTestId("micro-app-share-edit-button")).not.toBeInTheDocument()
		expect(screen.getByText("Demo App")).toBeInTheDocument()
	})

	it("opens account menu with organization switch and logout actions", async () => {
		mocks.authorization.current = "token-1"
		mocks.userInfo.current = {
			user_id: "usi_1",
			magic_id: "magic_1",
			nickname: "测试用户",
			real_name: "测试用户",
			avatar: "",
			status: 1,
			organization_code: "magic-org-1",
		}
		mocks.organizationMeta.current = {
			organizations: [
				{
					organization_code: "team-org-1",
					organization_name: "测试团队研发部",
				},
			],
			organizationCode: "magic-org-1",
			magicOrganizationMap: {},
			teamshareOrganizationCode: "team-org-1",
			organizationListReady: true,
		}

		renderPage()

		await screen.findByTestId("micro-app-share-safety-notice")
		fireEvent.click(screen.getByTestId("mock-magic-dropdown-trigger"))

		expect(await screen.findByTestId("micro-app-share-user-menu")).toBeInTheDocument()
		expect(screen.getByTestId("micro-app-share-organization-trigger")).toHaveTextContent(
			"测试团队研发部",
		)
		expect(screen.getByTestId("micro-app-share-logout")).toBeInTheDocument()
		expect(screen.queryByTestId("mock-organization-list")).not.toBeInTheDocument()
		expect(screen.getByTestId("micro-app-share-user-menu").className).not.toContain("shadow-xl")
		screen.getAllByTestId("mock-magic-dropdown").forEach((dropdown) => {
			expect(dropdown.getAttribute("data-overlay-class-name")).toContain("!bg-transparent")
			expect(dropdown.getAttribute("data-overlay-class-name")).toContain("!border-0")
			expect(dropdown.getAttribute("data-overlay-class-name")).toContain("!shadow-none")
			expect(dropdown.getAttribute("data-overlay-class-name")).toContain(
				"data-[state=open]:!animate-none",
			)
		})

		fireEvent.click(screen.getByTestId("micro-app-share-organization-trigger"))

		expect(screen.getByTestId("mock-organization-list")).toBeInTheDocument()
	})

	it("opens the mobile organization switch instead of the desktop account menu", async () => {
		mocks.isMobile.current = true
		mocks.authorization.current = "token-1"
		mocks.userInfo.current = {
			user_id: "usi_1",
			magic_id: "magic_1",
			nickname: "测试用户",
			real_name: "测试用户",
			avatar: "",
			status: 1,
			organization_code: "magic-org-1",
		}

		renderPage()

		await screen.findByTestId("micro-app-share-safety-notice")
		fireEvent.click(screen.getByTestId("micro-app-share-user-trigger"))

		expect(mocks.openOrganizationSwitch).toHaveBeenCalledTimes(1)
		expect(screen.getByTestId("mock-mobile-organization-switch")).toBeInTheDocument()
		expect(screen.queryByTestId("micro-app-share-user-menu")).not.toBeInTheDocument()
	})
})
