import { Extension, type JSONContent } from "@/infrastructure/editors/tiptap/core"
import { Plugin, PluginKey } from "prosemirror-state"
import { isAllowedMention, markProjectFileMentionForCopy } from "../utils/mention"
import type {
	MentionListItem,
	TiptapMentionAttributes,
} from "@/components/business/MentionPanel/tiptap-plugin/types"
import { getMentionUniqueId } from "@/components/business/MentionPanel/tiptap-plugin/types"
import type { DataService } from "@/components/business/MentionPanel/types"
import {
	extractClipboardMetadata,
	isMagicClipboard,
	type MagicClipboardMetadata,
} from "@/utils/clipboard-helpers"
import { runActiveEditor } from "@/utils/tiptapEditorLifecycle"
import { transformInspectorContent } from "./inspector-detail"
import type { AttachmentItem } from "@/pages/superMagic/components/TopicFilesButton/hooks"
import { MentionItemType } from "@/components/business/MentionPanel/types"
import { createProjectFileMentionData } from "@/components/business/MentionPanel/utils/projectReferenceMention"
import { findAttachmentByPath } from "@/pages/superMagic/components/MessageList/components/Text/components/Markdown/parser/helper"
import {
	extractWorkspaceMarkdownLinks,
	parseCanonicalWorkspaceHref,
} from "@/pages/superMagic/utils/filePathMention"

interface CopyMessageOptions {
	onMentionsInsert?: (items: TiptapMentionAttributes[]) => void
	onContentChange?: (content: JSONContent) => void
	dataService?: DataService | null
	getWorkspaceFilesList?: () => AttachmentItem[]
}

type PastePart =
	| { type: "text"; text: string }
	| { type: "mention"; attrs: TiptapMentionAttributes }

function createFileMention(
	attachments: AttachmentItem[],
	path: string,
): TiptapMentionAttributes | null {
	const file = findAttachmentByPath(attachments, path)
	if (!file?.file_id || file.is_directory) return null

	return {
		type: MentionItemType.PROJECT_FILE,
		data: createProjectFileMentionData(file),
	}
}

function appendText(parts: PastePart[], text: string): void {
	if (!text) return
	const previous = parts[parts.length - 1]
	if (previous?.type === "text") {
		previous.text += text
	} else {
		parts.push({ type: "text", text })
	}
}

function buildPlainTextPasteParts(text: string, attachments: AttachmentItem[]): PastePart[] | null {
	const matches = extractWorkspaceMarkdownLinks(text)
	if (matches.length === 0) return null

	const parts: PastePart[] = []
	let lastIndex = 0
	let matchedCount = 0
	for (const match of matches) {
		appendText(parts, text.slice(lastIndex, match.startIndex))
		const attrs = createFileMention(attachments, match.path)
		if (attrs) {
			parts.push({ type: "mention", attrs })
			matchedCount++
		} else {
			appendText(parts, match.fullMatch)
		}
		lastIndex = match.endIndex
	}
	appendText(parts, text.slice(lastIndex))

	return matchedCount > 0 ? parts : null
}

function replaceWorkspaceLinksInRichText(
	content: JSONContent,
	attachments: AttachmentItem[],
): { content: JSONContent; mentions: TiptapMentionAttributes[] } {
	const mentions: TiptapMentionAttributes[] = []

	const visit = (node: JSONContent): JSONContent[] => {
		if (
			node.type === "codeBlock" ||
			node.type === "code" ||
			node.marks?.some((mark) => mark.type === "code")
		) {
			return [node]
		}

		if (node.type === "text" && node.text) {
			const parts = buildPlainTextPasteParts(node.text, attachments)
			if (!parts) return [node]

			const replacementContent: JSONContent[] = []
			for (const part of parts) {
				if (part.type === "mention") {
					mentions.push(part.attrs)
					replacementContent.push({ type: "mention", attrs: part.attrs })
					continue
				}

				if (part.text) replacementContent.push({ ...node, text: part.text })
			}
			return replacementContent
		}

		if (!node.content) return [node]

		return [{ ...node, content: node.content.flatMap(visit) }]
	}

	return { content: visit(content)[0] ?? content, mentions }
}

function deduplicateMentions(items: TiptapMentionAttributes[]): TiptapMentionAttributes[] {
	const uniqueIds = new Set<string>()

	return items.filter((item) => {
		const uniqueId = getMentionUniqueId(item)
		if (uniqueIds.has(uniqueId)) return false

		uniqueIds.add(uniqueId)
		return true
	})
}

function buildHtmlPasteParts(html: string, attachments: AttachmentItem[]): PastePart[] | null {
	if (!html) return null

	const container = document.createElement("div")
	container.innerHTML = html
	const parts: PastePart[] = []
	let matchedCount = 0
	const blockTags = new Set(["DIV", "P", "LI", "SECTION", "ARTICLE", "BLOCKQUOTE", "PRE"])

	const visit = (node: Node) => {
		if (node.nodeType === Node.TEXT_NODE) {
			appendText(parts, node.textContent || "")
			return
		}
		if (!(node instanceof HTMLElement)) return

		if (node.tagName === "BR") {
			appendText(parts, "\n")
			return
		}

		if (node.tagName === "A") {
			const path = parseCanonicalWorkspaceHref(node.getAttribute("href") || "")
			const attrs = path ? createFileMention(attachments, path) : null
			if (attrs) {
				parts.push({ type: "mention", attrs })
				matchedCount++
			} else {
				appendText(parts, node.textContent || "")
			}
			return
		}

		if (node.tagName === "CODE" || node.tagName === "PRE") {
			appendText(parts, node.textContent || "")
			if (node.tagName === "PRE") appendText(parts, "\n")
			return
		}

		node.childNodes.forEach(visit)
		if (blockTags.has(node.tagName)) {
			const lastPart = parts[parts.length - 1]
			if (lastPart?.type !== "text" || !lastPart.text.endsWith("\n")) {
				appendText(parts, "\n")
			}
		}
	}

	container.childNodes.forEach(visit)
	return matchedCount > 0 ? parts : null
}

