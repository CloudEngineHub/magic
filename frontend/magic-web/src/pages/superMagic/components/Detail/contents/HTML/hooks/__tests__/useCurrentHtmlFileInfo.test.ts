import { renderHook } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { useCurrentHtmlFileInfo } from "../useCurrentHtmlFileInfo"

describe("useCurrentHtmlFileInfo", () => {
	it("keeps the same object when attachment tree changes but current html file fields do not", () => {
		const firstAttachments = [
			{
				file_id: "app-dir",
				file_name: "app",
				relative_file_path: "app",
				is_directory: true,
				children: [
					{
						file_id: "html-1",
						file_name: "index.html",
						parent_id: "app-dir",
						relative_file_path: "app/index.html",
						updated_at: "2026-06-24T00:00:00Z",
					},
				],
			},
		]
		const secondAttachments = [
			{
				file_id: "app-dir",
				file_name: "app",
				relative_file_path: "app",
				is_directory: true,
				children: [
					{
						file_id: "html-1",
						file_name: "index.html",
						parent_id: "app-dir",
						relative_file_path: "app/index.html",
						updated_at: "2026-06-24T00:00:00Z",
					},
					{
						file_id: "other-file",
						file_name: "data.json",
						relative_file_path: "app/data.json",
						updated_at: "2026-06-24T01:00:00Z",
					},
				],
			},
		]

		const { result, rerender } = renderHook(
			({ attachmentList }) =>
				useCurrentHtmlFileInfo({
					attachmentList,
					fileId: "html-1",
				}),
			{ initialProps: { attachmentList: firstAttachments } },
		)

		const firstResult = result.current

		rerender({ attachmentList: secondAttachments })

		expect(result.current).toBe(firstResult)
		expect(result.current.relativeFilePath).toBe("app/index.html")
		expect(result.current.htmlRelativeFolderPath).toBe("app/")
	})

	it("returns a new object when current html file path or updated_at changes", () => {
		const makeAttachments = (relativePath: string, updatedAt: string) => [
			{
				file_id: "html-1",
				file_name: "index.html",
				parent_id: "root",
				relative_file_path: relativePath,
				updated_at: updatedAt,
			},
		]

		const { result, rerender } = renderHook(
			({ attachmentList }) =>
				useCurrentHtmlFileInfo({
					attachmentList,
					fileId: "html-1",
				}),
			{ initialProps: { attachmentList: makeAttachments("app/index.html", "v1") } },
		)

		const firstResult = result.current

		rerender({ attachmentList: makeAttachments("app/index.html", "v2") })
		const secondResult = result.current

		expect(secondResult).not.toBe(firstResult)
		expect(secondResult.updatedAt).toBe("v2")

		rerender({ attachmentList: makeAttachments("renamed/index.html", "v2") })

		expect(result.current).not.toBe(secondResult)
		expect(result.current.relativeFilePath).toBe("renamed/index.html")
		expect(result.current.htmlRelativeFolderPath).toBe("renamed/")
	})
})
