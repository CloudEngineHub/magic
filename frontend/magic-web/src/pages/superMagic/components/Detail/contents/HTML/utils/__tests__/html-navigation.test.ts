import { describe, expect, it } from "vitest"
import {
	getHtmlNavigationKey,
	isHtmlPreviewShellNavigation,
	normalizeHtmlPreviewPath,
	parseHtmlNavigationRequest,
	resolveRootHtmlIndexFallback,
} from "../html-navigation"

describe("parseHtmlNavigationRequest", () => {
	it("separates a relative path, query, hash, and normalized anchor", () => {
		expect(
			parseHtmlNavigationRequest("./detail.html?reportId=123&source=home#Summary"),
		).toEqual({
			filePath: "./detail.html",
			search: "?reportId=123&source=home",
			hash: "#Summary",
			anchor: "summary",
		})
	})

	it("supports same-document query and hash navigation", () => {
		expect(parseHtmlNavigationRequest("?mode=preview#result")).toEqual({
			filePath: "",
			search: "?mode=preview",
			hash: "#result",
			anchor: "result",
		})
	})

	it("converts same-origin absolute URLs to a matchable path", () => {
		expect(
			parseHtmlNavigationRequest(
				"https://app.example.test/pages/detail.html?reportId=123#result",
				"https://app.example.test/pages/index.html",
			),
		).toEqual({
			filePath: "/pages/detail.html",
			search: "?reportId=123",
			hash: "#result",
			anchor: "result",
		})
	})

	it("rejects external and non-document URLs", () => {
		expect(
			parseHtmlNavigationRequest(
				"https://external.example.test/detail.html?reportId=123",
				"https://app.example.test/pages/index.html",
			),
		).toBeNull()
		expect(parseHtmlNavigationRequest("mailto:user@example.test")).toBeNull()
	})

	it("changes when the same file receives a new navigation state", () => {
		const first = {
			filePath: "page1.html",
			search: "?value=123",
			hash: "",
			anchor: "",
		}
		const second = { ...first, search: "?value=456" }

		expect(getHtmlNavigationKey(first)).not.toBe(getHtmlNavigationKey(second))
		expect(getHtmlNavigationKey()).toBe("")
	})
})

describe("isHtmlPreviewShellNavigation", () => {
	it("treats same-document husky shell rewrites as non-user navigation", () => {
		expect(isHtmlPreviewShellNavigation("/husky.html")).toBe(true)
		expect(isHtmlPreviewShellNavigation("husky.html")).toBe(true)
		expect(isHtmlPreviewShellNavigation("https://app.example.test/husky.html")).toBe(true)
		expect(
			isHtmlPreviewShellNavigation(
				"https://husky.example/index.html",
				"https://husky.example/index.html",
			),
		).toBe(true)
	})

	it("keeps project HTML files as user navigation", () => {
		expect(isHtmlPreviewShellNavigation("cover.html")).toBe(false)
		expect(isHtmlPreviewShellNavigation("/slides/cover.html")).toBe(false)
		expect(isHtmlPreviewShellNavigation("./2 新建幻灯片 2.html")).toBe(false)
	})

	it("does not treat project files named husky.html as the preview shell", () => {
		expect(isHtmlPreviewShellNavigation("slides/husky.html")).toBe(false)
		expect(isHtmlPreviewShellNavigation("/slides/husky.html")).toBe(false)
		expect(isHtmlPreviewShellNavigation("./husky.html")).toBe(false)
		expect(
			isHtmlPreviewShellNavigation("slides/husky.html", "https://husky.example/index.html"),
		).toBe(false)
	})

	it("does not block project index.html links when using an external index.html shell", () => {
		const shell = "https://husky.example/index.html"
		expect(isHtmlPreviewShellNavigation("index.html", shell)).toBe(false)
		expect(isHtmlPreviewShellNavigation("./index.html", shell)).toBe(false)
		expect(isHtmlPreviewShellNavigation("/index.html", shell)).toBe(false)
		expect(isHtmlPreviewShellNavigation("https://other.example/index.html", shell)).toBe(false)
	})
})

describe("html preview path matching", () => {
	it("normalizes slashes, leading dots, and repeated relative prefixes", () => {
		expect(normalizeHtmlPreviewPath("\\index.html")).toBe("index.html")
		expect(normalizeHtmlPreviewPath("././index.html")).toBe("index.html")
		expect(normalizeHtmlPreviewPath("/admin/index.html")).toBe("admin/index.html")
	})

	it("only falls back to a unique root index.html path", () => {
		const nested = {
			file_id: "nested",
			file_name: "index.html",
			relative_file_path: "admin/index.html",
		}
		const emptyPath = {
			file_id: "empty",
			file_name: "index.html",
			relative_file_path: "",
		}
		const root = {
			file_id: "root",
			file_name: "index.html",
			relative_file_path: "index.html",
		}

		expect(resolveRootHtmlIndexFallback("index.html", [nested, emptyPath])).toBeUndefined()
		expect(resolveRootHtmlIndexFallback("index.html", [nested, emptyPath, root])).toEqual(root)
		expect(resolveRootHtmlIndexFallback("pages/home.html", [root])).toBeUndefined()
	})
})
