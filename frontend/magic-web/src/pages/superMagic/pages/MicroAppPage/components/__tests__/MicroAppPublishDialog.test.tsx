import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import type { ComponentProps, ReactNode } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { ShareType } from "@/pages/superMagic/components/Share/types"
import MicroAppPublishDialog, {
	buildMicroAppAccessUrl,
	buildMicroAppPublishPayload,
	buildMicroAppShareText,
	getMicroAppPublishValidationError,
} from "../MicroAppPublishDialog"

const mocks = vi.hoisted(() => ({
	getMicroAppProject: vi.fn(),
	publishMicroAppProject: vi.fn(),
	unpublishMicroAppProject: vi.fn(),
	getFileUrl: vi.fn(),
	uploadAndGetFileUrl: vi.fn(),
	successToast: vi.fn(),
	errorToast: vi.fn(),
	writeText: vi.fn(),
	confirmModal: vi.fn(),
	useUploadOptions: undefined as Record<string, unknown> | undefined,
	t: (key: string, options?: Record<string, string>) =>
		options?.time ? `${key}:${options.time}` : key,
}))

vi.mock("@/apis", () => ({
	FileApi: {
		getFileUrl: mocks.getFileUrl,
	},
	SuperMagicApi: {
		getMicroAppProject: mocks.getMicroAppProject,
		publishMicroAppProject: mocks.publishMicroAppProject,
		unpublishMicroAppProject: mocks.unpublishMicroAppProject,
	},
}))

vi.mock("react-i18next", () => ({
	useTranslation: () => ({ t: mocks.t }),
}))

