export interface TemplateOptions {
	theme: "light" | "dark"
	fontFamily?: string
	fontSize?: number
	lineHeight?: number
	padding?: number
	maxWidth?: number
}

const DEFAULT_OPTIONS: Required<TemplateOptions> = {
	theme: "light",
	fontFamily:
		"'SF Mono', 'Fira Code', 'Fira Mono', Menlo, Consolas, 'Liberation Mono', monospace",
	fontSize: 14,
	lineHeight: 1.6,
	padding: 32,
	maxWidth: 900,
}

export function wrapInHtmlTemplate(
	bodyContent: string,
	options: Partial<TemplateOptions> = {},
): string {
	const opts = { ...DEFAULT_OPTIONS, ...options }
	const isDark = opts.theme === "dark"

	const bgColor = isDark ? "#1e1e1e" : "#ffffff"
	const textColor = isDark ? "#d4d4d4" : "#1f2937"

	return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
* { margin: 0; padding: 0; box-sizing: border-box; }
html, body {
	background: ${bgColor};
	color: ${textColor};
	font-family: ${opts.fontFamily};
	font-size: ${opts.fontSize}px;
	line-height: ${opts.lineHeight};
	-webkit-font-smoothing: antialiased;
}
body {
	padding: ${opts.padding}px;
	max-width: ${opts.maxWidth}px;
	word-wrap: break-word;
	overflow-wrap: break-word;
}
</style>
</head>
<body>${bodyContent}</body>
</html>`
}
