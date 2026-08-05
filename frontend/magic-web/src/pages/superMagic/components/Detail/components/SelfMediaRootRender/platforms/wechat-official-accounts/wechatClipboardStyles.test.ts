import { afterEach, describe, expect, it, vi } from "vitest"
import { prepareWechatExternalStylesheets } from "./wechatClipboardStyles"

function parseDocument(head: string): Document {
	return new DOMParser().parseFromString(
		`<html><head>${head}</head><body></body></html>`,
		"text/html",
	)
}

describe("wechatClipboardStyles", () => {
	afterEach(() => {
		vi.restoreAllMocks()
		vi.unstubAllGlobals()
	})

	it("rejects articles with more than 12 external stylesheet resources", async () => {
		const fetchMock = vi.fn().mockResolvedValue({ ok: true, text: () => Promise.resolve("") })
		vi.stubGlobal("fetch", fetchMock)
		const links = Array.from(
			{ length: 13 },
			(_, index) => `<link rel="stylesheet" href="https://cdn.example.com/${index}.css">`,
		).join("")

		await expect(prepareWechatExternalStylesheets(parseDocument(links))).rejects.toThrow(
			"stylesheetResourceLimitExceeded",
		)
		expect(fetchMock).not.toHaveBeenCalled()
	})

	it("limits stylesheet fetch concurrency to four requests", async () => {
		let activeRequests = 0
		let maxActiveRequests = 0
		vi.stubGlobal(
			"fetch",
			vi.fn(
				() =>
					new Promise((resolve) => {
						activeRequests += 1
						maxActiveRequests = Math.max(maxActiveRequests, activeRequests)
						setTimeout(() => {
							activeRequests -= 1
							resolve({
								ok: true,
								text: () => Promise.resolve(".card { color: red; }"),
							})
						}, 0)
					}),
			),
		)
		const links = Array.from(
			{ length: 8 },
			(_, index) => `<link rel="stylesheet" href="https://cdn.example.com/${index}.css">`,
		).join("")
		await prepareWechatExternalStylesheets(parseDocument(links))

		expect(maxActiveRequests).toBe(4)
	})

	it("rejects a stylesheet whose declared size exceeds 512 KiB", async () => {
		const textMock = vi.fn().mockResolvedValue(".card { color: red; }")
		vi.stubGlobal(
			"fetch",
			vi.fn().mockResolvedValue({
				headers: new Headers({ "content-length": String(512 * 1024 + 1) }),
				ok: true,
				text: textMock,
			}),
		)

		await expect(
			prepareWechatExternalStylesheets(
				parseDocument('<link rel="stylesheet" href="https://cdn.example.com/main.css">'),
			),
		).rejects.toThrow("stylesheetResourceLimitExceeded")
		expect(textMock).not.toHaveBeenCalled()
	})

	it("cancels streamed stylesheet reads when the total CSS limit is exceeded", async () => {
		const cancelMock = vi.fn().mockResolvedValue(undefined)
		let readCount = 0
		vi.stubGlobal(
			"fetch",
			vi.fn().mockResolvedValue({
				headers: new Headers(),
				ok: true,
				body: {
					getReader: () => ({
						cancel: cancelMock,
						read: () => {
							readCount += 1
							return Promise.resolve({
								done: false,
								value: new Uint8Array(300 * 1024),
							})
						},
					}),
				},
			}),
		)

		await expect(
			prepareWechatExternalStylesheets(
				parseDocument('<link rel="stylesheet" href="https://cdn.example.com/main.css">'),
			),
		).rejects.toThrow("stylesheetResourceLimitExceeded")
		expect(readCount).toBe(2)
		expect(cancelMock).toHaveBeenCalledTimes(1)
	})

	it("recursively expands string and url imports relative to each stylesheet", async () => {
		const fetchMock = vi.fn((url: string) => {
			const cssByUrl: Record<string, string> = {
				"https://cdn.example.com/styles/main.css": `
					@import "./base/base.css" screen;
					@import url('./print.css') print;
					.card { color: green; }
				`,
				"https://cdn.example.com/styles/base/base.css":
					'.card { color: red; background-image: url("../images/bg.png"); }',
				"https://cdn.example.com/styles/print.css": ".card { color: black; }",
			}
			return Promise.resolve({
				ok: true,
				text: () => Promise.resolve(cssByUrl[url]),
			})
		})
		vi.stubGlobal("fetch", fetchMock)

		const [stylesheet] = await prepareWechatExternalStylesheets(
			parseDocument('<link rel="stylesheet" href="https://cdn.example.com/styles/main.css">'),
		)

		expect(fetchMock).toHaveBeenCalledWith(
			"https://cdn.example.com/styles/base/base.css",
			expect.objectContaining({ credentials: "omit" }),
		)
		expect(fetchMock).toHaveBeenCalledWith(
			"https://cdn.example.com/styles/print.css",
			expect.objectContaining({ credentials: "omit" }),
		)
		expect(stylesheet.cssText).toContain("@media screen")
		expect(stylesheet.cssText).toContain("@media print")
		expect(stylesheet.cssText).toContain("https://cdn.example.com/styles/images/bg.png")
		expect(stylesheet.cssText.indexOf("color: red")).toBeLessThan(
			stylesheet.cssText.indexOf("color: green"),
		)
		expect(stylesheet.cssText).not.toContain("@import")
	})

	it("resolves imports and assets against the final redirected stylesheet URL", async () => {
		const fetchMock = vi.fn((url: string) =>
			Promise.resolve(
				url.endsWith("latest/main.css")
					? {
							ok: true,
							url: "https://cdn.example.com/v2/main.css",
							text: () =>
								Promise.resolve(
									'@import "./theme.css"; .hero { background-image: url("./images/bg.png"); }',
								),
						}
					: {
							ok: true,
							url,
							text: () => Promise.resolve(".hero { color: green; }"),
						},
			),
		)
		vi.stubGlobal("fetch", fetchMock)

		const [stylesheet] = await prepareWechatExternalStylesheets(
			parseDocument('<link rel="stylesheet" href="https://cdn.example.com/latest/main.css">'),
		)

		expect(fetchMock).toHaveBeenCalledWith(
			"https://cdn.example.com/v2/theme.css",
			expect.objectContaining({ credentials: "omit" }),
		)
		expect(stylesheet.cssText).toContain("https://cdn.example.com/v2/images/bg.png")
	})

	it("rejects circular stylesheet imports instead of returning partial CSS", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn((url: string) =>
				Promise.resolve({
					ok: true,
					text: () =>
						Promise.resolve(
							url.endsWith("a.css") ? '@import "./b.css";' : '@import "./a.css";',
						),
				}),
			),
		)

		await expect(
			prepareWechatExternalStylesheets(
				parseDocument('<link rel="stylesheet" href="https://cdn.example.com/a.css">'),
			),
		).rejects.toThrow("stylesheetImportCycle")
	})
})
