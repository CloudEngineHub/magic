import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import FileShareModal from "../FileShareModal"
import { ShareMode, ShareType } from "../../types"
import { SharePermissionResourceProvider } from "../../SharePermissionResourceContext"

const mocks = vi.hoisted(() => ({
	getSnowflakeIds: vi.fn(),
	createOrUpdateShareResource: vi.fn(),
	getShareInfoByCode: vi.fn(),
	getAttachmentsByProjectId: vi.fn(),
	batchGetFileDetails: vi.fn(),
	writeText: vi.fn(),
	successToast: vi.fn(),
	errorToast: vi.fn(),
	functionPermissions: {} as Record<string, boolean>,
}))

vi.hoisted(() => {
	const storageMock = {
		getItem: () => null,
		setItem: vi.fn(),
		removeItem: vi.fn(),
		clear: vi.fn(),
		key: vi.fn(),
		length: 0,
	}

	Object.defineProperty(globalThis, "localStorage", {
		value: storageMock,
		configurable: true,
	})
	Object.defineProperty(globalThis, "sessionStorage", {
		value: storageMock,
		configurable: true,
	})
})

vi.mock("@/apis", () => ({
	FUNCTION_PERMISSION_CODE: {
		MicroAppSharePassword: "micro_app.share_password",
		MicroAppSharePublic: "micro_app.share_public",
		MicroAppShareTeam: "micro_app.share_team",
		ProjectSharePassword: "project.share_password",
		ProjectSharePublic: "project.share_public",
		ProjectShareTeam: "project.share_team",
	},
	SuperMagicApi: {
		getSnowflakeIds: mocks.getSnowflakeIds,
		createOrUpdateShareResource: mocks.createOrUpdateShareResource,
		getShareInfoByCode: mocks.getShareInfoByCode,
		getAttachmentsByProjectId: mocks.getAttachmentsByProjectId,
		batchGetFileDetails: mocks.batchGetFileDetails,
	},
}))

vi.mock("@/hooks/useFunctionPermission", () => ({
	useFunctionPermissions: () => ({
		data: mocks.functionPermissions,
		error: undefined,
		isLoading: false,
		mutate: vi.fn(),
	}),
}))

vi.mock("@dtyq/magic-admin/components", () => ({}))
vi.mock("@dtyq/magic-admin/provider", () => ({}))
vi.mock("@dtyq/magic-admin", () => ({
	RouteName: {
		Admin: "admin",
		AdminPlatformAIModel: "admin-platform-ai-model",
	},
	PlatformPackageRoutes: {},
	AiManageRoutes: {},
	EnterpriseManageRoutes: {},
	otherRoutes: [],
}))
vi.mock("@/assets/locales/locale-adapters", () => ({
	getLocaleModules: () => ({}),
	getAdminLocaleModules: () => ({}),
	loadFallbackLocale: vi.fn(),
	loadMagicFlowLocale: vi.fn(),
}))

vi.mock("@/services/chat/dots/OrganizationDotsDbService", () => ({
	default: {
		setPersistenceData: vi.fn(),
		setDotSeqIdData: vi.fn(),
	},
}))

vi.mock("@/pages/superMagic/services", () => ({
	loadProjectAttachments: mocks.getAttachmentsByProjectId,
}))

vi.mock("react-i18next", () => ({
	initReactI18next: {
		type: "3rdParty",
		init: () => undefined,
	},
	useTranslation: () => ({
		t: (key: string) => key,
	}),
}))

vi.mock("ahooks", () => ({
	useResponsive: () => ({ md: true }),
	useDebounceFn: (fn: () => void) => ({ run: fn }),
}))

vi.mock("@/hooks/useIsMobile", () => ({
	useIsMobile: () => false,
}))

vi.mock("@/models/user", () => ({
	userStore: {
		user: {
			organizationSubscriptionInfo: {
				is_paid_plan: true,
			},
			userInfo: {
				nickname: "Tester",
				real_name: "Tester",
			},
		},
	},
}))

vi.mock("@/pages/superMagic/stores/core", () => ({
	projectStore: {
		selectedProject: {
			id: "project-1",
		},
		projects: [{ id: "project-1", project_name: "Demo Project" }],
	},
}))

