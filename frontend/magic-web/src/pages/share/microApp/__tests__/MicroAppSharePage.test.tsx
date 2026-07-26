import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { useState, type ReactNode } from "react"
import { MemoryRouter, Route, Routes } from "react-router"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { RoutePath } from "@/constants/routes"
import { whiteListRoutes } from "@/routes/const/whiteRoutes"
import MicroAppSharePage from "../index"

interface TestUserInfo {
	user_id: string
	magic_id: string
	nickname: string
	real_name: string
	avatar: string
	status: number
	organization_code: string
}

interface TestTeamshareOrganization {
	organization_code: string
	organization_name: string
}

interface TestOrganizationMeta {
	organizations: TestTeamshareOrganization[]
	organizationCode: string
	magicOrganizationMap: Record<string, { organization_name?: string }>
	teamshareOrganizationCode: string
	organizationListReady: boolean
}

interface TestPreviewFile {
	file_id?: string
	file_name?: string
}

interface TestHtmlPreviewProps {
	data: TestPreviewFile
	openFileTab?: (file: TestPreviewFile) => void
	virtualStorageMarkerId?: string
}

interface TestMagicDropdownProps {
	children: ReactNode
	popupRender?: () => ReactNode
	open?: boolean
	onOpenChange?: (open: boolean) => void
	overlayClassName?: string
}

const mocks = vi.hoisted(() => ({
	resolvePublishedMicroApp: vi.fn(),
	checkShareResourcePassword: vi.fn(),
	getShareResource: vi.fn(),
	getShareResourceFiles: vi.fn(),
	getTemporaryDownloadUrl: vi.fn(),
	historyReplace: vi.fn(),
	authorization: { current: "" },
	userInfo: { current: null as TestUserInfo | null },
	organizationMeta: {
		current: {
			organizations: [] as TestTeamshareOrganization[],
			organizationCode: "",
			magicOrganizationMap: {} as Record<string, { organization_name?: string }>,
			teamshareOrganizationCode: "",
			organizationListReady: true,
		} as TestOrganizationMeta,
	},
}))

