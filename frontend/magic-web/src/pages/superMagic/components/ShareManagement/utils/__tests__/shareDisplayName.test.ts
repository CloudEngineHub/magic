import { describe, expect, it } from "vitest"
import { getShareDisplayName } from "../shareTypeHelpers"

describe("getShareDisplayName", () => {
	it.each([
		["文件分享_产品方案.pdf", "产品方案.pdf"],
		["File Share_Product plan.pdf", "Product plan.pdf"],
	])("removes localized file-share prefixes from %s", (name, expected) => {
		expect(getShareDisplayName(name, "file")).toBe(expected)
	})

	it.each([
		["项目分享_市场分析", "市场分析"],
		["Project Share_Market analysis", "Market analysis"],
	])("removes localized project-share prefixes from %s", (name, expected) => {
		expect(getShareDisplayName(name, "project")).toBe(expected)
	})

	it("does not remove a prefix belonging to another share kind", () => {
		expect(getShareDisplayName("项目分享_市场分析", "file")).toBe("项目分享_市场分析")
	})
})