vi.mock("@/hooks/useUploadFiles", () => ({
	useUpload: (options: Record<string, unknown>) => {
		mocks.useUploadOptions = options
		return {
			uploadAndGetFileUrl: mocks.uploadAndGetFileUrl,
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
	const MagicModal = Object.assign(
		({
			open,
			children,
			title,
		}: {
			open?: boolean
			children?: React.ReactNode
			title?: React.ReactNode
		}) =>
			open
				? React.createElement(
						"div",
						{ "data-testid": "mock-magic-modal" },
						React.createElement("h2", null, title),
						children,
					)
				: null,
		{ confirm: mocks.confirmModal },
	)
	return { default: MagicModal }
})

vi.mock("@/components/base-mobile/MagicPopup", () => ({
	default: ({
		children,
		visible,
		position,
		className,
	}: {
		children: ReactNode
		visible?: boolean
		position?: string
		className?: string
	}) =>
		visible ? (
			<div data-testid="mobile-publish-popup" data-position={position} className={className}>
				{children}
			</div>
		) : null,
}))

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

function renderDialog(props: Partial<ComponentProps<typeof MicroAppPublishDialog>> = {}) {
	return render(
		<MicroAppPublishDialog
			open
			appId="app-1"
			projectName="Demo App"
			onProjectNameChange={vi.fn()}
			onOpenChange={vi.fn()}
			{...props}
		/>,
	)
}

describe("MicroAppPublishDialog", () => {
	beforeEach(() => {
		vi.clearAllMocks()
		mocks.useUploadOptions = undefined
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
		mocks.getFileUrl.mockResolvedValue({ url: "https://cdn.example.com/existing-cover.png" })
		mocks.uploadAndGetFileUrl.mockResolvedValue({
			fullfilled: [
				{
					value: {
						path: "micro-app/covers/new.png",
						url: "https://cdn.example.com/cover.png",
					},
				},
			],
		})
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

	it("identifies incomplete publish information", () => {
		expect(
			getMicroAppPublishValidationError({
				appName: "   ",
				shareType: ShareType.Organization,
				shareRange: "all",
				targets: [],
				password: "123456",
				coverUrl: "",
			}),
		).toBe("projectNameRequired")
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

	it("limits the content height and scrolls overflowing settings", async () => {
		renderDialog()

		const scrollArea = await screen.findByTestId("micro-app-publish-scroll-area")
		expect(scrollArea).toHaveAttribute("data-slot", "scroll-area")
		expect(scrollArea).toHaveClass("min-h-0")
		expect(scrollArea.querySelector("[data-slot='scroll-area-viewport']")).not.toBeNull()
		expect(screen.getByTestId("micro-app-publish-dialog")).toHaveClass(
			"grid",
			"max-h-[80dvh]",
			"grid-rows-[minmax(0,1fr)_auto_auto]",
		)
	})

	it("uses a fixed-height mobile bottom popup with a scrollable form area", async () => {
		renderDialog({ mobile: true })

		const popup = screen.getByTestId("mobile-publish-popup")
		expect(popup).toHaveAttribute("data-position", "bottom")
		expect(popup).toHaveClass("h-[88dvh]", "max-h-[88dvh]")
		expect(screen.getByTestId("micro-app-publish-dialog")).toHaveAttribute(
			"data-mobile",
			"true",
		)

		const scrollArea = await screen.findByTestId("micro-app-publish-scroll-area")
		expect(scrollArea).toHaveClass("min-h-0", "flex-1")
		expect(scrollArea.querySelector("[data-slot='scroll-area-viewport']")).toHaveClass(
			"touch-pan-y",
		)
	})

	it("groups the app name and cover in one settings section", async () => {
		renderDialog()

		const settings = await screen.findByTestId("micro-app-publish-basic-settings")
		expect(settings).toContainElement(screen.getByTestId("micro-app-publish-project-name"))
		expect(settings).toContainElement(screen.getByTestId("micro-app-cover-upload"))
	})

	it("disables publishing and prompts for a missing app name", async () => {
		mocks.getMicroAppProject.mockResolvedValue({
			app_id: "app-1",
			project_id: "project-1",
			project: { id: "project-1", project_name: "" },
			publish: null,
		})

		renderDialog({ projectName: "" })

		const saveButton = await screen.findByTestId("micro-app-publish-save")
		await waitFor(() => {
			expect(saveButton).toBeDisabled()
			expect(screen.getByTestId("micro-app-publish-validation-message")).toHaveTextContent(
				"microAppPage.publish.projectNameRequired",
			)
		})

		fireEvent.change(screen.getByTestId("micro-app-publish-project-name"), {
			target: { value: "库存管理助手" },
		})

		expect(saveButton).toBeEnabled()
		expect(screen.queryByTestId("micro-app-publish-validation-message")).toBeNull()
	})

	it("resolves and renders an existing cover from its file key", async () => {
		mocks.getMicroAppProject.mockResolvedValue({
			app_id: "app-1",
			project_id: "project-1",
			project: { id: "project-1", project_name: "Demo App" },
			publish: {
				app_id: "app-1",
				app_name: "Demo App",
				cover_file_key: "micro-app/covers/existing.png",
				share_type: ShareType.Public,
				publish_status: "published",
			},
		})

		renderDialog()

		await waitFor(() => {
			expect(mocks.getFileUrl).toHaveBeenCalledWith("micro-app/covers/existing.png")
			expect(screen.getByTestId("micro-app-cover-preview")).toHaveAttribute(
				"src",
				"https://cdn.example.com/existing-cover.png",
			)
		})
	})

	it("publishes with app_name instead of project_name", async () => {
		const onPublishStatusChange = vi.fn()
		renderDialog({ onPublishStatusChange })
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
			expect(onPublishStatusChange).toHaveBeenCalledWith(true)
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

	it("reports unpublished state after unpublishing succeeds", async () => {
		const onPublishStatusChange = vi.fn()
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
			},
		})

		renderDialog({ onPublishStatusChange })
		fireEvent.click(await screen.findByTestId("micro-app-unpublish-button"))

		await waitFor(() => {
			expect(mocks.unpublishMicroAppProject).toHaveBeenCalledWith("app-1")
			expect(onPublishStatusChange).toHaveBeenCalledWith(false)
		})
	})

	it("uploads an image cover and publishes its file key", async () => {
		renderDialog()
		await screen.findByTestId("share-type-field")

		const file = new File(["cover"], "cover.png", { type: "image/png" })
		fireEvent.change(screen.getByTestId("micro-app-cover-input"), {
			target: { files: [file] },
		})
		await waitFor(() => expect(mocks.uploadAndGetFileUrl).toHaveBeenCalledOnce())
		expect(mocks.useUploadOptions).toEqual({ storageType: "public", useSnowflakeId: true })

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
				accessUrl: "https://example.com/app-1",
				shareTitle: "You're invited to use the micro app “Demo App”",
				accessHint: "Open the link below to access it:",
				passwordText: "Password: abcd1234",
			}),
		).toBe(
			"You're invited to use the micro app “Demo App”\n\nOpen the link below to access it:\nhttps://example.com/app-1\n\nPassword: abcd1234",
		)
		expect(
			buildMicroAppShareText({
				accessUrl: "https://example.com/app-1",
				shareTitle: "You're invited to use the micro app “Demo App”",
				accessHint: "Open the link below to access it:",
			}),
		).toBe(
			"You're invited to use the micro app “Demo App”\n\nOpen the link below to access it:\nhttps://example.com/app-1",
		)
	})
})
