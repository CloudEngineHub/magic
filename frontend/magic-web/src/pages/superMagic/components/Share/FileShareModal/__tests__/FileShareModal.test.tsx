import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import FileShareModal from "../FileShareModal"
import { ShareType } from "../../types"

const mocks = vi.hoisted(() => ({
	getSnowflakeIds: vi.fn(),
	createOrUpdateShareResource: vi.fn(),
	getShareInfoByCode: vi.fn(),
	getAttachmentsByProjectId: vi.fn(),
	batchGetFileDetails: vi.fn(),
	writeText: vi.fn(),
	successToast: vi.fn(),
	errorToast: vi.fn(),
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
	SuperMagicApi: {
		getSnowflakeIds: mocks.getSnowflakeIds,
		createOrUpdateShareResource: mocks.createOrUpdateShareResource,
		getShareInfoByCode: mocks.getShareInfoByCode,
		getAttachmentsByProjectId: mocks.getAttachmentsByProjectId,
		batchGetFileDetails: mocks.batchGetFileDetails,
	},
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
	},
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
	default: ({ onSave }: { onSave: () => void }) => (
		<button data-testid="save-share" onClick={onSave}>
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
	ShareTypeField: () => null,
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
			expect(mocks.createOrUpdateShareResource).toHaveBeenCalledWith(
				expect.objectContaining({
					resource_id: "share-existing",
					file_ids: ["file-transcript", "file-audio", "file-magic-project"],
				}),
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
})
