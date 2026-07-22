import { describe, expect, it } from "vitest"
import { buildWechatClipboardHtmlFromSource } from "./wechatClipboardHtml"

describe("wechatClipboardHtml", () => {
	it("inlines style tag rules and removes unsafe nodes for WeChat paste", () => {
		const html = buildWechatClipboardHtmlFromSource(`
			<html>
				<head>
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
		expect(html).not.toContain("onclick")
	})

	it("omits body layout constraints while preserving article element styles", () => {
		const html = buildWechatClipboardHtmlFromSource(`
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

	it("removes preview comments while preserving article images", () => {
		const html = buildWechatClipboardHtmlFromSource(`
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

	it("does not rewrite relative image URLs against the temporary iframe URL", () => {
		const html = buildWechatClipboardHtmlFromSource(`
			<html>
				<body>
					<img src="images/cover.png" alt="cover" />
				</body>
			</html>
		`)

		expect(html).toContain('src="images/cover.png"')
		expect(html).not.toContain(`${window.location.origin}/images/cover.png`)
	})

	it("does not freeze unloaded images or their containers to zero computed height", () => {
		const html = buildWechatClipboardHtmlFromSource(`
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
