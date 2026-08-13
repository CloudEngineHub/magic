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

	it("remembers the safety confirmation for the current micro app when selected", async () => {
		const firstRender = renderPage()

		const doNotRemind = await screen.findByRole("checkbox", {
			name: "microAppShare.safetyDoNotRemind",
		})
		expect(doNotRemind).not.toBeChecked()

		fireEvent.click(doNotRemind)
		fireEvent.click(screen.getByTestId("micro-app-share-safety-confirm"))
		expect(await screen.findByTestId("mock-html-preview")).toBeInTheDocument()

		firstRender.unmount()
		renderPage()

		expect(await screen.findByTestId("mock-html-preview")).toBeInTheDocument()
		expect(screen.queryByTestId("micro-app-share-safety-notice")).not.toBeInTheDocument()
	})

	it("shows the safety reminder again when the checkbox is not selected", async () => {
		const firstRender = renderPage()

		await confirmSafetyNotice()
		firstRender.unmount()
		renderPage()

		expect(await screen.findByTestId("micro-app-share-safety-notice")).toBeInTheDocument()
		expect(screen.queryByTestId("mock-html-preview")).not.toBeInTheDocument()
	})

	it("keeps the safety reminder scoped to the confirmed micro app", async () => {
		renderPage()

		fireEvent.click(
			await screen.findByRole("checkbox", {
				name: "microAppShare.safetyDoNotRemind",
			}),
		)
		fireEvent.click(screen.getByTestId("micro-app-share-safety-confirm"))
		await screen.findByTestId("mock-html-preview")

		fireEvent.click(screen.getByTestId("navigate-to-second-micro-app"))

		expect(await screen.findByTestId("micro-app-share-safety-notice")).toBeInTheDocument()
		expect(screen.queryByTestId("mock-html-preview")).not.toBeInTheDocument()
	})

	it("still confirms the current visit when browser storage is unavailable", async () => {
		const setItem = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
			throw new Error("storage unavailable")
		})

		try {
			renderPage()
			fireEvent.click(
				await screen.findByRole("checkbox", {
					name: "microAppShare.safetyDoNotRemind",
				}),
			)
			fireEvent.click(screen.getByTestId("micro-app-share-safety-confirm"))

			expect(await screen.findByTestId("mock-html-preview")).toBeInTheDocument()
		} finally {
			setItem.mockRestore()
		}
	})

	it("shows permission management beside the user only after access confirmation", async () => {
		mocks.authorization.current = "token-1"
		mocks.hasHtmlPermissionDeclarations.current = true
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

		expect(await screen.findByTestId("micro-app-share-safety-notice")).toBeInTheDocument()
		expect(screen.queryByTestId("micro-app-share-permission-manager")).not.toBeInTheDocument()

		fireEvent.click(screen.getByTestId("micro-app-share-safety-confirm"))

		const permissionManagerButton = await screen.findByTestId(
			"micro-app-share-permission-manager",
		)
		expect(permissionManagerButton).toHaveTextContent("htmlEditor.permissionManager.open")
		expect(permissionManagerButton.nextElementSibling).toBe(
			screen.getByTestId("micro-app-share-user"),
		)

		fireEvent.click(permissionManagerButton)

		expect(mocks.openHtmlPermissionManager).toHaveBeenCalledTimes(1)
	})

	it("does not show permission management when app.json has no permission declarations", async () => {
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

		await confirmSafetyNotice()

		expect(screen.queryByTestId("micro-app-share-permission-manager")).not.toBeInTheDocument()
	})

	it("does not show permission management for anonymous visitors", async () => {
		mocks.hasHtmlPermissionDeclarations.current = true

		renderPage()

		await confirmSafetyNotice()

		expect(screen.getByTestId("micro-app-share-login")).toBeInTheDocument()
		expect(screen.queryByTestId("micro-app-share-permission-manager")).not.toBeInTheDocument()
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
