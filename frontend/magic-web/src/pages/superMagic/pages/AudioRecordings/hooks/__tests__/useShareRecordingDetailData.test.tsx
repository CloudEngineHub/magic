import { renderHook, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { getFileContentById, getTemporaryDownloadUrl } from "@/pages/superMagic/utils/api"
import { useShareRecordingDetailData } from "../useShareRecordingDetailData"

vi.mock("@/pages/superMagic/utils/api", () => ({
	getFileContentById: vi.fn(),
	getTemporaryDownloadUrl: vi.fn(),
}))

/** Creates a fictional authorized attachment for share-detail tests. */
function createAttachment(fileId: string, fileName: string) {
	return {
		file_id: fileId,
		file_name: fileName,
		filename: fileName,
		path: `/${fileName}`,
		relative_file_path: fileName,
		is_directory: false,
		children: [],
	}
}

describe("useShareRecordingDetailData", () => {
	beforeEach(() => {
		vi.mocked(getFileContentById).mockReset()
		vi.mocked(getTemporaryDownloadUrl).mockReset()
	})

	it("filters configured summary tabs that are not present in the authorized share snapshot", async () => {
		const magicProject = createAttachment("share-config-file", "magic.project.js")
		const summary = createAttachment("share-summary-file", "summary.md")
		const audio = createAttachment("share-audio-file", "recording.wav")
		const attachments = {
			tree: [{ ...magicProject, children: [magicProject, summary, audio] }],
			list: [magicProject, summary, audio],
		}
		vi.mocked(getFileContentById).mockImplementation(async (fileId) => {
			if (fileId === "share-config-file") {
				return 'window.magicProjectConfig = { files: { summary: "summary.md", topics: "topics.md" } }'
			}
			if (fileId === "share-summary-file") return "# Shared summary"
			return ""
		})
		vi.mocked(getTemporaryDownloadUrl).mockResolvedValue([
			{ file_id: "share-audio-file", url: "https://example.invalid/shared-audio" },
		])

		const { result } = renderHook(() =>
			useShareRecordingDetailData({
				projectId: "project-share",
				attachments,
			}),
		)

		await waitFor(() => expect(result.current.loading).toBe(false))
		expect(result.current.error).toBe(false)
		expect(result.current.fileMap?.summaryFiles.map((file) => file.type)).toEqual(["summary"])
		expect(result.current.texts.summary.summary?.content).toBe("# Shared summary")
	})
})
