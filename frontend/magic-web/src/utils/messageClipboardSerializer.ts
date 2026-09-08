import type { JSONContent } from "@/infrastructure/editors/tiptap/core"
import { DOMSerializer, type Node as ProseMirrorNode } from "prosemirror-model"
import type { EditorView } from "prosemirror-view"
import {
	MentionItemType,
	type DirectoryMentionData,
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

export const MESSAGE_CLIPBOARD_RICH_TEXT_MIME = "text/x-magic-message-rich-text"
export const MESSAGE_CLIPBOARD_MENTIONS_MIME = "text/x-magic-message-mentions"

const INSPECTOR_DETAIL_TYPE = "inspector-detail"

export interface MessageClipboardMentionItem {
	attrs: TiptapMentionAttributes
}

export interface MessageClipboardMetadata {
	richText: string
	mentions?: MessageClipboardMentionItem[]
}

export interface MessageClipboardPayload {
	plainText: string
	htmlWithMetadata: string
	metadata: MessageClipboardMetadata
}

type MentionDataRecord = Record<string, unknown>

function asRecord(value: unknown): MentionDataRecord | null {
	return value && typeof value === "object" ? (value as MentionDataRecord) : null
}

function normalizeMentionAttrs(attrs: TiptapMentionAttributes): TiptapMentionAttributes | null {
	const rawData = asRecord(attrs.data)
	if (attrs.pending === true || rawData?.pending === true) return null
	if (
		attrs.type !== MentionItemType.PROJECT_FILE &&
		attrs.type !== MentionItemType.UPLOAD_FILE &&
		attrs.type !== MentionItemType.FOLDER
	) {
		return attrs
	}

	const data = asRecord(attrs.data)
	if (!data) return null

	if (attrs.type === MentionItemType.FOLDER) {
		const folderData = data as Partial<DirectoryMentionData>
		const path = String(folderData.directory_path || "").trim()
		const name = String(folderData.directory_name || "").trim()
		return path && name ? attrs : null
	}

	const source = data as Partial<ProjectFileMentionData & UploadFileMentionData>
	const fileName = String(data.file_name || data.filename || "").trim()
	const filePath = String(source.file_path || source.relative_file_path || "").trim()
	const relativeFilePath = String(source.relative_file_path || filePath).trim()
	const fileId = String(source.file_id || "").trim() || filePath
	const fileExtension = String(source.file_extension || fileName.split(".").pop() || "").trim()

	if (!fileName || !fileId || !filePath) return null

	return {
		...attrs,
		data: {
			...data,
			file_id: fileId,
			file_name: fileName,
			file_path: filePath,
			relative_file_path: relativeFilePath,
			file_extension: fileExtension,
		},
	}
}

function getMentionFallbackText(attrs: unknown): string | null {
	const record = asRecord(attrs)
	const data = asRecord(record?.data)
	const name = String(
		data?.file_name ||
			data?.filename ||
			data?.directory_name ||
			(record ? getMentionDisplayName(record as TiptapMentionAttributes) : "") ||
			"",
	).trim()
	return name ? `@${name}` : null
}

function getPortableMention(attrs: TiptapMentionAttributes): {
	plainText: string
	htmlContent: string
} | null {
	let path = ""
	let label = ""

	if (attrs.type === MentionItemType.FOLDER) {
		const data = asRecord(attrs.data) as Partial<DirectoryMentionData> | null
		path = String(data?.directory_path || "")
		label = String(data?.directory_name || "").trim()
	} else if (
		attrs.type === MentionItemType.PROJECT_FILE ||
		attrs.type === MentionItemType.UPLOAD_FILE
	) {
		const data = asRecord(attrs.data) as Partial<
			ProjectFileMentionData & UploadFileMentionData
		> | null
		path = String(data?.relative_file_path || data?.file_path || "")
		label = String(data?.file_name || "").trim()
	} else {
		return null
	}

	const href = createCanonicalWorkspaceHref(path)
	if (!href || !label) return null
	const markdownDestination = href.includes(" ") ? `<${href}>` : href

	return {
		plainText: `[${escapeMarkdownLinkLabel(label)}](${markdownDestination})`,
		htmlContent: `<a href="${escapeHtmlText(href)}">${escapeHtmlText(label)}</a>`,
	}
}

export function getMentionClipboardRepresentation(
	attrs: TiptapMentionAttributes,
): { plainText: string; htmlContent: string } | null {
	return getPortableMention(attrs)
}

function normalizeRichTextNode(node: JSONContent): JSONContent | null {
	let normalized = node
	if (node.type === "mention" && node.attrs) {
		const rawAttrs = node.attrs as TiptapMentionAttributes
		if (rawAttrs.pending === true || asRecord(rawAttrs.data)?.pending === true) return null
		const attrs = normalizeMentionAttrs(rawAttrs)
		if (!attrs) {
			const fallbackText = getMentionFallbackText(node.attrs)
			return fallbackText ? { type: "text", text: fallbackText } : null
		}
		normalized = { ...normalized, attrs }
	}
	if (node.type === INSPECTOR_DETAIL_TYPE && node.attrs?.fileMention) {
		const fileMention = normalizeMentionAttrs(node.attrs.fileMention as TiptapMentionAttributes)
		if (fileMention) {
			normalized = { ...normalized, attrs: { ...node.attrs, fileMention } }
		} else {
			const restAttrs = { ...node.attrs }
			delete restAttrs.fileMention
			normalized = { ...normalized, attrs: restAttrs }
		}
	}
	if (node.content) {
		normalized = {
			...normalized,
			content: node.content
				.map(normalizeRichTextNode)
				.filter((child): child is JSONContent => child !== null),
		}
	}
	return normalized
}

function collectMentionAttrs(node: ProseMirrorNode, mentions: TiptapMentionAttributes[]): void {
	if (node.type.name === "mention" && node.attrs) {
		const attrs = normalizeMentionAttrs(node.attrs as TiptapMentionAttributes)
		if (attrs) mentions.push(attrs)
	} else if (node.type.name === INSPECTOR_DETAIL_TYPE && node.attrs?.fileMention) {
		const attrs = normalizeMentionAttrs(node.attrs.fileMention as TiptapMentionAttributes)
		if (attrs) mentions.push(attrs)
	}

	node.forEach((child) => collectMentionAttrs(child, mentions))
}

/**
 * Internal Canvas ↔ SuperMagic paste is driven by structured mention attrs in metadata.
 * Portable markdown/HTML links are only an external-clipboard fallback and must not gate
 * whether magic clipboard payload is written.
 */
function hasStructuredMention(mentions: TiptapMentionAttributes[]): boolean {
	return mentions.some(
		(attrs) =>
			attrs.type === MentionItemType.PROJECT_FILE ||
			attrs.type === MentionItemType.UPLOAD_FILE ||
			attrs.type === MentionItemType.FOLDER,
	)
}

export function getClipboardPlainText(content: JSONContent): string {
	function serialize(node: JSONContent): string {
		if (node.type === "text") return node.text || ""

		if (node.type === "mention" && node.attrs) {
			const attrs = node.attrs as TiptapMentionAttributes
			if (attrs.pending === true || asRecord(attrs.data)?.pending === true) return ""
			const portable = getPortableMention(attrs)
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

		if (node.type === "hardBreak" || node.type === "hard_break") return "\n"

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
			const data = JSON.parse(element.dataset.data || "{}") as Record<string, unknown>
			if (data.pending === true) {
				element.remove()
				return
			}
			const attrs: TiptapMentionAttributes = {
				type: element.dataset.type as TiptapMentionAttributes["type"],
				data,
			}
			const portable = getPortableMention(attrs)
			if (!portable) return

			const replacement = document.createElement("span")
			replacement.innerHTML = portable.htmlContent
			const link = replacement.firstElementChild
			if (!link) return
			element.replaceWith(document.createTextNode(" "), link, document.createTextNode(" "))
		} catch {
			// Metadata remains authoritative for internal paste when DOM attrs are incomplete.
		}
	})

	return container.innerHTML
}