vi.mock("@/apis", () => ({
	SuperMagicApi: {
		resolvePublishedMicroApp: mocks.resolvePublishedMicroApp,
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
	useAuthorization: () => ({ authorization: mocks.authorization.current }),
	useOrganization: () => mocks.organizationMeta.current,
	useUserInfo: () => ({ userInfo: mocks.userInfo.current }),
}))

vi.mock("@/models/user/hooks/useAccount", () => ({
	useAccount: () => ({ accounts: [] }),
}))

vi.mock("@/models/user", () => ({
	userStore: {
		user: {
			get authorization() {
				return mocks.authorization.current
			},
			get userInfo() {
				return mocks.userInfo.current
			},
			get organizationCode() {
				return mocks.organizationMeta.current.organizationCode
			},
			get organizations() {
				return mocks.organizationMeta.current.organizations
			},
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

vi.mock("@/components/business/UserAvatarRender", () => ({
	default: ({ userInfo }: { userInfo?: TestUserInfo | null }) => (
		<div data-testid="mock-user-avatar">{userInfo?.nickname || "avatar"}</div>
	),
}))

vi.mock("@/components/base/MagicDropdown", () => ({
	default: ({
		children,
		popupRender,
		open,
		onOpenChange,
		overlayClassName,
	}: TestMagicDropdownProps) => (
		<div data-testid="mock-magic-dropdown" data-overlay-class-name={overlayClassName}>
			<div data-testid="mock-magic-dropdown-trigger" onClick={() => onOpenChange?.(!open)}>
				{children}
			</div>
			{open ? popupRender?.() : null}
		</div>
	),
}))

vi.mock("@/hooks/account/useLogout", () => ({
	default: () => vi.fn(),
}))

vi.mock(
	"@/layouts/BaseLayout/components/Sider/components/OrganizationSwitch/OrganizationList",
	() => ({
		default: () => <div data-testid="mock-organization-list" />,
	}),
)

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
	default: function MockHtmlPreview({
		data,
		openFileTab,
		virtualStorageMarkerId,
	}: TestHtmlPreviewProps) {
		const [mountedFileId] = useState(data.file_id)

		return (
			<div
				data-testid="mock-html-preview"
				data-virtual-storage-marker-id={virtualStorageMarkerId}
			>
				<span>{data.file_name}</span>
				<span data-testid="mock-mounted-file-id">{mountedFileId}</span>
				<button
					type="button"
					onClick={() => openFileTab?.({ file_id: "file-2", file_name: "admin.html" })}
				>
					navigate-admin
				</button>
				<button
					type="button"
					onClick={() => openFileTab?.({ file_id: "file-1", file_name: "index.html" })}
				>
					navigate-index
				</button>
			</div>
		)
	},
}))

function renderPage(path = "/micro-app/app-1") {
	return render(
		<MemoryRouter initialEntries={[path]}>
			<Routes>
				<Route path="/micro-app/:appId" element={<MicroAppSharePage />} />
			</Routes>
		</MemoryRouter>,
	)
}

describe("MicroAppSharePage", () => {
	beforeEach(() => {
		vi.clearAllMocks()
		mocks.authorization.current = ""
		mocks.userInfo.current = null
		mocks.organizationMeta.current = {
			organizations: [],
			organizationCode: "",
			magicOrganizationMap: {},
			teamshareOrganizationCode: "",
			organizationListReady: true,
		}
		mocks.resolvePublishedMicroApp.mockResolvedValue({
			app_id: "app-1",
			resource_id: "resource-1",
			share_code: "resource-1",
		})
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
		expect(RoutePath.MicroAppShare).toBe("/micro-app/:appId")
		expect(whiteListRoutes).toContain("/micro-app/*")
	})

	it("loads shared files and renders the root html entry", async () => {
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

		expect(await screen.findByTestId("mock-html-preview")).toHaveTextContent("index.html")
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

		expect(await screen.findByTestId("mock-html-preview")).toHaveTextContent("index.html")
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

		expect(await screen.findByTestId("mock-html-preview")).toBeInTheDocument()
		expect(screen.getByText("Demo App")).toBeInTheDocument()
		expect(screen.queryByTestId("mock-logo")).not.toBeInTheDocument()
		expect(screen.getByTestId("micro-app-share-login")).toBeInTheDocument()
	})

	it("shows signed-in user and organization in the published micro app header", async () => {
		mocks.authorization.current = "token-1"
		mocks.userInfo.current = {
			user_id: "usi_1",
			magic_id: "magic_1",
			nickname: "黎增权",
			real_name: "黎增权",
			avatar: "",
			status: 1,
			organization_code: "magic-org-1",
		}
		mocks.organizationMeta.current = {
			organizations: [
				{
					organization_code: "team-org-1",
					organization_name: "Teamshare 研发部",
				},
			],
			organizationCode: "magic-org-1",
			magicOrganizationMap: {
				"magic-org-1": {
					organization_name: "Magic 研发部",
				},
			},
			teamshareOrganizationCode: "team-org-1",
			organizationListReady: true,
		}

		renderPage()

		expect(await screen.findByTestId("mock-html-preview")).toBeInTheDocument()
		expect(screen.getByTestId("micro-app-share-user")).toHaveTextContent("黎增权")
		expect(screen.getAllByText("Teamshare 研发部").length).toBeGreaterThan(0)
		expect(screen.queryByTestId("micro-app-share-login")).not.toBeInTheDocument()
	})

	it("opens account menu with organization switch and logout actions", async () => {
		mocks.authorization.current = "token-1"
		mocks.userInfo.current = {
			user_id: "usi_1",
			magic_id: "magic_1",
			nickname: "黎增权",
			real_name: "黎增权",
			avatar: "",
			status: 1,
			organization_code: "magic-org-1",
		}
		mocks.organizationMeta.current = {
			organizations: [
				{
					organization_code: "team-org-1",
					organization_name: "Teamshare 研发部",
				},
			],
			organizationCode: "magic-org-1",
			magicOrganizationMap: {},
			teamshareOrganizationCode: "team-org-1",
			organizationListReady: true,
		}

		renderPage()

		await screen.findByTestId("mock-html-preview")
		fireEvent.click(screen.getByTestId("mock-magic-dropdown-trigger"))

		expect(await screen.findByTestId("micro-app-share-user-menu")).toBeInTheDocument()
		expect(screen.getByTestId("micro-app-share-organization-trigger")).toHaveTextContent(
			"Teamshare 研发部",
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

		renderPage("/micro-app/app-1?password=abcd1234")

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
