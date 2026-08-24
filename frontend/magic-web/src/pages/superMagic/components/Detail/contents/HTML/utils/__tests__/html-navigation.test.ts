import { describe, expect, it } from "vitest"
import {
	getHtmlNavigationKey,
	getHtmlSandboxNavigationUrl,
	parseHtmlNavigationRequest,
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

	it("puts the latest query and hash on the sandbox shell URL", () => {
		expect(
			getHtmlSandboxNavigationUrl("/husky.html", {
				search: "?value=456",
				hash: "#detail",
			}),
		).toBe("/husky.html?value=456#detail")
		expect(
			getHtmlSandboxNavigationUrl("https://husky.example/husky.html?old=1", {
				search: "?value=789",
				hash: "",
			}),
		).toBe("https://husky.example/husky.html?value=789")
	})
})
