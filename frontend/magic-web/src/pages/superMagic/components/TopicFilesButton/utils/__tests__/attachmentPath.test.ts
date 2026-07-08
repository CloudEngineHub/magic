import { beforeEach, describe, expect, it, vi } from "vitest"
import magicToast from "@/components/base/MagicToaster/utils"
import { clipboard } from "@/utils/clipboard-helpers"
import type { AttachmentItem } from "../../hooks/types"
import { buildAttachmentIndex } from "../attachmentIndex"
import { copyAttachmentPath, getCopyableAttachmentPath } from "../attachmentPath"

vi.mock("@/components/base/MagicToaster/utils", () => ({
	default: {
		success: vi.fn(),
		error: vi.fn(),
	},
}))

vi.mock("@/utils/clipboard-helpers", () => ({
	clipboard: {
		writeText: vi.fn(),
	},
}))

const t = (key: string) => key

describe("attachmentPath", () => {
	beforeEach(() => {
		vi.mocked(clipboard.writeText).mockReset()
		vi.mocked(magicToast.success).mockReset()
		vi.mocked(magicToast.error).mockReset()
		vi.mocked(clipboard.writeText).mockResolvedValue(undefined)
	})

	it("prefers relative_file_path", () => {
		const file: AttachmentItem = {
			file_id: "file-1",
			name: "report.md",
			is_directory: false,
			relative_file_path: "/docs/report.md",
		}

		expect(getCopyableAttachmentPath(file)).toBe("/docs/report.md")
	})

	it("uses tree index path when a folder has no relative_file_path", () => {
		const childFolder: AttachmentItem = {
			file_id: "folder-2",
			name: "reports",
			is_directory: true,
			children: [],
		}
		const attachments: AttachmentItem[] = [
			{
				file_id: "folder-1",
				name: "docs",
				is_directory: true,
				children: [childFolder],
			},
		]

		expect(getCopyableAttachmentPath(childFolder, buildAttachmentIndex(attachments))).toBe(
			"/docs/reports/",
		)
	})

	it("falls back to path-like fields when relative_file_path is missing", () => {
		const file: AttachmentItem = {
			file_id: "file-1",
			name: "fallback-name.md",
			is_directory: false,
			file_key: "/from-file-key.md",
		}

		expect(getCopyableAttachmentPath(file)).toBe("/from-file-key.md")
	})

	it("copies resolved path and shows success toast", async () => {
		const file: AttachmentItem = {
			file_id: "file-1",
			name: "report.md",
			is_directory: false,
			relative_file_path: "/docs/report.md",
		}

		await copyAttachmentPath({ item: file, t })

		expect(clipboard.writeText).toHaveBeenCalledWith("/docs/report.md")
		expect(magicToast.success).toHaveBeenCalledWith("topicFiles.contextMenu.copyPathSuccess")
	})

	it("shows failure toast without writing an empty path", async () => {
		const file: AttachmentItem = {
			file_id: "file-1",
			is_directory: false,
		}

		await copyAttachmentPath({ item: file, t })

		expect(clipboard.writeText).not.toHaveBeenCalled()
		expect(magicToast.error).toHaveBeenCalledWith("topicFiles.contextMenu.copyPathFailed")
	})
})
