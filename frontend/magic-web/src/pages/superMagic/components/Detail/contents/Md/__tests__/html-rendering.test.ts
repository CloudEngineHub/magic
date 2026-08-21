import { afterEach, describe, expect, it } from "vitest"
import { Editor } from "@/infrastructure/editors/tiptap/core"
import { StarterKit } from "@/infrastructure/editors/tiptap/starter-kit"
import { Markdown } from "@/infrastructure/editors/tiptap/markdown"
import {
	SafeHtmlDiv,
	SafeHtmlSpan,
	SafeHtmlTextBlockStyles,
} from "../components/EditorBody/extensions/safe-html-style"

describe("Markdown raw HTML rendering", () => {
	let editor: Editor | null = null

	afterEach(() => {
		editor?.destroy()
		editor = null
	})

	it("parses both styled div blocks as HTML content rather than code", () => {
		const markdown = `<div style="border: 2px solid blue; padding: 20px; background-color: lightgray; margin: 10px 0;">
    <h3>样式化的DIV元素</h3>
    <p>这是一个具有自定义样式的div元素，带有 <span style="background: yellow;">高亮 span</span>。</p>

</div>

![DingTalk Logo](https://static-legacy.dingtalk.com/media/example.jpg)

<div style="text-align: center; background-color: #f0f8ff; padding: 15px; border-radius: 10px; margin-top: 20px;">
    <p><strong>这是另一个带有样式的div</strong>，居中对齐并有淡蓝色背景。</p>
    
</div>`

		editor = new Editor({
			extensions: [
				StarterKit,
				Markdown.configure({ html: true, breaks: true }),
				SafeHtmlDiv,
				SafeHtmlSpan,
				SafeHtmlTextBlockStyles,
			],
			content: markdown,
		})

		const html = editor.getHTML()
		expect(html).not.toContain("<pre")
		expect(html).not.toContain("&lt;div")
		expect(html).toContain('style="border: 2px solid blue')
		expect(html).toContain('style="text-align: center')
		expect(html).toContain("样式化的DIV元素")
		expect(html).toContain('style="background: yellow')
		expect(html).toContain("这是另一个带有样式的div")
	})

	it("does not preserve unsafe layout styles in the editor schema", () => {
		editor = new Editor({
			extensions: [
				StarterKit,
				Markdown.configure({ html: true }),
				SafeHtmlDiv,
				SafeHtmlSpan,
				SafeHtmlTextBlockStyles,
			],
			content: '<div style="position:fixed;inset:0"><p>overlay</p></div>',
		})

		const html = editor.getHTML()
		expect(html).toContain("overlay")
		expect(html).not.toContain("position")
		expect(html).not.toContain("inset")
	})

})
