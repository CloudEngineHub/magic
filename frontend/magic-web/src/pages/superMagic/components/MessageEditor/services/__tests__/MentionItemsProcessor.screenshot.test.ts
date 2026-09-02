import { beforeEach, describe, expect, it, vi } from "vitest"
import { MentionItemType } from "@/components/business/MentionPanel/types"
import { MentionItemsProcessor } from "../MentionItemsProcessor"

const mocks = vi.hoisted(() => ({
	saveTempFilesToProject: vi.fn(),
	uploadStoredScreenshot: vi.fn(),
}))

vi.mock("../UploadTokenService", () => ({
	superMagicUploadTokenService: {
		saveTempFilesToProject: mocks.saveTempFilesToProject,
	},
}))
vi.mock("../HtmlScreenshotUploadService", () => ({
	htmlScreenshotUploadService: {
		uploadStoredScreenshot: mocks.uploadStoredScreenshot,
	},
}))
vi.mock("@/apis", () => ({ SuperMagicApi: {} }))
vi.mock("@/pages/superMagic/services", () => ({
	loadProjectAttachments: vi.fn().mockResolvedValue({ list: [] }),
}))

describe("MentionItemsProcessor screenshot handling", () => {
	beforeEach(() => {
		vi.clearAllMocks()
	})

	it("keeps screenshots out of the regular workspace temp-file flow", async () => {
		mocks.saveTempFilesToProject.mockResolvedValue([])
		mocks.uploadStoredScreenshot.mockResolvedValue({
			file_id: "saved-screenshot",
			file_key: "oss/screenshot.png",
			file_name: "screenshot.png",
			file_size: 3,
			relative_file_path: "screenshot.png",
			project_id: "project-1",
		})

		const screenshot = {
			type: "mention",
			attrs: {
				type: MentionItemType.UPLOAD_FILE,
				data: {
					file_id: "storage-1",
					file_name: "screenshot.png",
					file_extension: "png",
					file_path: "storage-1",
					file_size: 3,
					is_html_screenshot: true,
					storage_id: "storage-1",
				},
			},
		} as const

		const result = await new MentionItemsProcessor().processMentionItems(
			{ type: "doc", content: [screenshot] },
			[screenshot],
			"project-1",
			"topic-1",
		)

		expect(mocks.saveTempFilesToProject).not.toHaveBeenCalled()
		expect(mocks.uploadStoredScreenshot).toHaveBeenCalledWith({
			storageId: "storage-1",
			fileName: "screenshot.png",
			projectId: "project-1",
			topicId: "topic-1",
		})
		expect(result.mentionItems[0].attrs.type).toBe(MentionItemType.PROJECT_FILE)
		expect(result.content.content?.[0].attrs?.type).toBe(MentionItemType.PROJECT_FILE)
		expect(result.mentionItems[0].attrs.data).toMatchObject({
			file_id: "saved-screenshot",
			file_path: "screenshot.png",
		})
		expect(result.mentionItems[0].attrs.data).not.toMatchObject({
			storage_id: "storage-1",
		})
		expect(result.mentionItems[0].attrs.data).not.toMatchObject({
			file_id: "storage-1",
		})
	})

	it("still uploads a screenshot when the send path has no topic id", async () => {
		mocks.saveTempFilesToProject.mockResolvedValue([])
		mocks.uploadStoredScreenshot.mockResolvedValue({
			file_id: "saved-screenshot",
			file_key: "oss/screenshot.png",
			file_name: "screenshot.png",
			file_size: 3,
			relative_file_path: "screenshot.png",
			project_id: "project-1",
		})

		const screenshot = {
			type: "mention",
			attrs: {
				type: MentionItemType.UPLOAD_FILE,
				data: {
					file_id: "storage-1",
					file_name: "screenshot.png",
					file_extension: "png",
					file_path: "storage-1",
					file_size: 3,
					is_html_screenshot: true,
					storage_id: "storage-1",
				},
			},
		} as const

		const result = await new MentionItemsProcessor().processMentionItems(
			{ type: "doc", content: [screenshot] },
			[screenshot],
			"project-1",
		)

		expect(mocks.uploadStoredScreenshot).toHaveBeenCalledWith({
			storageId: "storage-1",
			fileName: "screenshot.png",
			projectId: "project-1",
			topicId: undefined,
		})
		expect(result.mentionItems[0].attrs.type).toBe(MentionItemType.PROJECT_FILE)
		expect(result.mentionItems[0].attrs.data).toMatchObject({
			file_id: "saved-screenshot",
		})
	})
})
