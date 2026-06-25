import type { TemplateOptions } from "./baseTemplate"
import { renderCode } from "./renderCode"
import { renderMarkdown } from "./renderMarkdown"
import { renderPlainText } from "./renderPlainText"

export interface TextToHtmlOptions extends Partial<TemplateOptions> {
	/** 文件类型/语言标识 */
	language?: string
	/** 是否显示行号（代码模式） */
	showLineNumbers?: boolean
}

/** 根据文件扩展名推断语言 */
const EXT_TO_LANGUAGE: Record<string, string> = {
	js: "javascript",
	jsx: "javascript",
	ts: "typescript",
	tsx: "typescript",
	py: "python",
	rb: "ruby",
	go: "go",
	rs: "rust",
	java: "java",
	c: "c",
	cpp: "cpp",
	h: "c",
	hpp: "cpp",
	cs: "csharp",
	css: "css",
	scss: "css",
	less: "css",
	html: "markup",
	xml: "markup",
	svg: "markup",
	json: "json",
	yaml: "yaml",
	yml: "yaml",
	md: "markdown",
	markdown: "markdown",
	sh: "bash",
	bash: "bash",
	zsh: "bash",
	sql: "sql",
	txt: "plaintext",
	text: "plaintext",
	log: "plaintext",
}

/** markdown 类型集合 */
const MARKDOWN_LANGUAGES = new Set(["markdown", "md"])

/** 纯文本类型集合 */
const PLAINTEXT_LANGUAGES = new Set(["plaintext", "text", "txt", "log", ""])

/**
 * 统一入口：根据 language 自动选择渲染方式，将文本内容转为带样式的 HTML。
 * - markdown -> marked 解析
 * - plaintext -> <pre> 包裹
 * - 其他 -> prismjs 语法高亮
 */
export function textToHtml(content: string, options: TextToHtmlOptions = {}): string {
	const { language: rawLang = "plaintext", showLineNumbers = true, ...templateOpts } = options

	// 先尝试通过扩展名映射到标准语言名
	const lang = EXT_TO_LANGUAGE[rawLang.toLowerCase()] ?? rawLang.toLowerCase()

	if (MARKDOWN_LANGUAGES.has(lang)) {
		return renderMarkdown(content, templateOpts)
	}

	if (PLAINTEXT_LANGUAGES.has(lang)) {
		return renderPlainText(content, templateOpts)
	}

	return renderCode(content, { ...templateOpts, language: lang, showLineNumbers })
}
