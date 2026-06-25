import { marked } from "marked"
import { wrapInHtmlTemplate, type TemplateOptions } from "./baseTemplate"

export interface RenderMarkdownOptions extends Partial<TemplateOptions> {}

/** Markdown 渲染后的排版 CSS */
const MARKDOWN_CSS = `
h1, h2, h3, h4, h5, h6 {
	margin-top: 1.4em;
	margin-bottom: 0.6em;
	font-weight: 600;
	line-height: 1.3;
}
h1 { font-size: 2em; border-bottom: 1px solid var(--border); padding-bottom: 0.3em; }
h2 { font-size: 1.5em; border-bottom: 1px solid var(--border); padding-bottom: 0.3em; }
h3 { font-size: 1.25em; }
h4 { font-size: 1em; }
p { margin-bottom: 1em; }
a { color: var(--link); text-decoration: none; }
a:hover { text-decoration: underline; }
code {
	background: var(--code-bg);
	padding: 0.2em 0.4em;
	border-radius: 4px;
	font-family: 'SF Mono', 'Fira Code', Menlo, Consolas, monospace;
	font-size: 0.9em;
}
pre {
	background: var(--code-bg);
	padding: 16px;
	border-radius: 8px;
	overflow-x: auto;
	margin-bottom: 1em;
}
pre code {
	background: none;
	padding: 0;
	font-size: 13px;
	line-height: 1.6;
}
blockquote {
	border-left: 4px solid var(--blockquote-border);
	padding: 0.5em 1em;
	margin: 0 0 1em 0;
	color: var(--muted);
}
ul, ol {
	padding-left: 2em;
	margin-bottom: 1em;
}
li { margin-bottom: 0.4em; }
table {
	border-collapse: collapse;
	width: 100%;
	margin-bottom: 1em;
}
th, td {
	border: 1px solid var(--border);
	padding: 8px 12px;
	text-align: left;
}
th { background: var(--code-bg); font-weight: 600; }
img { max-width: 100%; height: auto; border-radius: 4px; }
hr {
	border: none;
	border-top: 1px solid var(--border);
	margin: 2em 0;
}
`

export function renderMarkdown(content: string, options: RenderMarkdownOptions = {}): string {
	const isDark = options.theme === "dark"
	const htmlBody = marked.parse(content, { async: false }) as string

	const cssVars = isDark
		? `
			--border: #3e4452;
			--code-bg: #282c34;
			--link: #61afef;
			--blockquote-border: #4b5263;
			--muted: #7f848e;
		`
		: `
			--border: #e5e7eb;
			--code-bg: #f3f4f6;
			--link: #2563eb;
			--blockquote-border: #d1d5db;
			--muted: #6b7280;
		`

	const extraCss = `
:root { ${cssVars} }
body {
	font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
	font-size: 15px;
	line-height: 1.7;
}
${MARKDOWN_CSS}
`

	return wrapInHtmlTemplate(htmlBody, { ...options, fontFamily: undefined }).replace(
		"</style>",
		`${extraCss}\n</style>`,
	)
}
