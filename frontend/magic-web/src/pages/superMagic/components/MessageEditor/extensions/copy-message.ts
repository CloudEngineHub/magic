import { Extension, type JSONContent } from "@/infrastructure/editors/tiptap/core"
import { DOMSerializer, type Node as ProseMirrorNode } from "prosemirror-model"
import { Plugin, PluginKey } from "prosemirror-state"
import type { EditorView } from "prosemirror-view"
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
import { INSPECTOR_DETAIL_TYPE } from "./inspector-detail/const"
import type { AttachmentItem } from "@/pages/superMagic/components/TopicFilesButton/hooks"
import { MentionItemType } from "@/components/business/MentionPanel/types"
import {
	createDirectoryMentionData,
	createProjectFileMentionData,
} from "@/components/business/MentionPanel/utils/projectReferenceMention"
import { findAttachmentByPath } from "@/pages/superMagic/components/MessageList/components/Text/components/Markdown/parser/helper"
import {
	getClipboardHtml,
	getClipboardPlainText,
	getMentionClipboardRepresentation,
	resolveClipboardContent,
	resolveMentionForClipboard,
} from "@/pages/superMagic/components/MessageList/utils/mentionClipboard"
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

function createWorkspaceMention(
	attachments: AttachmentItem[],
	path: string,
): TiptapMentionAttributes | null {
	const file = findAttachmentByPath(attachments, path)
	if (!file?.file_id) return null

	if (file.is_directory || file.type === "directory") {
		return {
			type: MentionItemType.FOLDER,
			data: createDirectoryMentionData(file),
		}
	}

	return {
		type: MentionItemType.PROJECT_FILE,
		data: createProjectFileMentionData(file),
	}
}

function collectMentionAttrs(node: ProseMirrorNode, mentions: TiptapMentionAttributes[]): void {
	if (node.type.name === "mention" && node.attrs) {
		mentions.push(node.attrs as TiptapMentionAttributes)
	} else if (node.type.name === INSPECTOR_DETAIL_TYPE && node.attrs?.fileMention) {
		mentions.push(node.attrs.fileMention as TiptapMentionAttributes)
	}

	node.forEach((child) => collectMentionAttrs(child, mentions))
}

function hasPortableProjectMention(
	mentions: TiptapMentionAttributes[],
	workspaceFiles: AttachmentItem[],
): boolean {
	return mentions.some((attrs) => {
		if (
			attrs.type !== MentionItemType.PROJECT_FILE &&
			attrs.type !== MentionItemType.UPLOAD_FILE &&
			attrs.type !== MentionItemType.FOLDER
		) {
			return false
		}

		try {
			return Boolean(getMentionClipboardRepresentation(attrs, workspaceFiles))
		} catch {
			return false
		}
	})
}

interface ClipboardPayload {
	plainText: string
	htmlWithMetadata: string
	metadata: Record<string, unknown>
}

function createClipboardPayload(
	view: EditorView,
	workspaceFiles: AttachmentItem[],
): ClipboardPayload | null {
	const { state } = view
	const { selection } = state
	if (selection.empty) return null

	const fragment = selection.content()
	const serializer = DOMSerializer.fromSchema(state.schema)
	const dom = serializer.serializeFragment(fragment.content)
	const tempDiv = document.createElement("div")
	tempDiv.appendChild(dom)

	const mentions: TiptapMentionAttributes[] = []
	const richTextJson: JSONContent = { type: "doc", content: [] }
	const richTextContent = richTextJson.content ?? []
	fragment.content.forEach((node: ProseMirrorNode) => {
		richTextContent.push(node.toJSON())
		collectMentionAttrs(node, mentions)
	})

	if (!hasPortableProjectMention(mentions, workspaceFiles)) return null

	const clipboardContent = resolveClipboardContent(richTextJson, workspaceFiles)
	const clipboardMentions = mentions.map((attrs) =>
		resolveMentionForClipboard(attrs, workspaceFiles),
	)

	const metadata: Record<string, unknown> = {
		richText: JSON.stringify(clipboardContent),
	}
	if (clipboardMentions.length > 0) {
		metadata.mentions = clipboardMentions.map((attrs) => ({ attrs }))
	}

	const metadataBase64 = btoa(encodeURIComponent(JSON.stringify(metadata)))
	const htmlContent = getClipboardHtml(tempDiv.innerHTML, workspaceFiles)

	return {
		plainText: getClipboardPlainText(clipboardContent, workspaceFiles),
		htmlWithMetadata: `<div data-magic-clipboard="${metadataBase64}">${htmlContent}</div>`,
		metadata,
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
		const attrs = createWorkspaceMention(attachments, match.path)
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
			const attrs = path ? createWorkspaceMention(attachments, path) : null
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
			getWorkspaceFilesList: undefined,
		}
	},

	addProseMirrorPlugins() {
		return [
			new Plugin({
				key: new PluginKey("copyMessage"),

				props: {
					handleDOMEvents: {
						copy: (view, event) => {
							// Only Super Magic editors provide workspace context; other editors keep native copy behavior.
							if (!this.options.getWorkspaceFilesList) return false

							const clipboardEvent = event as ClipboardEvent
							const clipboardData = clipboardEvent.clipboardData
							if (!clipboardData) return false

							const workspaceFiles = this.options.getWorkspaceFilesList()
							const payload = createClipboardPayload(view, workspaceFiles)
							if (!payload) return false

							clipboardEvent.preventDefault()
							clipboardData.setData("text/html", payload.htmlWithMetadata)
							clipboardData.setData("text/plain", payload.plainText)
							try {
								clipboardData.setData(
									"text/x-magic-message-rich-text",
									payload.metadata.richText as string,
								)
								if (payload.metadata.mentions) {
									clipboardData.setData(
										"text/x-magic-message-mentions",
										JSON.stringify(payload.metadata.mentions),
									)
								}
							} catch {
								// Some browsers reject custom clipboard MIME types; standard formats remain available.
							}

							return true
						},
					},
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
