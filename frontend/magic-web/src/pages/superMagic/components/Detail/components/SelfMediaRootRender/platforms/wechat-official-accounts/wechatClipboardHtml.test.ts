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
		expect(html).toMatch(/^<section(?: style="[^"]*")?>/)
		expect(html).not.toContain("<style>")
		expect(html).not.toContain("<script>")
		expect(html).not.toContain("onclick")
	})

	it("preserves body layout and computed styles when source HTML has not been previewed", () => {
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

		expect(html).toContain("max-width:760px")
		expect(html).toContain("padding:24px")
		expect(html).toContain("display:grid")
		expect(html).toContain("grid-template-columns:1fr 2fr")
		expect(html).toContain("box-shadow:0 4px 12px rgba(0,0,0,.12)")
		expect(html).toContain("color:var(--accent)")
	})
})
