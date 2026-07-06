import { describe, expect, it, vi } from "vitest"
import { PPTPathMappingService } from "../PPTPathMappingService"

function createLogger() {
	return {
		debug: vi.fn(),
		info: vi.fn(),
		warn: vi.fn(),
		error: vi.fn(),
		logOperationStart: vi.fn(),
		logOperationSuccess: vi.fn(),
		logOperationError: vi.fn(),
		updateConfig: vi.fn(),
	} as any
}

describe("PPTPathMappingService", () => {
	it("resolves slide files when the PPT entry is a project folder", () => {
		const service = new PPTPathMappingService(
			{
				mainFileId: "deck-folder",
				mainFileName: "2026前沿UI设计盘点",
				attachmentList: [
					{
						file_id: "deck-folder",
						file_name: "2026前沿UI设计盘点",
						is_directory: true,
						relative_file_path: "deck",
						children: [
							{
								file_id: "cover-file",
								file_name: "cover.html",
								relative_file_path: "deck/cover.html",
							},
						],
					},
				],
			},
			createLogger(),
		)

		expect(service.extractFileIdFromPath("cover.html")).toBe("cover-file")
		expect(service.extractFileIdFromPath("./cover.html")).toBe("cover-file")
		expect(service.getFullRelativePath("cover.html")).toBe("deck/cover.html")
	})
})