export interface SerializeMessageClipboardOptions {
	enrichMentionAttrs?: (attrs: TiptapMentionAttributes) => TiptapMentionAttributes
}

export function serializeMessageClipboard(
	view: EditorView,
	options?: SerializeMessageClipboardOptions,
): MessageClipboardPayload | null {
	const { state } = view
	const enrichMentionAttrs = options?.enrichMentionAttrs
	if (state.selection.empty) return null

	const fragment = state.selection.content()
	const serializer = DOMSerializer.fromSchema(state.schema)
	const dom = serializer.serializeFragment(fragment.content)
	const tempDiv = document.createElement("div")
	tempDiv.appendChild(dom)

	const applyEnrichment = (attrs: TiptapMentionAttributes): TiptapMentionAttributes =>
		enrichMentionAttrs ? enrichMentionAttrs(attrs) : attrs

	const mentions: TiptapMentionAttributes[] = []
	const richTextContent: JSONContent[] = []
	fragment.content.forEach((node) => {
		const normalized = normalizeRichTextNode(node.toJSON() as JSONContent)
		if (!normalized) return
		richTextContent.push(
			enrichMentionAttrs ? enrichRichTextMentions(normalized, applyEnrichment) : normalized,
		)
	})
	const richTextJson: JSONContent = {
		type: "doc",
		content: richTextContent,
	}
	fragment.content.forEach((node) => collectMentionAttrs(node, mentions))
	const enrichedMentions = mentions.map(applyEnrichment)

	// Require structured file/folder mention identity, not portable markdown hrefs.
	// Absolute workspace paths, canvas-relative paths, and opaque asset refs can all
	// round-trip through metadata even when external plain-text links are unavailable.
	if (!hasStructuredMention(enrichedMentions)) return null

	const metadata: MessageClipboardMetadata = {
		richText: JSON.stringify(richTextJson),
		mentions: enrichedMentions.map((attrs) => ({ attrs })),
	}
	const metadataBase64 = btoa(encodeURIComponent(JSON.stringify(metadata)))

	return {
		plainText: getClipboardPlainText(richTextJson),
		htmlWithMetadata: `<div data-magic-clipboard="${metadataBase64}">${getClipboardHtml(
			tempDiv.innerHTML,
		)}</div>`,
		metadata,
	}
}

