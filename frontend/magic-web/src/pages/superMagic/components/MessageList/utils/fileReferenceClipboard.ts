import type { ClipboardEvent } from "react"
import {
	createCanonicalWorkspaceHref,
	createReferencedProjectHref,
	escapeMarkdownLinkLabel,
	parseMarkdownFileHref,
} from "@/pages/superMagic/utils/filePathMention"

const FILE_REFERENCE_SELECTOR = "[data-file-reference]"

function closestFileReference(node: Node): Element | null {
	const element = node instanceof Element ? node : node.parentElement
	return element?.closest(FILE_REFERENCE_SELECTOR) ?? null
}

/** 保留正文换行；不读取样式或图标，也不尝试重新生成整篇 Markdown。 */
function getSelectedText(node: Node): string {
	if (node.nodeType === Node.TEXT_NODE) return node.textContent || ""
	if (!(node instanceof Element)) return ""
	if (node.tagName === "BR") return "\n"
	if (node.tagName === "IMG") return node.getAttribute("alt") || ""
	if (node.tagName === "SVG" || node.getAttribute("aria-hidden") === "true") return ""

	let text = ""
	for (const child of node.childNodes) {
		const childText = getSelectedText(child)
		const tag = child instanceof Element ? child.tagName : ""
		const separator = /^(P|H[1-6]|PRE|BLOCKQUOTE)$/.test(tag)
			? "\n\n"
			: /^(DIV|UL|OL|LI|TABLE|TR)$/.test(tag)
				? "\n"
				: ""
		if (separator && text && !text.endsWith(separator)) {
			text += separator.slice(text.endsWith("\n") ? 1 : 0)
		}
		text += childText
		if (separator && !text.endsWith(separator)) {
			text += separator.slice(text.endsWith("\n") ? 1 : 0)
		}
	}
	return text
}

export function copySelectedFileReferences(event: ClipboardEvent<HTMLDivElement>): void {
	if (event.defaultPrevented || !event.clipboardData) return
	const root = event.currentTarget
	const selection = root.ownerDocument.getSelection()
	if (!selection || selection.isCollapsed || selection.rangeCount !== 1) return

	const range = selection.getRangeAt(0).cloneRange()
	if (!root.contains(range.startContainer) || !root.contains(range.endContainer)) return

	// 文件标签与编辑器 Mention 一样按整体复制，不扩大标签外的正文选区。
	const startReference = closestFileReference(range.startContainer)
	const endReference = closestFileReference(range.endContainer)
	if (startReference) range.setStartBefore(startReference)
	if (endReference) range.setEndAfter(endReference)

	const container = root.ownerDocument.createElement("div")
	container.append(range.cloneContents())
	const references = container.querySelectorAll<HTMLElement>(FILE_REFERENCE_SELECTOR)
	if (references.length === 0) return

	const links: { anchor: HTMLAnchorElement; markdown: string }[] = []
	for (const reference of references) {
		const target = parseMarkdownFileHref(reference.dataset.fileReference || "")
		if (!target) continue
		const href =
			target.scope === "workspace"
				? createCanonicalWorkspaceHref(target.relativePath)
				: createReferencedProjectHref(target.projectId, target.relativePath)
		const label = reference.querySelector("[data-file-reference-label]")?.textContent || ""
		if (!href || !label) continue

		const anchor = root.ownerDocument.createElement("a")
		anchor.setAttribute("href", href)
		anchor.textContent = label
		reference.replaceWith(anchor)
		links.push({
			anchor,
			markdown: `[${escapeMarkdownLinkLabel(label)}](${href.includes(" ") ? `<${href}>` : href})`,
		})
	}
	if (links.length === 0) return

	const html = container.innerHTML
	for (const { anchor, markdown } of links) anchor.replaceWith(markdown)
	const text = getSelectedText(container).replace(/^\n+|\n+$/g, "")
	event.clipboardData.setData("text/plain", text)
	event.clipboardData.setData("text/html", html)
	event.preventDefault()
}
