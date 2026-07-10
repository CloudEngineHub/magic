import { render, screen, waitFor } from "@testing-library/react"
import { MemoryRouter, Route, Routes } from "react-router"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { RoutePath } from "@/constants/routes"
import { whiteListRoutes } from "@/routes/const/whiteRoutes"
import MicroAppSharePage from "../index"

const mocks = vi.hoisted(() => ({
	checkShareResourcePassword: vi.fn(),
	getShareResource: vi.fn(),
	getShareResourceFiles: vi.fn(),
	getTemporaryDownloadUrl: vi.fn(),
	historyReplace: vi.fn(),
}))

vi.mock("@/apis", () => ({
	SuperMagicApi: {
		checkShareResourcePassword: mocks.checkShareResourcePassword,
		getShareResource: mocks.getShareResource,
		getShareResourceFiles: mocks.getShareResourceFiles,
	},
}))

vi.mock("react-i18next", () => ({
	initReactI18next: {
		type: "3rdParty",
		init: vi.fn(),
	},
	useTranslation: () => ({
		t: (key: string) => key,
	}),
}))

vi.mock("@/models/user/hooks", () => ({
	useUserInfo: () => ({ userInfo: null }),
}))

vi.mock("@/models/user/hooks/useAccount", () => ({
	useAccount: () => ({ accounts: [] }),
}))

vi.mock("@/models/user", () => ({
	userStore: {
		user: {
			authorization: "",
			userInfo: null,
		},
	},
}))

vi.mock("@/routes/history", () => ({
	history: {
		push: vi.fn(),
		replace: mocks.historyReplace,
	},
}))

vi.mock("@/pages/superMagic/utils/api", () => ({
	getTemporaryDownloadUrl: mocks.getTemporaryDownloadUrl,
}))

vi.mock("@/hooks/account/useSwitchOrganization", () => ({
	useSwitchOrganization: () => vi.fn(),
}))

vi.mock("@/layouts/BaseLayout/components/Header/components/Logo", () => ({
	default: () => <div data-testid="mock-logo" />,
}))

vi.mock("@/pages/share/components/WorkspaceButton", () => ({
	default: () => <button type="button">workspace</button>,
}))

vi.mock("@/pages/share/components", () => ({
	ErrorDisplay: ({ errorMessage }: { errorMessage?: string }) => (
		<div data-testid="mock-error-display">{errorMessage}</div>
	),
	PasswordVerification: () => <div data-testid="mock-password-verification" />,
	ShareEmptyState: () => <div data-testid="mock-share-empty-state" />,
}))

vi.mock("@/pages/superMagic/components/Detail/contents/HTML", () => ({
	default: ({ data }: { data: any }) => (
		<div data-testid="mock-html-preview">{data.file_name}</div>
	),
}))

function renderPage(path = "/micro-app/resource-1") {
	return render(
		<MemoryRouter initialEntries={[path]}>
			<Routes>
				<Route path="/micro-app/:resourceId" element={<MicroAppSharePage />} />
			</Routes>
		</MemoryRouter>,
	)
}

describe("MicroAppSharePage", () => {
	beforeEach(() => {
		vi.clearAllMocks()
		mocks.checkShareResourcePassword.mockResolvedValue({ has_password: false })
		mocks.getShareResource.mockResolvedValue({
			temporary_token: "token-1",
			data: {
				project_id: "project-1",
				project_name: "Demo App",
			},
		})
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
			],
		})
		mocks.getTemporaryDownloadUrl.mockResolvedValue([{ url: "https://example.com/app.json" }])
		vi.stubGlobal(
			"fetch",
			vi.fn().mockResolvedValue({
				ok: true,
				json: vi.fn().mockResolvedValue({ type: "micro-app", anonymous: true }),
			}),
		)
	})

	it("registers the standalone micro app route as public", () => {
		expect(RoutePath.MicroAppShare).toBe("/micro-app/:resourceId")
		expect(whiteListRoutes).toContain("/micro-app/*")
	})

	it("loads shared files and renders the root html entry", async () => {
		renderPage()

		await waitFor(() => {
			expect(mocks.getShareResource).toHaveBeenCalledWith({
				resource_id: "resource-1",
				password: undefined,
			})
			expect(mocks.getShareResourceFiles).toHaveBeenCalledWith({
				resource_id: "resource-1",
				password: undefined,
			})
		})

		expect(await screen.findByTestId("mock-html-preview")).toHaveTextContent("index.html")
	})

	it("does not render host app chrome around the published micro app", async () => {
		renderPage()

		expect(await screen.findByTestId("mock-html-preview")).toBeInTheDocument()
		expect(screen.queryByTestId("mock-logo")).not.toBeInTheDocument()
		expect(screen.queryByTestId("micro-app-share-login")).not.toBeInTheDocument()
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

	it("uses password query when the resource requires password", async () => {
		mocks.checkShareResourcePassword.mockResolvedValue({ has_password: true })

		renderPage("/micro-app/resource-1?password=abcd1234")

		await waitFor(() => {
			expect(mocks.getShareResource).toHaveBeenCalledWith({
				resource_id: "resource-1",
				password: "abcd1234",
			})
		})
	})

	it("redirects to login when app.json does not allow anonymous access", async () => {
		vi.mocked(fetch).mockResolvedValueOnce({
			ok: true,
			json: vi.fn().mockResolvedValue({ type: "micro-app", anonymous: false }),
		} as any)

		renderPage()

		await waitFor(() => {
			expect(mocks.historyReplace).toHaveBeenCalledWith(
				expect.objectContaining({ name: "Login" }),
			)
		})
		expect(screen.queryByTestId("mock-html-preview")).not.toBeInTheDocument()
	})
})
