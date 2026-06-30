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

		expect(html).toContain('<p class="lead" style="color:red;font-weight:700">article</p>')
		expect(html).not.toContain("<style>")
		expect(html).not.toContain("<script>")
		expect(html).not.toContain("onclick")
	})
})
