import { render } from "@testing-library/react"
import type { ComponentProps, ReactNode } from "react"
import { vi } from "vitest"
import { userStore } from "@/models/user"
import { ShareType } from "@/pages/superMagic/components/Share/types"
import MicroAppPublishDialog from "../MicroAppPublishDialog"

const mocks = vi.hoisted(() => ({
	getMicroAppProject: vi.fn(),
	getShareInfoByCode: vi.fn(),
	publishMicroAppProject: vi.fn(),
	unpublishMicroAppProject: vi.fn(),
	getFileUrl: vi.fn(),
	uploadAndGetFileUrl: vi.fn(),
	successToast: vi.fn(),
	errorToast: vi.fn(),
	writeText: vi.fn(),
	confirmModal: vi.fn(),
	useUploadOptions: undefined as Record<string, unknown> | undefined,
	t: (key: string, options?: Record<string, string>) => {
		if (options?.time) return `${key}:${options.time}`
		if (options?.projectName) return `${key}:${options.projectName}`
		if (options?.password) return `${key}:${options.password}`
		return key
	},
}))

export function getPublishDialogMocks() {
	return mocks
}

vi.mock("@/apis", () => ({
	FileApi: {
		getFileUrl: mocks.getFileUrl,
	},
	SuperMagicApi: {
		getMicroAppProject: mocks.getMicroAppProject,
		getShareInfoByCode: mocks.getShareInfoByCode,
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
		ShareTypeField: ({
			value,
			onChange,
			availableTypes,
		}: {
			value: ShareType
			onChange: (type: ShareType) => void
			availableTypes: ShareType[]
		}) =>
			React.createElement(
				"div",
				{ "data-testid": "share-type-field", "data-value": value },
				React.createElement(
					"button",
					{
						type: "button",
						"data-testid": "share-type-public",
						onClick: () => onChange(4),
					},
					"public",
				),
				availableTypes.includes(ShareType.Organization)
					? React.createElement(
							"button",
							{
								type: "button",
								"data-testid": "share-type-organization",
								onClick: () => onChange(ShareType.Organization),
							},
							"organization",
						)
					: null,
				React.createElement(
					"button",
					{
						type: "button",
						"data-testid": "force-share-type-organization",
						onClick: () => onChange(ShareType.Organization),
					},
					"force organization",
				),
			),
		ShareRangeField: () => React.createElement("div", { "data-testid": "share-range-field" }),
	}
})

export function renderDialog(props: Partial<ComponentProps<typeof MicroAppPublishDialog>> = {}) {
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

export function createPasswordProtectedDetail() {
	return {
		app_id: "app-1",
		project_id: "project-1",
		project: { id: "project-1", project_name: "Demo App" },
		publish: {
			app_id: "app-1",
			app_name: "Demo App",
			resource_id: "resource-1",
			share_code: "share-code-1",
			share_type: ShareType.PasswordProtected,
			publish_status: "published",
			access_url: "https://example.com/micro-app/app-1",
		},
	}
}

export function resetPublishDialogMocks() {
	vi.clearAllMocks()
	userStore.user.setIsPersonalOrganization(false)
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
	mocks.getShareInfoByCode.mockResolvedValue({ password: "" })
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
}
