import { renderHook, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { resolveSingleDocumentStaticDependencies } from "@/pages/superMagic/utils/staticDependencies"
import { useSingleDocumentStaticDependencies } from "../useSingleDocumentStaticDependencies"

vi.mock("@/pages/superMagic/utils/staticDependencies", () => ({
	resolveSingleDocumentStaticDependencies: vi.fn(),
}))

const resolvedDependencies = {
	fileType: "markdown" as const,
	dependencyFileIds: ["image-1"],
	dependencyTransferFileIds: ["assets-folder"],
	missingResourcePaths: [],
}

describe("useSingleDocumentStaticDependencies", () => {
	beforeEach(() => {
		vi.clearAllMocks()
		vi.mocked(resolveSingleDocumentStaticDependencies).mockResolvedValue(resolvedDependencies)
	})

	it("re-analyzes when the attachment tree changes", async () => {
		const { rerender } = renderHook(
			({ attachments }) =>
				useSingleDocumentStaticDependencies({
					active: true,
					fileIds: ["readme-md"],
					attachments,
				}),
			{
				initialProps: {
					attachments: [
						{
							file_id: "readme-md",
							file_name: "README.md",
							file_extension: "md",
							relative_file_path: "docs/README.md",
						},
					],
				},
			},
		)

		await waitFor(() => {
			expect(resolveSingleDocumentStaticDependencies).toHaveBeenCalledTimes(1)
		})

		rerender({
			attachments: [
				{
					file_id: "readme-md",
					file_name: "README.md",
					file_extension: "md",
					relative_file_path: "updated/README.md",
				},
			],
		})

		await waitFor(() => {
			expect(resolveSingleDocumentStaticDependencies).toHaveBeenCalledTimes(2)
		})
		expect(resolveSingleDocumentStaticDependencies).toHaveBeenLastCalledWith(
			expect.objectContaining({
				attachments: [expect.objectContaining({ relative_file_path: "updated/README.md" })],
			}),
		)
	})
})