vi.mock("@/utils/clipboard-helpers", () => ({
	clipboard: {
		writeText: mocks.writeText,
	},
}))

vi.mock("@/components/base/MagicToaster/utils", () => ({
	default: {
		success: mocks.successToast,
		error: mocks.errorToast,
		warning: vi.fn(),
	},
}))

vi.mock("@/components/base/MagicModal", () => ({
	default: Object.assign(() => null, { confirm: vi.fn() }),
}))

vi.mock("@/pages/superMagic/hooks/useSingleDocumentStaticDependencies", () => ({
	useSingleDocumentStaticDependencies: () => ({
		fileId: null,
		fileType: null,
		dependencyFileIds: [],
		isLoading: false,
		error: null,
	}),
}))

vi.mock("../style", () => ({
	default: () => ({
		styles: {
			mobileContainer: "",
			mobileShareOptions: "",
			body: "",
			fileListSection: "",
			shareOptionsSection: "",
			selectorContainer: "",
			fileSelector: "",
			resizeHandle: "",
		},
	}),
}))

vi.mock("../../../utils/attachmentDataProcessor", () => ({
	AttachmentDataProcessor: {
		processAttachmentData: (value: unknown) => value,
	},
}))

vi.mock("../../FileSelector", () => ({
	default: () => <div data-testid="file-selector" />,
}))

vi.mock("../MobileFileSelectorPopup", () => ({
	default: () => null,
}))

vi.mock("../FileShareModalFooter", () => ({
	default: ({ onSave, isDisabled }: { onSave: () => void; isDisabled?: boolean }) => (
		<button data-testid="save-share" onClick={onSave} disabled={isDisabled}>
			save
		</button>
	),
}))

vi.mock("../../ShareFields", () => ({
	ShareNameField: ({ value, onChange }: { value: string; onChange: (value: string) => void }) => (
		<input
			data-testid="share-name-input"
			value={value}
			onChange={(event) => onChange(event.target.value)}
		/>
	),
	ShareTypeField: ({
		value,
		permittedTypes,
	}: {
		value: ShareType
		permittedTypes?: ShareType[]
	}) => (
		<div
			data-testid="share-type-field"
			data-value={value}
			data-permitted-types={permittedTypes?.join(",") ?? "unrestricted"}
		/>
	),
	SharePasswordField: () => null,
	ShareExpiryField: () => null,
	ShareRangeField: () => null,
	ShareAdvancedSettings: () => null,
	calculateDefaultShareName: () => "default-share-name",
}))

vi.mock("@/components/shadcn-ui/switch", () => ({
	Switch: () => null,
}))

vi.mock("@/components/shadcn-ui/separator", () => ({
	Separator: () => null,
}))

vi.mock("../../utils/generateShareMessageText", () => ({
	generateShareMessageText: () => "share-message",
}))

