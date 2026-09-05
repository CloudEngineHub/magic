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
import type { DataService, ProjectFileMentionData } from "@/components/business/MentionPanel/types"
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
	resolveClipboardContent,
	resolveMentionForClipboard,
} from "@/pages/superMagic/components/MessageList/utils/mentionClipboard"
import {
	escapeMarkdownLinkLabel,
	extractMarkdownFileLinks,
	parseMarkdownFileHref,
	type MarkdownFileTarget,
} from "@/pages/superMagic/utils/filePathMention"
import {
	resolveReferencedProjectAttachment,
	type ReferencedProjectAttachment,
	type ReferencedProjectFileTarget,
} from "@/pages/superMagic/services/referencedProjectAttachmentResolver"
import { loadProjectAttachments } from "@/pages/superMagic/services/projectAttachmentsLoader"
import { collectMentionItemsFromContent } from "../services/uploadMentionService"

interface CopyMessageOptions {
	onMentionsInsert?: (items: TiptapMentionAttributes[]) => void
	onContentChange?: (content: JSONContent) => void
	dataService?: DataService | null
	getWorkspaceFilesList?: () => AttachmentItem[]
	getCurrentProjectId?: () => string | undefined
}

type PastePart =
	| { type: "text"; text: string }
	| { type: "mention"; attrs: TiptapMentionAttributes }

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

function collectMentionAttrs(node: ProseMirrorNode, mentions: TiptapMentionAttributes[]): void {
	if (node.type.name === "mention" && node.attrs) {
		mentions.push(node.attrs as TiptapMentionAttributes)
	} else if (node.type.name === INSPECTOR_DETAIL_TYPE) {
		for (const key of ["fileMention", "screenshotMention"] as const) {
			if (node.attrs[key]) mentions.push(node.attrs[key] as TiptapMentionAttributes)
		}
	}

	node.forEach((child) => collectMentionAttrs(child, mentions))
}

interface ClipboardPayload {
	plainText: string
	htmlWithMetadata: string
	metadata: Record<string, unknown>
}

