import type { Editor, JSONContent } from "@/infrastructure/editors/tiptap/core"
import type {
	MentionListItem,
	TiptapMentionAttributes,
} from "@/components/business/MentionPanel/tiptap-plugin/types"
import {
	getMentionDisplayName,
	getMentionUniqueId,
} from "@/components/business/MentionPanel/tiptap-plugin/types"
import type {
	DataService,
	DirectoryMentionData,
	ProjectFileMentionData,
} from "@/components/business/MentionPanel/types"
import { MentionItemType } from "@/components/business/MentionPanel/types"
import {
	createDirectoryMentionData,
	createProjectFileMentionData,
} from "@/components/business/MentionPanel/utils/projectReferenceMention"
import { findAttachmentByPath } from "@/pages/superMagic/components/MessageList/components/Text/components/Markdown/parser/helper"
import type { AttachmentItem } from "@/pages/superMagic/components/TopicFilesButton/hooks"
import {
	extractWorkspaceMarkdownLinks,
	parseCanonicalWorkspaceHref,
} from "@/pages/superMagic/utils/filePathMention"
import projectFilesStore from "@/stores/projectFiles"
import {
	extractClipboardMetadata,
	isMagicClipboard,
	type MagicClipboardMetadata,
} from "@/utils/clipboard-helpers"
import { runActiveEditor } from "@/utils/tiptapEditorLifecycle"
import { transformInspectorContent } from "./inspector-detail"
import { isAllowedMention, markProjectFileMentionForCopy } from "../utils/mention"

export interface PasteMessageClipboardOptions {
	onMentionsInsert?: (items: TiptapMentionAttributes[]) => void
	dataService?: DataService | null
	getWorkspaceFilesList?: () => AttachmentItem[]
}

type PastePart =
	| { type: "text"; text: string }
	| { type: "mention"; attrs: TiptapMentionAttributes }

function collectWorkspaceAttachmentPools(preferred: AttachmentItem[]): AttachmentItem[][] {
	const pools: AttachmentItem[][] = []
	const pushUnique = (items: AttachmentItem[]) => {
		if (items.length === 0) return
		if (pools.some((pool) => pool === items)) return
		pools.push(items)
	}
	pushUnique(preferred)
	pushUnique(projectFilesStore.workspaceFilesList)
	pushUnique(projectFilesStore.workspaceFileTree)
	return pools.sort((left, right) => right.length - left.length)
}

function collectWorkspaceAttachments(preferred: AttachmentItem[]): AttachmentItem[] {
	return collectWorkspaceAttachmentPools(preferred)[0] ?? preferred
}

function findAttachmentByUniqueFileName(
	attachments: AttachmentItem[],
	fileName: string,
): AttachmentItem | undefined {
	const normalizedName = fileName.trim().toLowerCase()
	if (!normalizedName) return undefined

	const matches: AttachmentItem[] = []
	const visit = (items: AttachmentItem[]) => {
		for (const item of items) {
			if (item.children?.length) visit(item.children)
			const candidateName = String(item.file_name || item.filename || item.name || "")
				.trim()
				.toLowerCase()
			if (candidateName === normalizedName && item.file_id) {
				matches.push(item)
			}
		}
	}
	visit(attachments)
	const unique = Array.from(new Set(matches))
	return unique.length === 1 ? unique[0] : undefined
}

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

