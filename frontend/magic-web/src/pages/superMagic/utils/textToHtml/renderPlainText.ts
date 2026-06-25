import { wrapInHtmlTemplate, type TemplateOptions } from "./baseTemplate"

export function renderPlainText(content: string, options: Partial<TemplateOptions> = {}): string {
	const escaped = escapeHtml(content)
	const body = `<pre style="white-space: pre-wrap; word-wrap: break-word; margin: 0;">${escaped}</pre>`
	return wrapInHtmlTemplate(body, options)
}

function escapeHtml(text: string): string {
	return text
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
}
