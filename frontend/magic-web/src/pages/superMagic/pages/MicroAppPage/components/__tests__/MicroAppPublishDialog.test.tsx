import { act, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { ShareType } from "@/pages/superMagic/components/Share/types"
import MicroAppPublishDialog, {
	buildMicroAppAccessUrl,
	buildMicroAppPublishPayload,
	buildMicroAppShareText,
} from "../MicroAppPublishDialog"

const mocks = vi.hoisted(() => ({
	getMicroAppProject: vi.fn(),
	publishMicroAppProject: vi.fn(),
	unpublishMicroAppProject: vi.fn(),
	getFileUrl: vi.fn(),
	addFiles: vi.fn(),
	clearFiles: vi.fn(),
	successToast: vi.fn(),
	errorToast: vi.fn(),
	writeText: vi.fn(),
	confirmModal: vi.fn(),
	useFileUploadOptions: undefined as Record<string, unknown> | undefined,
	t: (key: string, options?: Record<string, string>) =>
		options?.time ? `${key}:${options.time}` : key,
}))

vi.mock("@/apis", () => ({
	SuperMagicApi: {
		getMicroAppProject: mocks.getMicroAppProject,
		publishMicroAppProject: mocks.publishMicroAppProject,
		unpublishMicroAppProject: mocks.unpublishMicroAppProject,
		getFileUrl: mocks.getFileUrl,
	},
}))

vi.mock("react-i18next", () => ({
	useTranslation: () => ({ t: mocks.t }),
}))

vi.mock("@/pages/superMagic/components/MessageEditor/hooks/useFileUpload", () => ({
	useFileUpload: (options: Record<string, unknown>) => {
		mocks.useFileUploadOptions = options
		return {
			addFiles: mocks.addFiles,
			clearFiles: mocks.clearFiles,
			uploading: false,
		}
	},
}))

vi.mock("@/components/base/MagicToaster/utils", () => ({
	default: {
		success: mocks.successToast,
		error: mocks.errorToast,
	},
}))

vi.mock("@/utils/clipboard-helpers", () => ({
	clipboard: { writeText: mocks.writeText },
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
						"data-testid": "share-type-public",
						onClick: () => onChange(4),
					},
					"public",
				),
			),
		ShareRangeField: () => React.createElement("div", { "data-testid": "share-range-field" }),
	}
})

function renderDialog() {
	return render(
		<MicroAppPublishDialog
			open
			appId="app-1"
			projectName="Demo App"
			onProjectNameChange={vi.fn()}
			onOpenChange={vi.fn()}
		/>,
	)
}

