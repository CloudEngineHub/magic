import { renderHook, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { useSingleHtmlStaticDependencies } from "../useSingleHtmlStaticDependencies"
import { resolveSingleHtmlStaticDependencies } from "@/pages/superMagic/utils/htmlStaticDependencies"

vi.mock("@/pages/superMagic/utils/htmlStaticDependencies", () => ({
	resolveSingleHtmlStaticDependencies: vi.fn(),
}))

const resolvedDependencies = {
	isHtml: true,
	dependencyFileIds: ["image-1"],
	dependencyTransferFileIds: ["image-1"],
}

describe("useSingleHtmlStaticDependencies", () => {
	beforeEach(() => {
		vi.clearAllMocks()
		vi.mocked(resolveSingleHtmlStaticDependencies).mockResolvedValue(resolvedDependencies)
	})

	it("re-analyzes when attachment paths change without changing the root count", async () => {
		const { rerender } = renderHook(
			({ attachments }) =>
				useSingleHtmlStaticDependencies({
					active: true,
					fileIds: ["index-html"],
					attachments,
				}),
			{
				initialProps: {
					attachments: [
						{
							file_id: "index-html",
							file_name: "index.html",
							file_extension: "html",
							relative_file_path: "site/index.html",
						},
					],
				},
			},
		)

		await waitFor(() => {
			expect(resolveSingleHtmlStaticDependencies).toHaveBeenCalledTimes(1)
		})

		rerender({
			attachments: [
				{
					file_id: "index-html",
					file_name: "index.html",
					file_extension: "html",
					relative_file_path: "updated/index.html",
				},
			],
		})

		await waitFor(() => {
			expect(resolveSingleHtmlStaticDependencies).toHaveBeenCalledTimes(2)
		})
		expect(resolveSingleHtmlStaticDependencies).toHaveBeenLastCalledWith(
			expect.objectContaining({
				attachments: [
					expect.objectContaining({ relative_file_path: "updated/index.html" }),
				],
			}),
		)
	})
})