function createClipboardPayload(
	view: EditorView,
	workspaceFiles: AttachmentItem[],
	currentProjectId?: string,
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

	// 没有文件路径也需要保留 JSON；独立元素标签同样不能退回浏览器的纯文本复制。
	const containsInspector = (node: JSONContent): boolean =>
		node.type === INSPECTOR_DETAIL_TYPE || Boolean(node.content?.some(containsInspector))
	if (mentions.length === 0 && !containsInspector(richTextJson)) return null

	const clipboardContent = resolveClipboardContent(richTextJson, workspaceFiles, currentProjectId)
	const clipboardMentions = mentions.map((attrs) =>
		resolveMentionForClipboard(attrs, workspaceFiles, currentProjectId),
	)

	const metadata: Record<string, unknown> = {
		richText: JSON.stringify(clipboardContent),
		sourceProjectId: currentProjectId,
	}
	if (clipboardMentions.length > 0) {
		metadata.mentions = clipboardMentions.map((attrs) => ({ attrs }))
	}

	const metadataBase64 = btoa(encodeURIComponent(JSON.stringify(metadata)))
	const htmlContent = getClipboardHtml(tempDiv.innerHTML, workspaceFiles, currentProjectId)

	return {
		plainText: getClipboardPlainText(clipboardContent, workspaceFiles, currentProjectId),
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

function buildPlainTextPasteParts(
	text: string,
	attachments: AttachmentItem[],
	referencedProjectAttachments: ReferencedProjectAttachmentMap = EMPTY_REFERENCED_PROJECT_ATTACHMENTS,
): PastePart[] | null {
	const matches = extractMarkdownFileLinks(text)
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

function formatMarkdownLink(label: string, href: string): string {
	const destination = href.includes(" ") ? `<${href}>` : href
	return `[${escapeMarkdownLinkLabel(label)}](${destination})`
}

function buildHtmlPasteParts(
	html: string,
	attachments: AttachmentItem[],
	referencedProjectAttachments: ReferencedProjectAttachmentMap = EMPTY_REFERENCED_PROJECT_ATTACHMENTS,
): PastePart[] | null {
	if (!html) return null

	const container = document.createElement("div")
	container.innerHTML = html
	const parts: PastePart[] = []
	let recognizedLinkCount = 0
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
			const href = node.getAttribute("href") || ""
			const target = parseMarkdownFileHref(href)
			if (!target) {
				appendText(parts, node.textContent || "")
				return
			}

			recognizedLinkCount++
			const attrs = createMentionFromMarkdownTarget(
				target,
				attachments,
				referencedProjectAttachments,
			)
			if (attrs) {
				parts.push({ type: "mention", attrs })
			} else {
				appendText(parts, formatMarkdownLink(node.textContent || href, href))
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
	return recognizedLinkCount > 0 ? parts : null
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
	const htmlTargets = extractHtmlMarkdownFileTargets(html)
	if (htmlTargets.length > 0) return htmlTargets

	return extractMarkdownFileLinks(plainText).map((match) => match.target)
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
	return (
		buildHtmlPasteParts(html, attachments, referencedProjectAttachments) ||
		buildPlainTextPasteParts(plainText, attachments, referencedProjectAttachments)
	)
}

function hasMentionPart(parts: PastePart[] | null): parts is PastePart[] {
	return Boolean(parts?.some((part) => part.type === "mention"))
}

function getClipboardFallbackText(html: string, plainText: string): string {
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

function prepareMentionAttrs(
	attrs: TiptapMentionAttributes,
	metadata: MagicClipboardMetadata,
	dataService?: DataService | null,
): TiptapMentionAttributes | null {
	const sourceProjectId =
		attrs.type === MentionItemType.PROJECT_FILE && metadata.sourceProjectId
			? (attrs.data as ProjectFileMentionData).source_project_id ||
				(attrs.data as ProjectFileMentionData).project_id ||
				metadata.sourceProjectId
			: metadata.sourceProjectId
	const pendingProjectFileMention = markProjectFileMentionForCopy(attrs, sourceProjectId)
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
	if (content.type === INSPECTOR_DETAIL_TYPE && content.attrs) {
		const attrs = { ...content.attrs }
		for (const key of ["fileMention", "screenshotMention"] as const) {
			if (attrs[key]) {
				attrs[key] = prepareMentionAttrs(
					attrs[key] as TiptapMentionAttributes,
					metadata,
					dataService,
				)
			}
		}
		transformedContent = { ...content, attrs }
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
	// Tiptap 会反转同优先级扩展；先恢复资源，再让通用文本插件处理剩余粘贴。
	priority: 110,

	addOptions() {
		return {
			onMentionsInsert: undefined,
			dataService: null,
			getWorkspaceFilesList: undefined,
			getCurrentProjectId: undefined,
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
							const payload = createClipboardPayload(
								view,
								workspaceFiles,
								this.options.getCurrentProjectId?.(),
							)
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
					handlePaste: (view, event) => {
						const clipboardData = event.clipboardData
						if (!clipboardData) return false

						const isMagic = isMagicClipboard(clipboardData)
						const attachments = this.options.getWorkspaceFilesList?.() ?? []
						if (!isMagic) {
							const html = clipboardData.getData("text/html")
							const plainText = clipboardData.getData("text/plain")
							const targets = getPreferredMarkdownFileTargets(html, plainText)
							const hasReferencedProjectTarget = targets.some(
								(target) => target.scope === "referenced-project",
							)
							const currentProjectId = this.options.getCurrentProjectId?.()
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
								if (!hasMentionPart(parts)) return false

								const paste = buildPasteContent(parts)
								return (
									runActiveEditor(
										this.editor,
										(editor) => {
											if (
												!editor.commands.insertContent(
													transformInspectorContent(paste.content),
												)
											)
												return false
											this.options.onMentionsInsert?.(paste.mentions)
											return true
										},
										false,
									) ?? false
								)
							}

							event.preventDefault()
							const initialDoc = view.state.doc
							const initialSelection = {
								from: view.state.selection.from,
								to: view.state.selection.to,
							}
							const fallbackPaste = buildPasteContent([
								{ type: "text", text: getClipboardFallbackText(html, plainText) },
							])

							void (async () => {
								let resolvedPaste: ReturnType<typeof buildPasteContent> | null =
									null
								try {
									// 仅在可见列表未命中时查询隐藏文件，不改变文件面板的可见性。
									const [referencedProjectAttachments, workspaceFiles] =
										await Promise.all([
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
										resolvedPaste.content = transformInspectorContent(
											resolvedPaste.content,
										)
									}
								} catch (error) {
									console.warn(
										"Referenced project Markdown paste could not be resolved",
										error,
									)
								}

								try {
									runActiveEditor(this.editor, (editor) => {
										if (
											this.options.getCurrentProjectId?.() !==
											currentProjectId
										)
											return
										// 文档内容发生变化时不再按旧位置转换，只在当前光标处插入一次原始 Markdown。
										const canUseCapturedSelection = initialDoc.eq(
											editor.state.doc,
										)
										const paste = canUseCapturedSelection
											? resolvedPaste || fallbackPaste
											: fallbackPaste
										const inserted = canUseCapturedSelection
											? editor.commands.insertContentAt(
													initialSelection,
													paste.content,
												)
											: editor.commands.insertContent(paste.content)
										if (inserted && paste.mentions.length > 0) {
											this.options.onMentionsInsert?.(paste.mentions)
										}
									})
								} catch (error) {
									console.warn(
										"Referenced project Markdown paste could not be inserted",
										error,
									)
								}
							})()

							return true
						}

						// 使用兼容移动端的方式提取元数据
						const metadata = extractClipboardMetadata(clipboardData)

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
											syncMentions(
												collectMentionItemsFromContent(editorContent).map(
													(item) => item.attrs,
												),
											)
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
