import { fireEvent, screen, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { RoutePath } from "@/constants/routes"
import { whiteListRoutes } from "@/routes/const/whiteRoutes"
import {
	getMicroAppSharePageMocks,
	renderPage,
	resetMicroAppSharePageMocks,
} from "./MicroAppSharePage.testUtils"

const mocks = getMicroAppSharePageMocks()

async function confirmSafetyNotice() {
	expect(await screen.findByTestId("micro-app-share-safety-notice")).toBeInTheDocument()
	expect(screen.queryByTestId("mock-html-preview")).not.toBeInTheDocument()
	fireEvent.click(screen.getByTestId("micro-app-share-safety-confirm"))
	return screen.findByTestId("mock-html-preview")
}

describe("MicroAppSharePage", () => {
	beforeEach(resetMicroAppSharePageMocks)

	it("registers the standalone micro app route as public", () => {
		expect(RoutePath.MicroAppShare).toBe("/micro-app/:appId")
		expect(whiteListRoutes).toContain("/micro-app/*")
	})

	it("waits for safety confirmation before rendering the root html entry", async () => {
		renderPage()

		await waitFor(() => {
			expect(mocks.resolvePublishedMicroApp).toHaveBeenCalledWith("app-1")
			expect(mocks.getShareResource).toHaveBeenCalledWith({
				resource_id: "resource-1",
				password: undefined,
			})
			expect(mocks.getShareResourceFiles).toHaveBeenCalledWith({
				resource_id: "resource-1",
				password: undefined,
			})
		})

		expect(await screen.findByTestId("micro-app-share-safety-notice")).toHaveTextContent(
			"Demo App",
		)
		expect(screen.getByTestId("micro-app-share-cover")).toHaveAttribute(
			"src",
			"https://example.com/cover.webp",
		)
		expect(screen.getByText("microAppShare.safetySensitiveData")).toBeInTheDocument()
		expect(screen.queryByTestId("mock-html-preview")).not.toBeInTheDocument()

		fireEvent.click(screen.getByTestId("micro-app-share-safety-confirm"))

		expect(await screen.findByTestId("mock-html-preview")).toHaveTextContent("index.html")
		expect(screen.queryByTestId("micro-app-share-safety-notice")).not.toBeInTheDocument()
	})

	it("hides a cover image that fails to load", async () => {
		renderPage()

		const cover = await screen.findByTestId("micro-app-share-cover")
		fireEvent.error(cover)

		expect(screen.queryByTestId("micro-app-share-cover")).not.toBeInTheDocument()
	})

	it("does not render an empty cover placeholder when no cover is published", async () => {
		mocks.resolvePublishedMicroApp.mockResolvedValue({
			app_id: "app-1",
			resource_id: "resource-1",
			share_code: "resource-1",
		})

		renderPage()

		expect(await screen.findByTestId("micro-app-share-safety-notice")).toBeInTheDocument()
		expect(screen.queryByTestId("micro-app-share-cover")).not.toBeInTheDocument()
	})

	it("sets the share context before loading app.json", async () => {
		mocks.getTemporaryDownloadUrl.mockImplementation(async () => {
			expect(window.temporary_token).toBe("token-1")
			expect(window.project_id).toBe("project-1")
			return [{ url: "https://example.com/app.json" }]
		})

		renderPage()

		expect(await screen.findByTestId("micro-app-share-safety-notice")).toBeInTheDocument()
	})

	it("replaces the current preview across repeated html navigation", async () => {
		mocks.getShareResourceFiles.mockResolvedValue({
			tree: [
				{
					file_id: "app-json-1",
					file_name: "app.json",
					file_extension: "json",
					relative_file_path: "app.json",
				},
				{
					file_id: "file-1",
					file_name: "index.html",
					file_extension: "html",
					relative_file_path: "index.html",
				},
				{
					file_id: "file-2",
					file_name: "admin.html",
					file_extension: "html",
					relative_file_path: "admin.html",
				},
			],
			list: [
				{
					file_id: "app-json-1",
					file_name: "app.json",
					file_extension: "json",
					relative_file_path: "app.json",
				},
				{
					file_id: "file-1",
					file_name: "index.html",
					file_extension: "html",
					relative_file_path: "index.html",
				},
				{
					file_id: "file-2",
					file_name: "admin.html",
					file_extension: "html",
					relative_file_path: "admin.html",
				},
			],
		})

		renderPage()

		expect(await confirmSafetyNotice()).toHaveTextContent("index.html")
		expect(screen.getByTestId("mock-mounted-file-id")).toHaveTextContent("file-1")
		expect(screen.getByTestId("mock-html-preview")).toHaveAttribute(
			"data-virtual-storage-marker-id",
			"file-1",
		)

		fireEvent.click(screen.getByRole("button", { name: "navigate-admin" }))

		expect(screen.getByTestId("mock-html-preview")).toHaveTextContent("admin.html")
		expect(screen.getByTestId("mock-mounted-file-id")).toHaveTextContent("file-2")
		expect(screen.getByTestId("mock-html-preview")).toHaveAttribute(
			"data-virtual-storage-marker-id",
			"file-1",
		)

		fireEvent.click(screen.getByRole("button", { name: "navigate-index" }))

		expect(screen.getByTestId("mock-html-preview")).toHaveTextContent("index.html")
		expect(screen.getByTestId("mock-mounted-file-id")).toHaveTextContent("file-1")
	})

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

	it("shows empty state when published files do not contain a root html entry", async () => {
		mocks.getShareResourceFiles.mockResolvedValue({
			tree: [
				{
					file_id: "app-json-1",
					file_name: "app.json",
					file_extension: "json",
					relative_file_path: "app.json",
				},
				{
					file_id: "file-1",
					file_name: "readme.md",
					file_extension: "md",
					relative_file_path: "readme.md",
				},
			],
			list: [
				{
					file_id: "app-json-1",
					file_name: "app.json",
					file_extension: "json",
					relative_file_path: "app.json",
				},
				{
					file_id: "file-1",
					file_name: "readme.md",
					file_extension: "md",
					relative_file_path: "readme.md",
				},
			],
		})

		renderPage()

		expect(await screen.findByTestId("micro-app-share-empty")).toBeInTheDocument()
	})

	it("uses the micro app permission illustration when the share is unavailable", async () => {
		mocks.resolvePublishedMicroApp.mockRejectedValue(new Error("share unavailable"))

		renderPage()

		expect(await screen.findByTestId("mock-error-display")).toHaveTextContent(
			"microAppShare.errorTitle",
		)
		expect(screen.getByTestId("micro-app-share-error-illustration")).toHaveAttribute(
			"data-state",
			"permission",
		)
	})

	it("uses password query when the resource requires password", async () => {
		mocks.checkShareResourcePassword.mockResolvedValue({ has_password: true })

		renderPage("/micro-app/app-1?password=abcd1234")

		await waitFor(() => {
			expect(mocks.getShareResource).toHaveBeenCalledWith({
				resource_id: "resource-1",
				password: "abcd1234",
			})
		})
		expect(await screen.findByTestId("micro-app-share-safety-notice")).toBeInTheDocument()
		expect(screen.queryByTestId("mock-html-preview")).not.toBeInTheDocument()
	})

	it("requires a new confirmation after switching to another shared app", async () => {
		renderPage()
		await confirmSafetyNotice()

		fireEvent.click(screen.getByTestId("navigate-to-second-micro-app"))

		await waitFor(() => {
			expect(mocks.resolvePublishedMicroApp).toHaveBeenCalledWith("app-2")
			expect(mocks.getShareResource).toHaveBeenCalledTimes(2)
		})
		expect(await screen.findByTestId("micro-app-share-safety-notice")).toBeInTheDocument()
		expect(screen.queryByTestId("mock-html-preview")).not.toBeInTheDocument()
	})

	it("ignores a stale file response after switching shared apps", async () => {
		let resolveFirstFiles: (value: {
			tree: Array<Record<string, string>>
			list: Array<Record<string, string>>
		}) => void = () => undefined
		const firstFiles = new Promise<{
			tree: Array<Record<string, string>>
			list: Array<Record<string, string>>
		}>((resolve) => {
			resolveFirstFiles = resolve
		})
		const buildFiles = (suffix: string) => ({
			tree: [
				{
					file_id: `app-json-${suffix}`,
					file_name: "app.json",
					file_extension: "json",
					relative_file_path: "app.json",
				},
				{
					file_id: `file-${suffix}`,
					file_name: "index.html",
					file_extension: "html",
					relative_file_path: "index.html",
				},
			],
			list: [
				{
					file_id: `app-json-${suffix}`,
					file_name: "app.json",
					file_extension: "json",
					relative_file_path: "app.json",
				},
				{
					file_id: `file-${suffix}`,
					file_name: "index.html",
					file_extension: "html",
					relative_file_path: "index.html",
				},
			],
		})

		mocks.resolvePublishedMicroApp.mockImplementation(async (requestedAppId: string) => ({
			app_id: requestedAppId,
			resource_id: `resource-${requestedAppId}`,
		}))
		mocks.getShareResource.mockImplementation(
			async ({ resource_id }: { resource_id: string }) => ({
				temporary_token: `token-${resource_id}`,
				data: {
					project_id: `project-${resource_id}`,
					project_name: resource_id,
				},
			}),
		)
		mocks.getShareResourceFiles.mockImplementation(
			({ resource_id }: { resource_id: string }) =>
				resource_id === "resource-app-1"
					? firstFiles
					: Promise.resolve(buildFiles("app-2")),
		)

		renderPage()
		await waitFor(() => {
			expect(mocks.getShareResourceFiles).toHaveBeenCalledWith({
				resource_id: "resource-app-1",
				password: undefined,
			})
		})

		fireEvent.click(screen.getByTestId("navigate-to-second-micro-app"))
		expect(await confirmSafetyNotice()).toHaveAttribute(
			"data-virtual-storage-marker-id",
			"file-app-2",
		)

		resolveFirstFiles(buildFiles("app-1"))

		await waitFor(() => {
			expect(screen.getByTestId("mock-mounted-file-id")).toHaveTextContent("file-app-2")
		})
	})

	it("redirects to login when app.json does not allow anonymous access", async () => {
		vi.mocked(fetch).mockResolvedValueOnce({
			ok: true,
			json: vi.fn().mockResolvedValue({ type: "micro-app", anonymous: false }),
		} as unknown as Response)

		renderPage()

		await waitFor(() => {
			expect(mocks.historyReplace).toHaveBeenCalledWith(
				expect.objectContaining({ name: "Login" }),
			)
		})
		expect(screen.queryByTestId("mock-html-preview")).not.toBeInTheDocument()
	})
})
