import { describe, expect, it } from "vitest"
import { collectHtmlResourcePlan } from "../htmlResourceCollector"
import { getContentTypeFromExtension } from "../index"

describe("collectHtmlResourcePlan", () => {
	it("classifies resources by file type instead of CSS or HTML location", () => {
		const html = `
			<img src="assets/hero">
			<style>
				@font-face { font-family: Demo; src: url("assets/demo.woff2"); }
				.hero { background-image: url("assets/background.webp"); }
			</style>
			<div style="background-image: url('assets/icon.svg')"></div>
			<script src="assets/app.js"></script>
		`
		const htmlDoc = new DOMParser().parseFromString(html, "text/html")
		const files = [
			{
				file_id: "hero",
				file_name: "hero",
				file_extension: "png",
				relative_file_path: "page/assets/hero",
			},
			{
				file_id: "font",
				file_name: "demo.woff2",
				relative_file_path: "page/assets/demo.woff2",
			},
			{
				file_id: "background",
				file_name: "background.webp",
				relative_file_path: "page/assets/background.webp",
			},
			{
				file_id: "icon",
				file_name: "icon.svg",
				relative_file_path: "page/assets/icon.svg",
			},
			{
				file_id: "script",
				file_name: "app.js",
				relative_file_path: "page/assets/app.js",
			},
		]

		const result = collectHtmlResourcePlan(htmlDoc, files, "page/")

		expect(result.imageFileIds).toEqual(new Set(["hero", "background", "icon"]))
		expect(result.imageFileIds.has("font")).toBe(false)
		expect(result.imageFileIds.has("script")).toBe(false)
		expect(getContentTypeFromExtension("assets/hero.png?version=1")).toBe("image/png")
	})
})