function resolvePathOnlyWorkspaceMention(
	attrs: TiptapMentionAttributes,
	attachments: AttachmentItem[],
): TiptapMentionAttributes | null {
	if (attrs.type !== MentionItemType.PROJECT_FILE && attrs.type !== MentionItemType.UPLOAD_FILE) {
		return null
	}

	const data = attrs.data as Record<string, unknown> | undefined
	if (!data || data.source_project_id) return null

	const path = String(data.file_path || data.relative_file_path || "").trim()
	const fileName = String(data.file_name || data.filename || "").trim()
	const pools = collectWorkspaceAttachmentPools(attachments)

	for (const pool of pools) {
		if (path) {
			const byPath = createWorkspaceMention(pool, path)
			if (byPath) return byPath
		}
		if (fileName) {
			const file = findAttachmentByUniqueFileName(pool, fileName)
			if (!file?.file_id) continue
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
	}

	return null
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
	attachments: AttachmentItem[] = [],
): TiptapMentionAttributes | null {
	const pendingProjectFileMention = markProjectFileMentionForCopy(attrs, metadata.sourceProjectId)
	if (pendingProjectFileMention) {
		return pendingProjectFileMention
	}

	const allowed = isAllowedMention(attrs, dataService)
	if (allowed) {
		return attrs
	}

	const workspaceMention = resolvePathOnlyWorkspaceMention(attrs, attachments)
	if (workspaceMention) {
		return workspaceMention
	}

	const passthroughStructuredMention =
		attrs.type === MentionItemType.PROJECT_FILE ||
		attrs.type === MentionItemType.UPLOAD_FILE ||
		attrs.type === MentionItemType.FOLDER

	if (passthroughStructuredMention) {
		const currentProjectId = projectFilesStore.currentSelectedProject?.id
		if (attrs.type === MentionItemType.PROJECT_FILE) {
			const fileData = (attrs.data || {}) as ProjectFileMentionData
			const sourceProjectId =
				fileData.source_project_id || fileData.project_id || currentProjectId
			if (sourceProjectId) {
				const structuredSourceFileId =
					fileData.source_file_id &&
					fileData.source_file_id !== fileData.file_path &&
					fileData.source_file_id !== fileData.relative_file_path
						? fileData.source_file_id
						: undefined
				return {
					...attrs,
					data: {
						...fileData,
						source_project_id: sourceProjectId,
						...(structuredSourceFileId
							? { source_file_id: structuredSourceFileId }
							: {}),
					},
				}
			}
		}
		if (attrs.type === MentionItemType.FOLDER) {
			const folderData = (attrs.data || {}) as DirectoryMentionData
			const sourceProjectId =
				folderData.source_project_id || folderData.project_id || currentProjectId
			if (sourceProjectId) {
				return {
					...attrs,
					data: {
						...folderData,
						source_project_id: sourceProjectId,
						source_directory_id:
							folderData.source_directory_id || folderData.directory_id,
					},
				}
			}
		}
		return attrs
	}

	return null
}

function prepareMentionItems(
	mentions: unknown[],
	metadata: MagicClipboardMetadata,
	dataService?: DataService | null,
	attachments: AttachmentItem[] = [],
): TiptapMentionAttributes[] {
	return (mentions as MentionListItem[])
		.map((mention) => prepareMentionAttrs(mention.attrs, metadata, dataService, attachments))
		.filter((mention): mention is TiptapMentionAttributes => Boolean(mention))
}

function prepareRichTextContent(
	content: JSONContent,
	metadata: MagicClipboardMetadata,
	dataService?: DataService | null,
	attachments: AttachmentItem[] = [],
): JSONContent {
	if (!content) return content

	let transformedContent = content

	if (content.type === "mention" && content.attrs) {
		const attrs = prepareMentionAttrs(
			content.attrs as TiptapMentionAttributes,
			metadata,
			dataService,
			attachments,
		)
		if (!attrs) {
			const data = content.attrs.data as Record<string, unknown> | undefined
			const fallbackName = String(
				data?.file_name ||
					data?.filename ||
					data?.directory_name ||
					getMentionDisplayName(content.attrs as TiptapMentionAttributes) ||
					"文件",
			).trim()
			return { type: "text", text: `@${fallbackName}` }
		}

		transformedContent = {
			...content,
			attrs,
		}
	}

	if (content.content && Array.isArray(content.content)) {
		const transformedChildren = content.content
			.map((child) => prepareRichTextContent(child, metadata, dataService, attachments))
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

function insertEditorContent(
	editor: Editor,
	content: JSONContent,
	mentions: TiptapMentionAttributes[],
	onMentionsInsert?: (items: TiptapMentionAttributes[]) => void,
): boolean {
	return (
		runActiveEditor(
			editor,
			(active) => {
				if (!active.commands.insertContent(content)) return false
				if (mentions.length > 0) onMentionsInsert?.(mentions)
				return true
			},
			false,
		) ?? false
	)
}

function pasteFromPortableClipboard(
	editor: Editor,
	htmlRaw: string,
	plainRaw: string,
	attachments: AttachmentItem[],
	onMentionsInsert?: (items: TiptapMentionAttributes[]) => void,
): boolean {
	const parts =
		buildHtmlPasteParts(htmlRaw, attachments) || buildPlainTextPasteParts(plainRaw, attachments)
	if (!parts) return false

	const paste = buildPasteContent(parts)
	return insertEditorContent(editor, paste.content, paste.mentions, onMentionsInsert)
}

function pasteFromMagicMetadata(
	editor: Editor,
	metadata: MagicClipboardMetadata,
	attachments: AttachmentItem[],
	options: PasteMessageClipboardOptions,
): boolean {
	const mentions = Array.isArray(metadata.mentions) ? metadata.mentions : null
	const mentionItems = mentions
		? prepareMentionItems(mentions, metadata, options.dataService ?? null, attachments)
		: []
	const syncMentions = (additionalMentions: TiptapMentionAttributes[] = []) => {
		const allMentions = deduplicateMentions([...mentionItems, ...additionalMentions])
		if (allMentions.length > 0) options.onMentionsInsert?.(allMentions)
	}

	if (metadata.richText) {
		try {
			const content = prepareRichTextContent(
				JSON.parse(metadata.richText),
				metadata,
				options.dataService ?? null,
				attachments,
			)
			const converted = replaceWorkspaceLinksInRichText(content, attachments)
			const editorContent = transformInspectorContent(converted.content)
			return (
				runActiveEditor(
					editor,
					(active) => {
						if (!active.commands.insertContent(editorContent)) return false
						syncMentions(converted.mentions)
						return true
					},
					false,
				) ?? false
			)
		} catch {
			syncMentions()
		}
	} else {
		syncMentions()
	}

	return false
}

/**
 * SuperMagic paste contract:
 * 1. Structured magic metadata → insert mentions
 * 2. Otherwise portable HTML / markdown rematch against workspace attachments
 * Never leave a magic-marked clipboard to the browser's text/plain default.
 */
export function pasteMessageClipboard(
	editor: Editor,
	clipboardData: DataTransfer,
	options: PasteMessageClipboardOptions,
): boolean {
	const attachments = collectWorkspaceAttachments(options.getWorkspaceFilesList?.() ?? [])
	const htmlRaw = clipboardData.getData("text/html")
	const plainRaw = clipboardData.getData("text/plain")

	if (!isMagicClipboard(clipboardData)) {
		return pasteFromPortableClipboard(
			editor,
			htmlRaw,
			plainRaw,
			attachments,
			options.onMentionsInsert,
		)
	}

	const metadata = extractClipboardMetadata(clipboardData)
	if (!metadata) {
		return pasteFromPortableClipboard(
			editor,
			htmlRaw,
			plainRaw,
			attachments,
			options.onMentionsInsert,
		)
	}

	return pasteFromMagicMetadata(editor, metadata, attachments, options)
}
