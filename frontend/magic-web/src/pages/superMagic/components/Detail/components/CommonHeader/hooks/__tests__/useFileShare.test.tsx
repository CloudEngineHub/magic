import { act, renderHook } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { useFileShare } from "../useFileShare"

const mockFindSimilarShares = vi.hoisted(() => vi.fn())

vi.mock("@/apis", () => ({
	SuperMagicApi: {
		findSimilarShares: mockFindSimilarShares,
	},
}))

vi.mock("react-i18next", () => ({
	useTranslation: () => ({ t: (key: string) => key }),
}))

describe("useFileShare", () => {
	beforeEach(() => {
		mockFindSimilarShares.mockReset()
		mockFindSimilarShares.mockResolvedValue([])
	})

	it("shares an explicitly selected folder instead of the initial file", async () => {
		const folder = {
			file_id: "post-folder-id",
			file_name: "post-1",
			is_directory: true,
		}
		const { result } = renderHook(() =>
			useFileShare({
				currentFile: { id: "initial-file-id", name: "initial.html", type: "file" },
				attachments: [folder],
			}),
		)

		await act(async () => {
			await result.current.handleShare({
				id: "post-folder-id",
				name: "post-1",
				type: "folder",
				projectId: "project-1",
			})
		})

		expect(mockFindSimilarShares).toHaveBeenCalledWith({ file_ids: ["post-folder-id"] })
		expect(result.current.shareFileId).toBe("post-folder-id")
		expect(result.current.shareTarget).toEqual({
			id: "post-folder-id",
			name: "post-1",
			type: "folder",
			projectId: "project-1",
		})
		expect(result.current.shareModalVisible).toBe(true)
	})
})