function enrichRichTextMentions(
	node: JSONContent,
	enrichMentionAttrs: (attrs: TiptapMentionAttributes) => TiptapMentionAttributes,
): JSONContent {
	let next = node
	if (node.type === "mention" && node.attrs) {
		next = {
			...node,
			attrs: enrichMentionAttrs(node.attrs as TiptapMentionAttributes),
		}
	}
	if (node.type === INSPECTOR_DETAIL_TYPE && node.attrs?.fileMention) {
		next = {
			...next,
			attrs: {
				...next.attrs,
				fileMention: enrichMentionAttrs(node.attrs.fileMention as TiptapMentionAttributes),
			},
		}
	}
	if (next.content?.length) {
		next = {
			...next,
			content: next.content.map((child) => enrichRichTextMentions(child, enrichMentionAttrs)),
		}
	}
	return next
}

export function writeMessageClipboardPayload(
	clipboardData: DataTransfer,
	payload: MessageClipboardPayload,
): void {
	clipboardData.setData("text/html", payload.htmlWithMetadata)
	clipboardData.setData("text/plain", payload.plainText)
	try {
		clipboardData.setData(MESSAGE_CLIPBOARD_RICH_TEXT_MIME, payload.metadata.richText)
		if (payload.metadata.mentions) {
			clipboardData.setData(
				MESSAGE_CLIPBOARD_MENTIONS_MIME,
				JSON.stringify(payload.metadata.mentions),
			)
		}
	} catch {
		// Browser/WebView may reject custom MIME types; standard formats remain available.
	}
}
