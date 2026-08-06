import { afterEach, describe, expect, it, vi } from "vitest"
import {
	buildWechatClipboardHtmlFromDocument,
	buildWechatClipboardHtmlFromSource,
} from "./wechatClipboardHtml"

describe("wechatClipboardHtml", () => {
	afterEach(() => {
		vi.useRealTimers()
		vi.restoreAllMocks()
		vi.unstubAllGlobals()
	})

	it("inlines external stylesheet rules before building WeChat clipboard HTML", async () => {
		const fetchMock = vi.fn().mockResolvedValue({
			ok: true,
			text: () =>
				Promise.resolve(`
					.article { max-width: 660px; margin: 0 auto; padding: 8px 4px 40px; }
					.lead { color: #e63946; font-weight: 700; margin: 0 0 20px; }
					.banner { width: 100%; height: auto; background-image: url("./images/bg(2).png"); }
				`),
		})
		vi.stubGlobal("fetch", fetchMock)

		const html = await buildWechatClipboardHtmlFromSource(`
			<html>
				<head>
					<link rel="stylesheet" href="https://cdn.example.com/article/styles/main.css" />
				</head>
				<body>
					<main class="article">
						<p class="lead">article</p>
						<img class="banner" src="https://cdn.example.com/article/cover.png" />
					</main>
				</body>
			</html>
		`)

		expect(fetchMock).toHaveBeenCalledWith("https://cdn.example.com/article/styles/main.css", {
			credentials: "omit",
			signal: expect.any(AbortSignal),
		})
		expect(html).toContain("max-width:660px")
		expect(html).toContain("color:rgb(230, 57, 70)")
		expect(html).toContain("font-weight:700")
		expect(html).toContain("width:100%")
		expect(html).toContain("height:auto")
		expect(html).toContain("https://cdn.example.com/article/styles/images/bg%282%29.png")
		expect(html).not.toContain('rel="stylesheet"')
		expect(html).not.toContain("<style")
	})

	it("preserves external stylesheet cascade order", async () => {
		const fetchMock = vi.fn((url: string) =>
			Promise.resolve({
				ok: true,
				text: () =>
					Promise.resolve(
						url.endsWith("base.css")
							? ".lead { color: rgb(230, 57, 70); }"
							: ".lead { color: rgb(7, 193, 96); }",
					),
			}),
		)
		vi.stubGlobal("fetch", fetchMock)

		const html = await buildWechatClipboardHtmlFromSource(`
			<html>
				<head>
					<link rel="stylesheet" href="https://cdn.example.com/base.css" />
					<link rel="stylesheet" href="https://cdn.example.com/theme.css" />
				</head>
				<body><p class="lead">article</p></body>
			</html>
		`)

		expect(html).toContain("color:rgb(7, 193, 96)")
		expect(html).not.toContain("color:rgb(230, 57, 70)")
	})

	it("processes every rule in a CSSRuleList without stopping after the first", () => {
		const sourceDocument = document.implementation.createHTMLDocument("wechat article")
		const styleElement = sourceDocument.createElement("style")
		sourceDocument.head.appendChild(styleElement)
		sourceDocument.body.innerHTML =
			'<p class="lead">article</p><strong class="note">note</strong>'
		const rules = [
			{ type: 1, selectorText: ".lead", style: { cssText: "color: red" } },
			{ type: 1, selectorText: ".note", style: { cssText: "font-weight: 700" } },
		]
		Object.defineProperty(styleElement, "sheet", {
			configurable: true,
			value: {
				cssRules: {
					length: rules.length,
					item: (index: number) => rules[index] || null,
				},
			},
		})

		const html = buildWechatClipboardHtmlFromDocument(sourceDocument) || ""

		expect(html).toContain("color:red")
		expect(html).toContain("font-weight:700")
	})

	it("preserves selector specificity for author width and height rules", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn().mockResolvedValue({
				ok: true,
				text: () =>
					Promise.resolve(`
						img.art-img { width: 100%; height: auto; }
						img { width: 600px; height: 320px; }
					`),
			}),
		)

		const html = await buildWechatClipboardHtmlFromSource(`
			<html>
				<head><link rel="stylesheet" href="https://cdn.example.com/article.css" /></head>
				<body><img class="art-img" src="https://cdn.example.com/image.png" /></body>
			</html>
		`)

		expect(html).toContain("width:100%")
		expect(html).toContain("height:auto")
		expect(html).not.toContain("width:600px")
		expect(html).not.toContain("height:320px")
	})

	it("ignores inactive media styles while preserving active screen rules", async () => {
		const html = await buildWechatClipboardHtmlFromSource(`
			<html>
				<head>
					<style>.lead { width: 100%; }</style>
					<style media="print">.lead { width: 600px; }</style>
					<style>
						@media print { .lead { max-width: 500px; } }
						@media screen { .lead { max-width: 660px; } }
					</style>
				</head>
				<body><p class="lead">article</p></body>
			</html>
		`)

		expect(html).toContain("width:100%")
		expect(html).toContain("max-width:660px")
		expect(html).not.toContain("width:600px")
		expect(html).not.toContain("max-width:500px")
	})

	it("keeps absolute, data, blob, and fragment CSS resource URLs unchanged", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn().mockResolvedValue({
				ok: true,
				text: () =>
					Promise.resolve(`
						.asset {
							background-image: url("data:image/png;base64,AAAA");
							mask-image: url("blob:https://cdn.example.com/image-id");
							border-image-source: url("https://static.example.com/frame.png");
							filter: url("#shadow");
						}
					`),
			}),
		)

		const html = await buildWechatClipboardHtmlFromSource(`
			<html>
				<head><link rel="stylesheet" href="https://cdn.example.com/article.css" /></head>
				<body><div class="asset">article</div></body>
			</html>
		`)

		expect(html).toContain("data:image/png;base64,AAAA")
		expect(html).toContain("blob:https://cdn.example.com/image-id")
		expect(html).toContain("https://static.example.com/frame.png")
		expect(html).toContain("#shadow")
	})

	it("rejects clipboard HTML when an external stylesheet cannot be loaded", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn().mockResolvedValue({
				ok: false,
				status: 403,
			}),
		)

		await expect(
			buildWechatClipboardHtmlFromSource(`
				<html>
					<head><link rel="stylesheet" href="https://cdn.example.com/article.css" /></head>
					<body><p>article</p></body>
				</html>
			`),
		).rejects.toThrow("stylesheetLoadFailed")
	})

	it("normalizes network failures to the stylesheet load error", async () => {
		vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("Failed to fetch")))

		await expect(
			buildWechatClipboardHtmlFromSource(`
				<html>
					<head><link rel="stylesheet" href="https://cdn.example.com/article.css" /></head>
					<body><p>article</p></body>
				</html>
			`),
		).rejects.toThrow("stylesheetLoadFailed")
	})

	it("aborts a stylesheet request that never settles", async () => {
		vi.useFakeTimers()
		vi.stubGlobal(
			"fetch",
			vi.fn(
				(_url: string, init?: RequestInit) =>
					new Promise((_resolve, reject) => {
						init?.signal?.addEventListener("abort", () => {
							reject(new DOMException("Aborted", "AbortError"))
						})
					}),
			),
		)

		const conversion = buildWechatClipboardHtmlFromSource(`
			<html>
				<head><link rel="stylesheet" href="https://cdn.example.com/article.css" /></head>
				<body><p>article</p></body>
			</html>
		`)
		let outcome = "pending"
		void conversion.catch((error: unknown) => {
			outcome = error instanceof Error ? error.message : "unknownError"
		})

		await vi.advanceTimersByTimeAsync(10_000)
		expect(outcome).toBe("stylesheetLoadFailed")
	})

	it("does not cross a timer task before returning source clipboard HTML", async () => {
		vi.useFakeTimers()
		const conversion = buildWechatClipboardHtmlFromSource("<main>article</main>")
		let outcome = "pending"
		void conversion.then(() => {
			outcome = "resolved"
		})

		await Promise.resolve()
		await Promise.resolve()
		expect(outcome).toBe("resolved")
	})

	it("rejects CSS with more than 3000 active style rules", async () => {
		const rules = Array.from(
			{ length: 3001 },
			(_, index) => `.rule-${index} { color: red; }`,
		).join("\n")

		await expect(
			buildWechatClipboardHtmlFromSource(
				`<html><head><style>${rules}</style></head><body><p>article</p></body></html>`,
			),
		).rejects.toThrow("stylesheetRuleLimitExceeded")
	})

	it("rejects CSS with more than 6000 selectors", async () => {
		const selectors = Array.from({ length: 6001 }, (_, index) => `.rule-${index}`).join(",")

		await expect(
			buildWechatClipboardHtmlFromSource(
				`<html><head><style>${selectors} { color: red; }</style></head><body><p>article</p></body></html>`,
			),
		).rejects.toThrow("stylesheetRuleLimitExceeded")
	})

	it("rejects inline @import rules that cannot be prepared safely", async () => {
		await expect(
			buildWechatClipboardHtmlFromSource(`
				<html>
					<head><style>@import "./theme.css"; .lead { color: red; }</style></head>
					<body><p class="lead">article</p></body>
				</html>
			`),
		).rejects.toThrow("stylesheetImportUnsupported")
	})

	it("does not treat @import text in CSS comments or strings as an import rule", async () => {
		const html = await buildWechatClipboardHtmlFromSource(`
			<html>
				<head>
					<style>
						/* @import "./old-theme.css"; */
						.lead::before { content: "@import is text"; }
						.lead { color: red; }
					</style>
				</head>
				<body><p class="lead">article</p></body>
			</html>
		`)

		expect(html).toContain("color:rgb(255, 0, 0)")
	})

	it("inlines recursively imported external styles in the final clipboard HTML", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn((url: string) =>
				Promise.resolve({
					ok: true,
					text: () =>
						Promise.resolve(
							url.endsWith("main.css")
								? '@import "./theme.css"; .lead { font-weight: 700; }'
								: ".lead { color: rgb(7, 193, 96); }",
						),
				}),
			),
		)

		const html = await buildWechatClipboardHtmlFromSource(`
			<html>
				<head><link rel="stylesheet" href="https://cdn.example.com/main.css"></head>
				<body><p class="lead">article</p></body>
			</html>
		`)

		expect(html).toContain("color:rgb(7, 193, 96)")
		expect(html).toContain("font-weight:700")
	})

	it("does not parse external CSS text as iframe HTML", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn().mockResolvedValue({
				ok: true,
				text: () =>
					Promise.resolve(
						'.lead { color: red; } </style><a href="javascript:alert(1)">bad</a><style>',
					),
			}),
		)

		const html = await buildWechatClipboardHtmlFromSource(`
			<html>
				<head><link rel="stylesheet" href="https://cdn.example.com/article.css" /></head>
				<body><p class="lead">article</p></body>
			</html>
		`)

		expect(html).toContain("article")
		expect(html).not.toContain("javascript:")
		expect(html).not.toContain(">bad<")
	})

	it("inlines style tag rules and removes unsafe nodes for WeChat paste", async () => {
		const html = await buildWechatClipboardHtmlFromSource(`
			<html>
				<head>
					<link rel="icon" href="https://cdn.example.com/favicon.ico" />
					<style>
						.lead { color: red; font-weight: 700; }
					</style>
				</head>
				<body>
					<main>
						<p class="lead" onclick="bad()">article</p>
						<script>window.bad = true</script>
					</main>
				</body>
			</html>
		`)

		expect(html).toContain('<p class="lead"')
		expect(html).toContain("color:rgb(255, 0, 0)")
		expect(html).toContain("font-weight:700")
		expect(html).toMatch(/^<main/)
		expect(html).not.toContain("<style>")
		expect(html).not.toContain("<script>")
		expect(html).not.toContain("<link")
		expect(html).not.toContain("onclick")
	})

	it("omits body layout constraints while preserving article element styles", async () => {
		const html = await buildWechatClipboardHtmlFromSource(`
			<html>
				<head>
					<style>
						:root { --accent: rgb(7, 193, 96); }
						body { margin: 0 auto; max-width: 760px; padding: 24px; background: rgb(248, 248, 248); }
						.card { display: grid; grid-template-columns: 1fr 2fr; box-shadow: 0 4px 12px rgba(0,0,0,.12); }
						.card > strong { color: var(--accent); }
					</style>
				</head>
				<body>
					<div class="card"><span>label</span><strong>value</strong></div>
				</body>
			</html>
		`)

		expect(html).not.toContain("max-width:760px")
		expect(html).not.toContain("padding:24px")
		expect(html).toContain("display:grid")
		expect(html).toContain("grid-template-columns:1fr 2fr")
		expect(html).toContain("box-shadow:0 4px 12px rgba(0,0,0,.12)")
		expect(html).toContain("color:var(--accent)")
	})

	it("removes preview comments while preserving article images", async () => {
		const html = await buildWechatClipboardHtmlFromSource(`
			<html>
				<body>
					<main>
						<p>article</p>
						<img src="https://cdn.example.com/article/cover.png" alt="cover" />
					</main>
					<section data-wechat-article-comments="true">精选评论 Alice</section>
				</body>
			</html>
		`)

		expect(html).toContain("article")
		expect(html).toContain('src="https://cdn.example.com/article/cover.png"')
		expect(html).not.toContain("精选评论")
		expect(html).not.toContain("Alice")
		expect(html).not.toContain("data-wechat-article-comments")
	})

	it("does not rewrite relative image URLs against the temporary iframe URL", async () => {
		const html = await buildWechatClipboardHtmlFromSource(`
			<html>
				<body>
					<img src="images/cover.png" alt="cover" />
				</body>
			</html>
		`)

		expect(html).toContain('src="images/cover.png"')
		expect(html).not.toContain(`${window.location.origin}/images/cover.png`)
	})

	it("does not freeze unloaded images or their containers to zero computed height", async () => {
		const html = await buildWechatClipboardHtmlFromSource(`
			<html>
				<head>
					<style>
						.banner { width: 100%; height: auto; display: block; }
					</style>
				</head>
				<body>
					<section><img class="banner" src="https://cdn.example.com/banner.png" /></section>
				</body>
			</html>
		`)

		expect(html).toContain("width:100%")
		expect(html).toContain("height:auto")
		expect(html).not.toContain("height:0px")
		expect(html).not.toContain("width:760px")
	})
})