function buildPasteContent(parts: PastePart[]): {
	content: JSONContent
	mentions: TiptapMentionAttributes[]
} {
	const paragraphs: JSONContent[] = [{ type: "paragraph", content: [] }]
	const mentions: TiptapMentionAttributes[] = []

	const appendInline = (node: JSONContent) => {
		const paragraph = paragraphs[paragraphs.length - 1]
		paragraph.content = [...(paragraph.content || []), node]
	}

	for (const part of parts) {
		if (part.type === "mention") {
			appendInline({ type: "mention", attrs: part.attrs })
			mentions.push(part.attrs)
			continue
		}

		const lines = part.text.replace(/\r\n?/g, "\n").split("\n")
		lines.forEach((line, index) => {
			if (line) appendInline({ type: "text", text: line })
			if (index < lines.length - 1) paragraphs.push({ type: "paragraph", content: [] })
		})
	}

	return {
		content: { type: "doc", content: paragraphs },
		mentions,
	}
}

function prepareMentionAttrs(
	attrs: TiptapMentionAttributes,
	metadata: MagicClipboardMetadata,
	dataService?: DataService | null,
): TiptapMentionAttributes | null {
	const pendingProjectFileMention = markProjectFileMentionForCopy(attrs, metadata.sourceProjectId)
	if (pendingProjectFileMention) return pendingProjectFileMention

	if (isAllowedMention(attrs, dataService)) return attrs

	return null
}

function prepareMentionItems(
	mentions: unknown[],
	metadata: MagicClipboardMetadata,
	dataService?: DataService | null,
): TiptapMentionAttributes[] {
	return (mentions as MentionListItem[])
		.map((mention) => prepareMentionAttrs(mention.attrs, metadata, dataService))
		.filter((mention): mention is TiptapMentionAttributes => Boolean(mention))
}

function prepareRichTextContent(
	content: JSONContent,
	metadata: MagicClipboardMetadata,
	dataService?: DataService | null,
): JSONContent {
	if (!content) return content

	let transformedContent = content

	if (content.type === "mention" && content.attrs) {
		const attrs = prepareMentionAttrs(
			content.attrs as TiptapMentionAttributes,
			metadata,
			dataService,
		)
		if (!attrs) return {}

		transformedContent = {
			...content,
			attrs,
		}
	}

	if (content.content && Array.isArray(content.content)) {
		const transformedChildren = content.content
			.map((child) => prepareRichTextContent(child, metadata, dataService))
			.filter((child) => Object.keys(child).length > 0)

		if (transformedChildren.some((child, index) => child !== content.content?.[index])) {
			transformedContent = {
				...transformedContent,
				content: transformedChildren,
			}
		}
	}

	return transformedContent
}

const CopyMessageExtension = Extension.create<CopyMessageOptions>({
	name: "copyMessage",

	addOptions() {
		return {
			onMentionsInsert: undefined,
			dataService: null,
			getWorkspaceFilesList: () => [],
		}
	},

	addProseMirrorPlugins() {
		return [
			new Plugin({
				key: new PluginKey("copyMessage"),

				props: {
					handlePaste: (_view, event) => {
						const clipboardData = event.clipboardData
						if (!clipboardData) return false

						const isMagic = isMagicClipboard(clipboardData)
						const attachments = this.options.getWorkspaceFilesList?.() ?? []
						if (!isMagic) {
							const htmlParts = buildHtmlPasteParts(
								clipboardData.getData("text/html"),
								attachments,
							)
							const parts =
								htmlParts ||
								buildPlainTextPasteParts(
									clipboardData.getData("text/plain"),
									attachments,
								)
							if (!parts) return false

							const paste = buildPasteContent(parts)
							return (
								runActiveEditor(
									this.editor,
									(editor) => {
										if (!editor.commands.insertContent(paste.content))
											return false
										this.options.onMentionsInsert?.(paste.mentions)
										return true
									},
									false,
								) ?? false
							)
						}

						// 使用兼容移动端的方式提取元数据
						const metadata = extractClipboardMetadata(clipboardData)
						console.log("📋 Extracted clipboard metadata:", metadata)

						if (!metadata) {
							return false
						}

						const mentions = Array.isArray(metadata.mentions) ? metadata.mentions : null
						const mentionItems = mentions
							? prepareMentionItems(
									mentions,
									metadata,
									this.options.dataService ?? null,
								)
							: []
						const syncMentions = (
							additionalMentions: TiptapMentionAttributes[] = [],
						) => {
							const allMentions = deduplicateMentions([
								...mentionItems,
								...additionalMentions,
							])
							if (allMentions.length > 0) this.options.onMentionsInsert?.(allMentions)
						}

						// 处理富文本内容
						if (metadata.richText) {
							try {
								const content = prepareRichTextContent(
									JSON.parse(metadata.richText),
									metadata,
									this.options.dataService ?? null,
								)
								const converted = replaceWorkspaceLinksInRichText(
									content,
									attachments,
								)
								const editorContent = transformInspectorContent(converted.content)
								return (
									runActiveEditor(
										this.editor,
										(editor) => {
											if (!editor.commands.insertContent(editorContent))
												return false
											syncMentions(converted.mentions)
											return true
										},
										false,
									) ?? false
								)
							} catch (err) {
								console.error("❌ Failed to parse rich text content:", err)
								syncMentions()
							}
						} else {
							syncMentions()
						}

						return false
					},
				},
			}),
		]
	},
})

export default CopyMessageExtension
