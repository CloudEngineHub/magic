import { describe, expect, it } from "vitest"
import { extractFilePathsFromContent } from "../attachmentByFilePath"

const bareClosingBracketPath = "team/active] 20260629/review-schedule.html"

describe("extractFilePathsFromContent", () => {
	it("extracts simple and bracketed file path mentions", () => {
		const content =
			"See [@file_path:docs/a.md] and [@file_path:team/[active]/b.html] in the message"
		expect(extractFilePathsFromContent(content)).toEqual(["docs/a.md", "team/[active]/b.html"])
	})

	it("extracts quoted mentions when the path contains bare closing brackets", () => {
		expect(extractFilePathsFromContent(`[@file_path:"${bareClosingBracketPath}"]`)).toEqual([
			bareClosingBracketPath,
		])
	})

	it("requires quotes when the path contains bare closing brackets", () => {
		expect(extractFilePathsFromContent(`[@file_path:${bareClosingBracketPath}]`)).toEqual([
			"team/active",
		])
	})
})
