import { describe, expect, it, vi } from "vitest"
import { PPTPathMappingService } from "../PPTPathMappingService"

vi.mock("@/pages/superMagic/utils/api", () => ({
	getTemporaryDownloadUrl: vi.fn(),
}))

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

	it("keeps the leading project folder when the directory path starts with slash", () => {
		const service = new PPTPathMappingService(
			{
				mainFileId: "deck-folder",
				mainFileName: "超级麦吉产品介绍-标准版",
				attachmentList: [
					{
						file_id: "deck-folder",
						file_name: "超级麦吉产品介绍-标准版",
						is_directory: true,
						relative_file_path: "/超级麦吉产品介绍-标准版",
						children: [
							{
								file_id: "philosophy-file",
								file_name: "philosophy.html",
								relative_file_path: "/超级麦吉产品介绍-标准版/philosophy.html",
							},
						],
					},
				],
			},
			createLogger(),
		)

		expect(service.extractFileIdFromPath("philosophy.html")).toBe("philosophy-file")
		expect(service.getFullRelativePath("philosophy.html")).toBe(
			"/超级麦吉产品介绍-标准版/philosophy.html",
		)
	})
})
