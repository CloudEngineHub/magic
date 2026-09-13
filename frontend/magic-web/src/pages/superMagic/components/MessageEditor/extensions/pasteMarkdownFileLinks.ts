import type { Editor, JSONContent } from "@/infrastructure/editors/tiptap/core"
import type { TiptapMentionAttributes } from "@/components/business/MentionPanel/tiptap-plugin/types"
import { MentionItemType } from "@/components/business/MentionPanel/types"
import {
	createDirectoryMentionData,
	createProjectFileMentionData,
} from "@/components/business/MentionPanel/utils/projectReferenceMention"
import type { AttachmentItem } from "@/pages/superMagic/components/TopicFilesButton/hooks"
import { findAttachmentByPath } from "@/pages/superMagic/utils/markdownFileReference"
import {
	extractMarkdownFileLinks,
	parseMarkdownFileHref,
	type MarkdownFileTarget,
} from "@/pages/superMagic/utils/filePathMention"
import { htmlToClipboardMarkdown } from "@/pages/superMagic/components/MessageList/utils/clipboardMarkdown"
import {
	resolveReferencedProjectAttachment,
	type ReferencedProjectAttachment,
	type ReferencedProjectFileTarget,
} from "@/pages/superMagic/services/referencedProjectAttachmentResolver"
import { loadProjectAttachments } from "@/pages/superMagic/services/projectAttachmentsLoader"
import { runActiveEditor } from "@/utils/tiptapEditorLifecycle"
import { transformInspectorContent } from "./inspector-detail"

export interface MarkdownFilePasteOptions {
	onMentionsInsert?: (items: TiptapMentionAttributes[]) => void
	getWorkspaceFilesList?: () => AttachmentItem[]
	getCurrentProjectId?: () => string | undefined
}

type PastePart =
	{ type: "text"; text: string } | { type: "mention"; attrs: TiptapMentionAttributes }

type ReferencedProjectAttachmentMap = ReadonlyMap<string, ReferencedProjectAttachment | null>

const EMPTY_REFERENCED_PROJECT_ATTACHMENTS: ReferencedProjectAttachmentMap = new Map()

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

function getReferencedProjectTargetKey(target: ReferencedProjectFileTarget): string {
	return JSON.stringify([target.projectId, target.relativePath])
}

function createReferencedProjectMention(
	target: ReferencedProjectFileTarget,
	attachments: ReferencedProjectAttachmentMap,
): TiptapMentionAttributes | null {
	const file = attachments.get(getReferencedProjectTargetKey(target))
	if (!file?.file_id) return null

	const data = createProjectFileMentionData(file, {
		fileId: String(file.file_id),
		filePath: target.relativePath,
	})
	return {
		type: MentionItemType.PROJECT_FILE,
		data: {
			...data,
			file_path: target.relativePath,
			relative_file_path: target.relativePath,
			project_id: target.projectId,
		},
	}
}