describe("FileShareModal", () => {
	beforeEach(() => {
		vi.clearAllMocks()
		mocks.functionPermissions = {
			"project.share_password": true,
			"project.share_public": true,
			"project.share_team": true,
		}
		mocks.getSnowflakeIds.mockResolvedValue({ ids: ["share-1"] })
		mocks.createOrUpdateShareResource.mockResolvedValue({ file_ids: [] })
		mocks.batchGetFileDetails.mockResolvedValue({ files: [] })
	})

	it("创建录音文件分享时会补齐必需文件 ids", async () => {
		render(
			<FileShareModal
				types={[ShareType.PasswordProtected]}
				projectId="project-1"
				projectName="Demo Project"
				attachments={[
					{
						file_id: "file-transcript",
						file_name: "session-transcript.md",
						is_directory: false,
					},
				]}
				defaultSelectedFileIds={["file-transcript"]}
				requiredFileIds={["file-audio", "file-magic-project"]}
			/>,
		)

		fireEvent.change(screen.getByTestId("share-name-input"), {
			target: { value: "Recording Share" },
		})
		fireEvent.click(screen.getByTestId("save-share"))

		await waitFor(() => {
			expect(mocks.createOrUpdateShareResource).toHaveBeenCalledWith(
				expect.objectContaining({
					resource_name: "Recording Share",
					file_ids: ["file-transcript", "file-audio", "file-magic-project"],
				}),
			)
		})
	})

	it("编辑录音文件分享时保存也会补齐必需文件 ids", async () => {
		mocks.getShareInfoByCode.mockResolvedValue({
			project_id: "project-1",
			resource_name: "Existing Recording Share",
			share_type: ShareType.PasswordProtected,
			file_ids: ["file-transcript", "file-magic-project"],
			extra: {},
		})
		mocks.getAttachmentsByProjectId.mockResolvedValue({
			tree: [
				{
					file_id: "file-transcript",
					file_name: "session-transcript.md",
					is_directory: false,
				},
				{
					file_id: "file-magic-project",
					file_name: "magic.project.js",
					is_directory: false,
				},
			],
			list: [
				{
					file_id: "file-transcript",
					file_name: "session-transcript.md",
					is_directory: false,
				},
				{
					file_id: "file-magic-project",
					file_name: "magic.project.js",
					is_directory: false,
				},
			],
		})
		render(
			<FileShareModal
				types={[ShareType.PasswordProtected]}
				projectId="project-1"
				projectName="Demo Project"
				resourceId="share-existing"
				requiredFileIds={["file-audio", "file-magic-project"]}
			/>,
		)

		await waitFor(() => {
			expect(mocks.getShareInfoByCode).toHaveBeenCalledWith({ code: "share-existing" })
		})

		fireEvent.click(screen.getByTestId("save-share"))

		await waitFor(() => {
			const payload = mocks.createOrUpdateShareResource.mock.calls[0]?.[0]
			expect(payload).toEqual(
				expect.objectContaining({
					resource_id: "share-existing",
					file_ids: expect.arrayContaining([
						"file-transcript",
						"file-audio",
						"file-magic-project",
					]),
				}),
			)
			expect(new Set(payload.file_ids)).toHaveLength(3)
		})
	})

	it("clears the previous share selection when switching edit targets", async () => {
		mocks.getShareInfoByCode.mockImplementation(async ({ code }: { code: string }) =>
			code === "share-a"
				? {
						project_id: "project-1",
						resource_name: "Share A",
						share_type: ShareType.PasswordProtected,
						file_ids: ["file-a"],
						extra: {},
					}
				: {
						project_id: "project-1",
						resource_name: "Share B",
						share_type: ShareType.PasswordProtected,
						file_ids: ["file-b"],
						extra: {},
					},
		)
		mocks.getAttachmentsByProjectId.mockResolvedValue({
			tree: [
				{ file_id: "file-a", file_name: "selected-a.md", is_directory: false },
				{ file_id: "file-b", file_name: "selected-b.md", is_directory: false },
			],
			list: [
				{ file_id: "file-a", file_name: "selected-a.md", is_directory: false },
				{ file_id: "file-b", file_name: "selected-b.md", is_directory: false },
			],
		})
		const { rerender } = render(
			<FileShareModal
				types={[ShareType.PasswordProtected]}
				projectId="project-1"
				resourceId="share-a"
			/>,
		)

		await waitFor(() =>
			expect(mocks.getShareInfoByCode).toHaveBeenCalledWith({ code: "share-a" }),
		)
		rerender(
			<FileShareModal
				types={[ShareType.PasswordProtected]}
				projectId="project-1"
				resourceId="share-b"
			/>,
		)

		await waitFor(() =>
			expect(mocks.getShareInfoByCode).toHaveBeenCalledWith({ code: "share-b" }),
		)
		fireEvent.click(screen.getByTestId("save-share"))

		await waitFor(() => {
			expect(mocks.createOrUpdateShareResource).toHaveBeenCalledWith(
				expect.objectContaining({ resource_id: "share-b", file_ids: ["file-b"] }),
			)
		})
	})

	it("passes metadata returned by save response to the success callback", async () => {
		const onSaveSuccess = vi.fn()
		mocks.createOrUpdateShareResource.mockResolvedValue({
			file_ids: ["file-transcript"],
			created_at: "2026-07-14 09:30:00",
			updated_at: "2026-07-14 10:45:00",
			view_count: 8,
		})

		render(
			<FileShareModal
				types={[ShareType.PasswordProtected]}
				projectId="project-1"
				projectName="Demo Project"
				attachments={[
					{
						file_id: "file-transcript",
						file_name: "session-transcript.md",
						is_directory: false,
					},
				]}
				defaultSelectedFileIds={["file-transcript"]}
				onSaveSuccess={onSaveSuccess}
			/>,
		)

		fireEvent.change(screen.getByTestId("share-name-input"), {
			target: { value: "Recording Share" },
		})
		fireEvent.click(screen.getByTestId("save-share"))

		await waitFor(() => {
			expect(onSaveSuccess).toHaveBeenCalledWith(
				expect.objectContaining({
					createdAt: "2026-07-14 09:30:00",
					updatedAt: "2026-07-14 10:45:00",
					viewCount: 8,
				}),
			)
		})
	})

	it("项目分享只展示允许的分享方式，并按可用方式提交", async () => {
		mocks.functionPermissions = {
			"project.share_password": false,
			"project.share_public": true,
			"project.share_team": false,
		}

		render(
			<FileShareModal
				types={[ShareType.PasswordProtected, ShareType.Public, ShareType.Organization]}
				shareMode={ShareMode.Project}
				projectId="project-1"
				projectName="Demo Project"
				attachments={[]}
			/>,
		)

		await waitFor(() => {
			expect(screen.getByTestId("share-type-field")).toHaveAttribute(
				"data-value",
				String(ShareType.Public),
			)
		})
		expect(screen.getByTestId("share-type-field")).toHaveAttribute(
			"data-permitted-types",
			String(ShareType.Public),
		)

		fireEvent.change(screen.getByTestId("share-name-input"), {
			target: { value: "Demo Project" },
		})
		fireEvent.click(screen.getByTestId("save-share"))

		await waitFor(() => {
			expect(mocks.createOrUpdateShareResource).toHaveBeenCalledWith(
				expect.objectContaining({ share_type: ShareType.Public, share_project: true }),
			)
		})
	})

	it("PC 项目内文件分享同步应用项目分享方式权限", async () => {
		mocks.functionPermissions = {
			"project.share_password": false,
			"project.share_public": true,
			"project.share_team": false,
		}

		render(
			<FileShareModal
				types={[ShareType.PasswordProtected, ShareType.Public, ShareType.Organization]}
				shareMode={ShareMode.File}
				projectId="project-1"
				projectName="Demo Project"
				attachments={[]}
			/>,
		)

		await waitFor(() => {
			expect(screen.getByTestId("share-type-field")).toHaveAttribute(
				"data-value",
				String(ShareType.Public),
			)
		})
		expect(screen.getByTestId("share-type-field")).toHaveAttribute(
			"data-permitted-types",
			String(ShareType.Public),
		)
	})

	it("微应用内文件分享使用微应用分享方式权限", async () => {
		mocks.functionPermissions = {
			"micro_app.share_password": false,
			"micro_app.share_public": false,
			"micro_app.share_team": true,
			"project.share_password": true,
			"project.share_public": false,
			"project.share_team": false,
		}

		render(
			<SharePermissionResourceProvider value="microApp">
				<FileShareModal
					types={[ShareType.PasswordProtected, ShareType.Public, ShareType.Organization]}
					shareMode={ShareMode.File}
					projectId="project-1"
					projectName="Demo Project"
					attachments={[]}
				/>
			</SharePermissionResourceProvider>,
		)

		await waitFor(() => {
			expect(screen.getByTestId("share-type-field")).toHaveAttribute(
				"data-value",
				String(ShareType.Organization),
			)
		})
		expect(screen.getByTestId("share-type-field")).toHaveAttribute(
			"data-permitted-types",
			String(ShareType.Organization),
		)
	})

	it("管理员未开放任何项目分享方式时禁用保存", async () => {
		mocks.functionPermissions = {
			"project.share_password": false,
			"project.share_public": false,
			"project.share_team": false,
		}

		render(
			<FileShareModal
				types={[ShareType.PasswordProtected, ShareType.Public, ShareType.Organization]}
				shareMode={ShareMode.Project}
				projectId="project-1"
				projectName="Demo Project"
				attachments={[]}
			/>,
		)

		expect(await screen.findByText("share.noAvailableShareMethods")).toBeInTheDocument()
		expect(screen.getByTestId("save-share")).toBeDisabled()
	})
})
