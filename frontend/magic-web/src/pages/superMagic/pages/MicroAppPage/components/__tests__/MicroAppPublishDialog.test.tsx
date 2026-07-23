import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { ResourceType, ShareType } from "@/pages/superMagic/components/Share/types"
import MicroAppPublishDialog, {
	buildMicroAppAccessUrl,
	buildMicroAppPublishPayload,
	buildMicroAppShareText,
} from "../MicroAppPublishDialog"

const mocks = vi.hoisted(() => ({
	getPublishedMicroAppProjects: vi.fn(),
	getShareResourcesList: vi.fn(),
	getShareInfoByCode: vi.fn(),
	publishMicroAppProject: vi.fn(),
	unpublishMicroAppProject: vi.fn(),
	successToast: vi.fn(),
	errorToast: vi.fn(),
	writeText: vi.fn(),
	confirmModal: vi.fn(),
	t: (key: string, options?: Record<string, string>) =>
		options?.time ? `${key}:${options.time}` : key,
}))

vi.mock("@/apis", () => ({
	SuperMagicApi: {
		getPublishedMicroAppProjects: mocks.getPublishedMicroAppProjects,
		getShareResourcesList: mocks.getShareResourcesList,
		getShareInfoByCode: mocks.getShareInfoByCode,
		publishMicroAppProject: mocks.publishMicroAppProject,
		unpublishMicroAppProject: mocks.unpublishMicroAppProject,
	},
}))

vi.mock("react-i18next", () => ({
	useTranslation: () => ({
		t: mocks.t,
	}),
}))

vi.mock("@/components/base/MagicToaster/utils", () => ({
	default: {
		success: mocks.successToast,
		error: mocks.errorToast,
	},
}))

vi.mock("@/utils/clipboard-helpers", () => ({
	clipboard: {
		writeText: mocks.writeText,
	},
}))

vi.mock("@/components/base/MagicModal", async () => {
	const React = await import("react")
	const MagicModal = ({ open, children, title }: any) =>
		open
			? React.createElement(
					"div",
					{ "data-testid": "mock-magic-modal" },
					React.createElement("h2", null, title),
					children,
				)
			: null
	MagicModal.confirm = mocks.confirmModal
	return { default: MagicModal }
})

vi.mock("@/pages/superMagic/components/Share/ShareFields", async () => {
	const React = await import("react")
	return {
		ShareTypeField: ({ onChange }: { onChange: (type: ShareType) => void }) =>
			React.createElement(
				"div",
				{ "data-testid": "share-type-field" },
				React.createElement(
					"button",
					{
						type: "button",
						"data-testid": "share-type-org",
						onClick: () => onChange(ShareType.Organization),
					},
					"org",
				),
				React.createElement(
					"button",
					{
						type: "button",
						"data-testid": "share-type-public",
						onClick: () => onChange(ShareType.Public),
					},
					"public",
				),
				React.createElement(
					"button",
					{
						type: "button",
						"data-testid": "share-type-password",
						onClick: () => onChange(ShareType.PasswordProtected),
					},
					"password",
				),
			),
		ShareRangeField: ({
			onChange,
			onTargetsChange,
		}: {
			onChange: (range: "all" | "designated") => void
			onTargetsChange: (
				targets: Array<{ target_type: "User" | "Department"; target_id: string }>,
			) => void
		}) =>
			React.createElement(
				"div",
				{ "data-testid": "share-range-field" },
				React.createElement(
					"button",
					{
						type: "button",
						"data-testid": "share-range-designated",
						onClick: () => onChange("designated"),
					},
					"designated",
				),
				React.createElement(
					"button",
					{
						type: "button",
						"data-testid": "share-target-user",
						onClick: () =>
							onTargetsChange([{ target_type: "User", target_id: "usi_001" }]),
					},
					"user",
				),
			),
	}
})

