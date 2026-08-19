import type { JSONContent } from "@/infrastructure/editors/tiptap/core"
import {
	MentionItemType,
	type ProjectFileMentionData,
	type UploadFileMentionData,
} from "@/components/business/MentionPanel/types"
import {
	getMentionDisplayName,
	type TiptapMentionAttributes,
} from "@/components/business/MentionPanel/tiptap-plugin/types"
import {
	createCanonicalWorkspaceHref,
	escapeHtmlText,
	escapeMarkdownLinkLabel,
} from "@/pages/superMagic/utils/filePathMention"
import { INSPECTOR_DETAIL_TYPE } from "@/pages/superMagic/components/MessageEditor/extensions/inspector-detail/const"

export interface MentionClipboardRepresentation {
	plainText: string
	htmlContent: string
}

export function getMentionClipboardRepresentation(
	attrs: TiptapMentionAttributes,
): MentionClipboardRepresentation | null {
	if (attrs.type !== MentionItemType.PROJECT_FILE && attrs.type !== MentionItemType.UPLOAD_FILE) {
		return null
	}

	const data = attrs.data as ProjectFileMentionData | UploadFileMentionData
	const href = createCanonicalWorkspaceHref(data.relative_file_path || data.file_path || "")
	const label = data.file_name?.trim()
	if (!href || !label) return null

	return {
		plainText: `[${escapeMarkdownLinkLabel(label)}](${href})`,
		htmlContent: `<a href="${escapeHtmlText(href)}">${escapeHtmlText(label)}</a>`,
	}
}

export function getClipboardPlainText(content: JSONContent): string {
	function serialize(node: JSONContent): string {
		if (node.type === "text") return node.text || ""

		if (node.type === "mention" && node.attrs) {
			const attrs = node.attrs as TiptapMentionAttributes
			const portable = getMentionClipboardRepresentation(attrs)
			const displayName = getMentionDisplayName(attrs)
			const suffix = attrs.type === MentionItemType.FOLDER ? "/" : ""
			return ` ${portable?.plainText || `@${displayName}${suffix}`} `
		}

		if (node.type === "super-placeholder") {
			const props = node.attrs?.props as Record<string, unknown> | undefined
			return String(props?.value || props?.defaultValue || props?.placeholder || "")
		}

		if (node.type === INSPECTOR_DETAIL_TYPE) {
			const attrs = node.attrs || {}
			const lines: string[] = []
			if (attrs.selector) lines.push(`selector: ${attrs.selector}`)
			if (attrs.size) lines.push(`size: ${attrs.size}`)
			if (attrs.textContent) lines.push(`textContent: "${attrs.textContent}"`)
			return lines.length > 0 ? `${lines.join("\n")}\n` : ""
		}

		if (node.type === "hardBreak") return "\n"

		const childText = node.content?.map(serialize).join("") || ""
		return node.type === "paragraph" ? `${childText}\n` : childText
	}

	return serialize(content).replace(/\n$/, "")
}

export function getClipboardHtml(htmlContent: string): string {
	const container = document.createElement("div")
	container.innerHTML = htmlContent

	container.querySelectorAll<HTMLElement>("span.magic-mention").forEach((element) => {
		try {
			const attrs: TiptapMentionAttributes = {
				type: element.dataset.type as TiptapMentionAttributes["type"],
				data: JSON.parse(element.dataset.data || "{}"),
			}
			const portable = getMentionClipboardRepresentation(attrs)
			if (!portable) return

			const replacement = document.createElement("span")
			replacement.innerHTML = portable.htmlContent
			const link = replacement.firstElementChild
			if (!link) return
			element.replaceWith(document.createTextNode(" "), link, document.createTextNode(" "))
		} catch {
			// 无法还原 attrs 时保留原 mention HTML，Magic metadata 仍可用于内部粘贴。
		}
	})

	return container.innerHTML
}