function createMentionFromMarkdownTarget(
	target: MarkdownFileTarget,
	workspaceAttachments: AttachmentItem[],
	referencedProjectAttachments: ReferencedProjectAttachmentMap,
): TiptapMentionAttributes | null {
	if (target.scope === "workspace") {
		return createWorkspaceMention(workspaceAttachments, target.relativePath)
	}

	return createReferencedProjectMention(target, referencedProjectAttachments)
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

function hasMagicSelection(text: string): boolean {
	return /<magic-selection>[\s\S]*?<\/magic-selection>/.test(text)
}

function extractPasteFileLinks(text: string) {
	const selectionRanges = [...text.matchAll(/<magic-selection>([\s\S]*?)<\/magic-selection>/g)]
	return extractMarkdownFileLinks(text).filter((match) => {
		const selection = selectionRanges.find(
			(range) =>
				match.startIndex >= (range.index ?? 0) &&
				match.endIndex <= (range.index ?? 0) + range[0].length,
		)
		if (!selection) return true
		// 引用原文中的 Markdown 示例仍是资料，只解析 File／Screenshot 的实际附件链接。
		return /(?:^|\\n)(?:File|Screenshot): $/.test(
			text.slice((selection.index ?? 0) + "<magic-selection>".length, match.startIndex),
		)
	})
}

function buildPlainTextPasteParts(
	text: string,
	attachments: AttachmentItem[],
	referencedProjectAttachments: ReferencedProjectAttachmentMap = EMPTY_REFERENCED_PROJECT_ATTACHMENTS,
): PastePart[] | null {
	const matches = extractPasteFileLinks(text)
	if (matches.length === 0) return null

	const parts: PastePart[] = []
	let lastIndex = 0
	for (const match of matches) {
		appendText(parts, text.slice(lastIndex, match.startIndex))
		const attrs = createMentionFromMarkdownTarget(
			match.target,
			attachments,
			referencedProjectAttachments,
		)
		if (attrs) {
			parts.push({ type: "mention", attrs })
		} else {
			appendText(parts, match.fullMatch)
		}
		lastIndex = match.endIndex
	}
	appendText(parts, text.slice(lastIndex))

	return parts
}

export function replaceWorkspaceLinksInRichText(
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

function buildHtmlPasteParts(
	html: string,
	attachments: AttachmentItem[],
	referencedProjectAttachments: ReferencedProjectAttachmentMap = EMPTY_REFERENCED_PROJECT_ATTACHMENTS,
): PastePart[] | null {
	if (!html) return null

	const container = document.createElement("div")
	container.innerHTML = html
	const hasFileLink = Array.from(container.querySelectorAll("a[href]")).some(
		(anchor) =>
			!anchor.closest("code, pre") &&
			Boolean(parseMarkdownFileHref(anchor.getAttribute("href") || "")),
	)
	if (!hasFileLink) return null

	// 先保留 Markdown 格式，再只替换文件链接；块间排版空白不能当作正文换行。
	return buildPlainTextPasteParts(
		htmlToClipboardMarkdown(container),
		attachments,
		referencedProjectAttachments,
	)
}

function extractHtmlMarkdownFileTargets(html: string): MarkdownFileTarget[] {
	if (!html) return []

	const container = document.createElement("div")
	container.innerHTML = html
	return Array.from(container.querySelectorAll("a[href]"))
		.filter((anchor) => !anchor.closest("code, pre"))
		.map((anchor) => parseMarkdownFileHref(anchor.getAttribute("href") || ""))
		.filter((target): target is MarkdownFileTarget => Boolean(target))
}

function getPreferredMarkdownFileTargets(html: string, plainText: string): MarkdownFileTarget[] {
	if (hasMagicSelection(plainText))
		return extractPasteFileLinks(plainText).map((match) => match.target)
	const htmlTargets = extractHtmlMarkdownFileTargets(html)
	if (htmlTargets.length > 0) return htmlTargets

	return extractPasteFileLinks(plainText).map((match) => match.target)
}

async function resolveReferencedProjectTargets(
	targets: MarkdownFileTarget[],
): Promise<ReferencedProjectAttachmentMap> {
	const uniqueTargets = new Map<string, ReferencedProjectFileTarget>()
	for (const target of targets) {
		if (target.scope !== "referenced-project") continue
		uniqueTargets.set(getReferencedProjectTargetKey(target), target)
	}

	const resolvedEntries = await Promise.all(
		Array.from(uniqueTargets.entries()).map(async ([key, target]) => {
			const attachment = await resolveReferencedProjectAttachment(target)
			return [key, attachment] as const
		}),
	)
	return new Map(resolvedEntries)
}

function buildClipboardPasteParts(
	html: string,
	plainText: string,
	attachments: AttachmentItem[],
	referencedProjectAttachments: ReferencedProjectAttachmentMap = EMPTY_REFERENCED_PROJECT_ATTACHMENTS,
): PastePart[] | null {
	if (hasMagicSelection(plainText))
		return buildPlainTextPasteParts(plainText, attachments, referencedProjectAttachments)
	return (
		buildHtmlPasteParts(html, attachments, referencedProjectAttachments) ||
		buildPlainTextPasteParts(plainText, attachments, referencedProjectAttachments)
	)
}

function hasMentionPart(parts: PastePart[] | null): parts is PastePart[] {
	return Boolean(parts?.some((part) => part.type === "mention"))
}

function getClipboardFallbackText(html: string, plainText: string): string {
	if (hasMagicSelection(plainText)) return plainText
	const htmlParts = buildHtmlPasteParts(html, [], EMPTY_REFERENCED_PROJECT_ATTACHMENTS)
	if (!htmlParts) return plainText

	return htmlParts.map((part) => (part.type === "text" ? part.text : "")).join("")
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

/** 恢复标准文件链接；异步查询仅在当前列表缺失或链接指向跨项目挂载时执行。 */
export function pasteMarkdownFileLinks(
	editor: Editor,
	clipboardData: DataTransfer,
	options: MarkdownFilePasteOptions,
): boolean {
	const view = editor.view
	const attachments = options.getWorkspaceFilesList?.() ?? []
	const html = clipboardData.getData("text/html")
	const plainText = clipboardData.getData("text/plain")
	const targets = getPreferredMarkdownFileTargets(html, plainText)
	const hasReferencedProjectTarget = targets.some(
		(target) => target.scope === "referenced-project",
	)
	const currentProjectId = options.getCurrentProjectId?.()
	const needsWorkspaceLookup = Boolean(
		currentProjectId &&
		targets.some(
			(target) =>
				target.scope === "workspace" &&
				!findAttachmentByPath(attachments, target.relativePath),
		),
	)

	if (!hasReferencedProjectTarget && !needsWorkspaceLookup) {
		const parts = buildClipboardPasteParts(html, plainText, attachments)
		if (!hasMentionPart(parts) && !hasMagicSelection(plainText)) return false

		const paste = buildPasteContent(parts ?? [{ type: "text", text: plainText }])
		return (
			runActiveEditor(
				editor,
				(editor) => {
					if (!editor.commands.insertContent(transformInspectorContent(paste.content)))
						return false
					options.onMentionsInsert?.(paste.mentions)
					return true
				},
				false,
			) ?? false
		)
	}

	const initialDoc = view.state.doc
	const initialSelection = {
		from: view.state.selection.from,
		to: view.state.selection.to,
	}
	const fallbackPaste = buildPasteContent([
		{ type: "text", text: getClipboardFallbackText(html, plainText) },
	])

	void (async () => {
		let resolvedPaste: ReturnType<typeof buildPasteContent> | null = null
		try {
			// 仅在可见列表未命中时查询隐藏文件，不改变文件面板的可见性。
			const [referencedProjectAttachments, workspaceFiles] = await Promise.all([
				resolveReferencedProjectTargets(targets),
				needsWorkspaceLookup && currentProjectId
					? loadProjectAttachments({
							projectId: currentProjectId,
							includeHidden: true,
							enableErrorMessagePrompt: false,
						})
							.then((result) => result.list)
							.catch((error: unknown) => {
								console.warn(
									"Workspace Markdown paste could not be resolved",
									error,
								)
								return attachments
							})
					: attachments,
			])
			const parts = buildClipboardPasteParts(
				html,
				plainText,
				workspaceFiles,
				referencedProjectAttachments,
			)
			if (parts) {
				resolvedPaste = buildPasteContent(parts)
				resolvedPaste.content = transformInspectorContent(resolvedPaste.content)
			}
		} catch (error) {
			console.warn("Referenced project Markdown paste could not be resolved", error)
		}

		try {
			runActiveEditor(editor, (editor) => {
				if (options.getCurrentProjectId?.() !== currentProjectId) return
				// 文档内容发生变化时不再按旧位置转换，只在当前光标处插入一次原始 Markdown。
				const canUseCapturedSelection = initialDoc.eq(editor.state.doc)
				const paste = canUseCapturedSelection
					? resolvedPaste || fallbackPaste
					: fallbackPaste
				const inserted = canUseCapturedSelection
					? editor.commands.insertContentAt(initialSelection, paste.content)
					: editor.commands.insertContent(paste.content)
				if (inserted && paste.mentions.length > 0) {
					options.onMentionsInsert?.(paste.mentions)
				}
			})
		} catch (error) {
			console.warn("Referenced project Markdown paste could not be inserted", error)
		}
	})()

	return true
}