function renderDialog({
	onProjectNameChange,
}: {
	onProjectNameChange?: (projectName: string) => void
} = {}) {
	return render(
		<MicroAppPublishDialog
			open
			appId="app-1"
			projectId="project-1"
			projectName="Demo App"
			onProjectNameChange={onProjectNameChange}
			onOpenChange={vi.fn()}
		/>,
	)
}

describe("MicroAppPublishDialog", () => {
	beforeEach(() => {
		vi.clearAllMocks()
		mocks.getPublishedMicroAppProjects.mockResolvedValue({ list: [] })
		mocks.getShareResourcesList.mockResolvedValue({ list: [] })
		mocks.getShareInfoByCode.mockResolvedValue(null)
		mocks.publishMicroAppProject.mockResolvedValue({
			app_id: "app-1",
			project_id: "project-1",
			resource_id: "resource-1",
			share_type: ShareType.Organization,
			share_range: "all",
			access_url: "https://example.com/app/resource-1",
			published_at: "2026-07-07T00:00:00Z",
		})
		mocks.confirmModal.mockImplementation(({ onOk }: { onOk?: () => void }) => onOk?.())
	})

	it("builds publish payloads for supported share types", () => {
		expect(
			buildMicroAppPublishPayload({
				projectName: "  Demo App  ",
				shareType: ShareType.Organization,
				shareRange: "all",
				targets: [{ target_type: "User", target_id: "usi_001" }],
				password: "123456",
			}),
		).toEqual({
			project_name: "Demo App",
			share_type: ShareType.Organization,
			share_range: "all",
		})

		expect(
			buildMicroAppPublishPayload({
				projectName: "Demo App",
				shareType: ShareType.Organization,
				shareRange: "designated",
				targets: [{ target_type: "User", target_id: "usi_001" }],
				password: "123456",
			}),
		).toEqual({
			project_name: "Demo App",
			share_type: ShareType.Organization,
			share_range: "designated",
			target_ids: [{ target_type: "User", target_id: "usi_001" }],
		})

		expect(
			buildMicroAppPublishPayload({
				projectName: "Demo App",
				shareType: ShareType.Public,
				shareRange: "all",
				targets: [],
				password: "123456",
			}),
		).toEqual({
			project_name: "Demo App",
			share_type: ShareType.Public,
		})

		expect(
			buildMicroAppPublishPayload({
				projectName: "Demo App",
				shareType: ShareType.PasswordProtected,
				shareRange: "all",
				targets: [],
				password: "  abcd  ",
			}),
		).toEqual({
			project_name: "Demo App",
			share_type: ShareType.PasswordProtected,
			password: "abcd",
		})
	})

	it("builds share text with optional password", () => {
		expect(
			buildMicroAppShareText({
				projectName: "Demo App",
				accessUrl: "https://example.com/micro-app/resource-1",
				passwordLabel: "访问密码",
			}),
		).toBe("Demo App\nhttps://example.com/micro-app/resource-1")

		expect(
			buildMicroAppShareText({
				projectName: "Demo App",
				accessUrl: "https://example.com/micro-app/resource-1",
				password: "abcd1234",
				passwordLabel: "访问密码",
			}),
		).toBe("Demo App\nhttps://example.com/micro-app/resource-1\n访问密码: abcd1234")
	})

	it("publishes designated organization targets only when range is designated", async () => {
		renderDialog()

		await screen.findByTestId("share-type-field")

		fireEvent.click(screen.getByTestId("share-range-designated"))
		fireEvent.click(screen.getByTestId("share-target-user"))
		fireEvent.click(screen.getByTestId("micro-app-publish-save"))

		await waitFor(() => {
			expect(mocks.publishMicroAppProject).toHaveBeenCalledWith("app-1", {
				project_name: "Demo App",
				share_type: ShareType.Organization,
				share_range: "designated",
				target_ids: [{ target_type: "User", target_id: "usi_001" }],
			})
		})
	})

	it("publishes public access without organization fields", async () => {
		renderDialog()

		await screen.findByTestId("share-type-field")

		fireEvent.click(screen.getByTestId("share-type-public"))
		fireEvent.click(screen.getByTestId("micro-app-publish-save"))

		await waitFor(() => {
			expect(mocks.publishMicroAppProject).toHaveBeenCalledWith("app-1", {
				project_name: "Demo App",
				share_type: ShareType.Public,
			})
		})
	})

	it("publishes password access with edited password", async () => {
		renderDialog()

		await screen.findByTestId("share-type-field")

		fireEvent.click(screen.getByTestId("share-type-password"))
		fireEvent.change(screen.getByTestId("micro-app-publish-password"), {
			target: { value: "123456" },
		})
		fireEvent.click(screen.getByTestId("micro-app-publish-save"))

		await waitFor(() => {
			expect(mocks.publishMicroAppProject).toHaveBeenCalledWith("app-1", {
				project_name: "Demo App",
				share_type: ShareType.PasswordProtected,
				password: "123456",
			})
		})
	})

	it("publishes the edited project name and notifies the page", async () => {
		const onProjectNameChange = vi.fn()
		renderDialog({ onProjectNameChange })

		await screen.findByTestId("share-type-field")
		fireEvent.change(screen.getByTestId("micro-app-publish-project-name"), {
			target: { value: "库存管理助手" },
		})
		fireEvent.click(screen.getByTestId("micro-app-publish-save"))

		await waitFor(() => {
			expect(mocks.publishMicroAppProject).toHaveBeenCalledWith("app-1", {
				project_name: "库存管理助手",
				share_type: ShareType.Organization,
				share_range: "all",
			})
			expect(onProjectNameChange).toHaveBeenCalledWith("库存管理助手")
		})
	})

	it("loads existing project share setting and shows access url", async () => {
		mocks.getShareResourcesList.mockResolvedValue({
			list: [
				{
					project_id: "project-1",
					resource_id: "resource-1",
					share_project: true,
					share_type: ShareType.Public,
				},
			],
		})
		mocks.getShareInfoByCode.mockResolvedValue({
			project_id: "project-1",
			resource_id: "resource-1",
			share_type: ShareType.Public,
			access_url: "https://example.com/app/resource-1",
			published_at: "2026-07-07T00:00:00Z",
		})

		renderDialog()

		await waitFor(() => {
			expect(mocks.getShareResourcesList).toHaveBeenCalledWith({
				page: 1,
				page_size: 10,
				resource_type: ResourceType.FileCollection,
				project_id: "project-1",
				share_project: true,
				filter_type: "active",
			})
			expect(mocks.getShareInfoByCode).toHaveBeenCalledWith({ code: "resource-1" })
			expect(mocks.getPublishedMicroAppProjects).not.toHaveBeenCalled()
		})
		await waitFor(() => {
			expect(screen.getByTestId("micro-app-publish-access-url")).toHaveValue(
				`${window.location.origin}/micro-app/app-1`,
			)
		})
	})

	it("loads existing project share setting from wrapped response after refresh", async () => {
		mocks.getShareResourcesList.mockResolvedValue({
			data: {
				list: [
					{
						project_id: "project-1",
						resource_id: "resource-1",
						share_project: true,
					},
				],
			},
		})
		mocks.getShareInfoByCode.mockResolvedValue({
			data: {
				project_id: "project-1",
				resource_id: "resource-1",
				share_type: ShareType.Public,
				access_url: "https://example.com/app/resource-1",
				published_at: "2026-07-07T00:00:00Z",
			},
		})

		renderDialog()

		await waitFor(() => {
			expect(screen.getByTestId("micro-app-publish-access-url")).toHaveValue(
				`${window.location.origin}/micro-app/app-1`,
			)
			expect(screen.getByTestId("micro-app-publish-save")).toHaveTextContent(
				"microAppPage.publish.update",
			)
		})
	})

	it("keeps published state when share setting response is empty", async () => {
		mocks.getShareResourcesList.mockResolvedValue({
			list: [
				{
					project_id: "project-1",
					resource_id: "resource-1",
					share_project: true,
					share_type: ShareType.Public,
				},
			],
		})
		mocks.getShareInfoByCode.mockResolvedValue({ data: null })

		renderDialog()

		await waitFor(() => {
			expect(screen.getByTestId("micro-app-publish-access-url")).toHaveValue(
				`${window.location.origin}/micro-app/app-1`,
			)
			expect(screen.getByTestId("micro-app-publish-save")).toHaveTextContent(
				"microAppPage.publish.update",
			)
		})
	})

	it("copies quick share text from published area", async () => {
		mocks.getShareResourcesList.mockResolvedValue({
			list: [
				{
					project_id: "project-1",
					resource_id: "resource-1",
					share_project: true,
				},
			],
		})
		mocks.getShareInfoByCode.mockResolvedValue({
			project_id: "project-1",
			resource_id: "resource-1",
			share_type: ShareType.Public,
			access_url: "https://example.com/app/resource-1",
		})

		renderDialog()

		await screen.findByTestId("micro-app-publish-quick-share")
		fireEvent.click(screen.getByTestId("micro-app-publish-copy-share-text"))

		expect(mocks.writeText).toHaveBeenCalledWith(
			`Demo App\n${window.location.origin}/micro-app/app-1`,
		)
		expect(mocks.successToast).toHaveBeenCalledWith("microAppPage.publish.shareTextCopySuccess")
	})

	it("does not copy a generated password when refreshed record omits password", async () => {
		mocks.getShareResourcesList.mockResolvedValue({
			list: [
				{
					project_id: "project-1",
					resource_id: "resource-1",
					share_project: true,
				},
			],
		})
		mocks.getShareInfoByCode.mockResolvedValue({
			project_id: "project-1",
			resource_id: "resource-1",
			share_type: ShareType.PasswordProtected,
			access_url: "https://example.com/app/resource-1",
		})

		renderDialog()

		await screen.findByTestId("micro-app-publish-quick-share")
		fireEvent.click(screen.getByTestId("micro-app-publish-copy-share-text"))

		expect(mocks.writeText).toHaveBeenCalledWith(
			`Demo App\n${window.location.origin}/micro-app/app-1`,
		)
	})

	it("builds micro app route access url when api omits access_url", async () => {
		expect(
			buildMicroAppAccessUrl({
				app_id: "app-1",
				project_id: "project-1",
				resource_id: "resource-1",
				share_type: ShareType.Public,
			}),
		).toBe(`${window.location.origin}/micro-app/app-1`)

		mocks.publishMicroAppProject.mockResolvedValue({
			app_id: "app-1",
			project_id: "project-1",
			resource_id: "resource-1",
			share_type: ShareType.Public,
		})

		renderDialog()

		await screen.findByTestId("share-type-field")
		fireEvent.click(screen.getByTestId("share-type-public"))
		fireEvent.click(screen.getByTestId("micro-app-publish-save"))

		await waitFor(() => {
			expect(screen.getByTestId("micro-app-publish-access-url")).toHaveValue(
				`${window.location.origin}/micro-app/app-1`,
			)
		})
	})

	it("unpublishes current project and clears published state", async () => {
		mocks.getShareResourcesList.mockResolvedValue({
			list: [
				{
					project_id: "project-1",
					resource_id: "resource-1",
					share_project: true,
				},
			],
		})
		mocks.getShareInfoByCode.mockResolvedValue({
			project_id: "project-1",
			resource_id: "resource-1",
			share_type: ShareType.Public,
			access_url: "https://example.com/app/resource-1",
		})
		mocks.unpublishMicroAppProject.mockResolvedValue({})

		renderDialog()

		await screen.findByTestId("micro-app-publish-access-url")
		await waitFor(() => {
			expect(screen.getByTestId("micro-app-unpublish-button")).not.toBeDisabled()
		})
		fireEvent.click(screen.getByTestId("micro-app-unpublish-button"))

		await waitFor(() => {
			expect(mocks.unpublishMicroAppProject).toHaveBeenCalledWith("app-1")
			expect(screen.queryByTestId("micro-app-publish-access-url")).not.toBeInTheDocument()
		})
	})
})