describe("MicroAppPublishDialog", () => {
	beforeEach(() => {
		vi.clearAllMocks()
		mocks.getMicroAppProject.mockResolvedValue({
			app_id: "app-1",
			project_id: "project-1",
			project: { id: "project-1", project_name: "Demo App" },
			publish: null,
		})
		mocks.publishMicroAppProject.mockResolvedValue({
			app_id: "app-1",
			app_name: "Demo App",
			resource_id: "resource-1",
			share_type: ShareType.Public,
			publish_status: "published",
			access_url: "https://example.com/micro-app/app-1",
		})
		mocks.getFileUrl.mockResolvedValue({ url: "https://cdn.example.com/cover.png" })
		mocks.confirmModal.mockImplementation(({ onOk }: { onOk?: () => void }) => onOk?.())
	})

	it("builds the new app_name publish payload and optional cover", () => {
		expect(
			buildMicroAppPublishPayload({
				appName: "  Demo App  ",
				shareType: ShareType.Public,
				shareRange: "all",
				targets: [],
				password: "123456",
				coverFileKey: "micro-app/covers/demo.png",
				coverUrl: "",
			}),
		).toEqual({
			app_name: "Demo App",
			share_type: ShareType.Public,
			cover_file_key: "micro-app/covers/demo.png",
		})
	})

	it("loads publish state through the app detail endpoint", async () => {
		mocks.getMicroAppProject.mockResolvedValue({
			app_id: "app-1",
			project_id: "project-1",
			project: { id: "project-1", project_name: "Demo App" },
			publish: {
				app_id: "app-1",
				app_name: "Demo App",
				resource_id: "resource-1",
				share_type: ShareType.Public,
				publish_status: "published",
				access_url: "https://example.com/micro-app/app-1",
			},
		})

		renderDialog()

		await waitFor(() => {
			expect(mocks.getMicroAppProject).toHaveBeenCalledWith("app-1")
			expect(screen.getByTestId("micro-app-publish-access-url")).toHaveValue(
				"https://example.com/micro-app/app-1",
			)
		})
	})

	it("publishes with app_name instead of project_name", async () => {
		renderDialog()
		await screen.findByTestId("share-type-field")

		fireEvent.click(screen.getByTestId("share-type-public"))
		fireEvent.change(screen.getByTestId("micro-app-publish-project-name"), {
			target: { value: "库存管理助手" },
		})
		fireEvent.click(screen.getByTestId("micro-app-publish-save"))

		await waitFor(() => {
			expect(mocks.publishMicroAppProject).toHaveBeenCalledWith("app-1", {
				app_name: "库存管理助手",
				share_type: ShareType.Public,
			})
		})
	})

	it("clears an existing cover by sending null", async () => {
		mocks.getMicroAppProject.mockResolvedValue({
			app_id: "app-1",
			project_id: "project-1",
			project: { id: "project-1", project_name: "Demo App" },
			publish: {
				app_id: "app-1",
				app_name: "Demo App",
				cover_file_key: "micro-app/covers/old.png",
				share_type: ShareType.Public,
				publish_status: "published",
			},
		})

		renderDialog()
		await screen.findByTestId("micro-app-cover-clear")
		fireEvent.click(screen.getByTestId("micro-app-cover-clear"))
		fireEvent.click(screen.getByTestId("micro-app-publish-save"))

		await waitFor(() => {
			expect(mocks.publishMicroAppProject).toHaveBeenCalledWith("app-1", {
				app_name: "Demo App",
				share_type: ShareType.Public,
				cover_file_key: null,
			})
		})
	})

	it("uploads an image cover and publishes its file key", async () => {
		renderDialog()
		await screen.findByTestId("share-type-field")

		const file = new File(["cover"], "cover.png", { type: "image/png" })
		fireEvent.change(screen.getByTestId("micro-app-cover-input"), {
			target: { files: [file] },
		})
		const onFileCompleted = mocks.useFileUploadOptions?.onFileCompleted as
			| ((fileId: string, result: { file_key: string }) => void)
			| undefined
		act(() => {
			onFileCompleted?.("file-1", { file_key: "micro-app/covers/new.png" })
		})
		await waitFor(() =>
			expect(mocks.getFileUrl).toHaveBeenCalledWith("micro-app/covers/new.png"),
		)

		fireEvent.click(screen.getByTestId("micro-app-publish-save"))
		await waitFor(() => {
			expect(mocks.publishMicroAppProject).toHaveBeenCalledWith("app-1", {
				app_name: "Demo App",
				share_type: ShareType.Organization,
				share_range: "all",
				cover_file_key: "micro-app/covers/new.png",
			})
		})
	})

	it("builds access and share text from the stable app link", () => {
		expect(
			buildMicroAppAccessUrl({ app_id: "app-1", access_url: "https://example.com/app-1" }),
		).toBe("https://example.com/app-1")
		expect(
			buildMicroAppShareText({
				projectName: "Demo App",
				accessUrl: "https://example.com/app-1",
				password: "abcd1234",
				passwordLabel: "Password",
			}),
		).toBe("Demo App\nhttps://example.com/app-1\nPassword: abcd1234")
	})
})
