import { describe, expect, it } from "vitest"
import { replaceHtmlResourceUrls } from "../htmlResourceReplacement"

function replaceResource({
	htmlContent,
	path,
	url,
	tag = "img",
	attr = "src",
}: {
	htmlContent: string
	path: string
	url: string
	tag?: string
	attr?: string
}) {
	return replaceHtmlResourceUrls({
		fileIds: ["file-1"],
		preloadedUrlMapping: new Map([["file-1", url]]),
		imageFileIds: new Set(),
		fileUpdatedAtMap: new Map(),
		htmlContent,
		urlMap: new Map([
			[
				"file-1",
				{
					path,
					tag,
					attr,
				},
			],
		]),
		filePathMap: new Map(),
		allFiles: [],
		relativeFolderPath: "",
	})
}

describe("replaceHtmlResourceUrls", () => {
	it("escapes replacement URLs and original paths before writing HTML attributes", async () => {
		const path = 'assets/report" onerror="alert(1)&.png'
		const url = 'https://cdn.example.com/image.png?x=" onerror="alert(2)&y=<tag>'

		const result = await replaceResource({
			htmlContent: `<img src='${path}'>`,
			path,
			url,
		})

		expect(result.content).toBe(
			'<img src="https://cdn.example.com/image.png?x=&quot; onerror=&quot;alert(2)&amp;y=&lt;tag&gt;" data-original-path="assets/report&quot; onerror=&quot;alert(1)&amp;.png">',
		)
		expect(result.content).not.toContain('data-original-path="assets/report" onerror=')

		const image = new DOMParser()
			.parseFromString(result.content, "text/html")
			.querySelector("img")
		expect(image?.getAttribute("src")).toBe(url)
		expect(image?.getAttribute("data-original-path")).toBe(path)
		expect(image?.hasAttribute("onerror")).toBe(false)
	})

	it("uses the common escaped attribute replacement for object data", async () => {
		const path = 'assets/document" onload="alert(1)&.pdf'
		const url = 'https://cdn.example.com/document.pdf?x=" onerror="alert(2)&y=<tag>'
		const result = await replaceResource({
			htmlContent: `<object data='${path}'></object>`,
			path,
			url,
			tag: "object",
			attr: "data",
		})

		expect(result.content).toBe(
			'<object data="https://cdn.example.com/document.pdf?x=&quot; onerror=&quot;alert(2)&amp;y=&lt;tag&gt;" data-original-path="assets/document&quot; onload=&quot;alert(1)&amp;.pdf"></object>',
		)

		const object = new DOMParser()
			.parseFromString(result.content, "text/html")
			.querySelector("object")
		expect(object?.getAttribute("data")).toBe(url)
		expect(object?.getAttribute("data-original-path")).toBe(path)
		expect(object?.hasAttribute("onerror")).toBe(false)
		expect(object?.hasAttribute("onload")).toBe(false)
	})
})
