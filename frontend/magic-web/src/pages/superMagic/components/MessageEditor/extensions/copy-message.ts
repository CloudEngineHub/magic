import { Extension, type JSONContent } from "@tiptap/core"
import { Plugin, PluginKey } from "prosemirror-state"
import { isAllowedMention, markProjectFileMentionForCopy } from "../utils/mention"
import type {
	MentionListItem,
	TiptapMentionAttributes,
} from "@/components/business/MentionPanel/tiptap-plugin/types"
import type { DataService } from "@/components/business/MentionPanel/types"
import {
	extractClipboardMetadata,
	isMagicClipboard,
	type MagicClipboardMetadata,
} from "@/utils/clipboard-helpers"
import { runActiveEditor } from "@/utils/tiptapEditorLifecycle"
import { transformInspectorContent } from "./inspector-detail"

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

const CopyMessageExtension = Extension.create({
	name: "copyMessage",

	addOptions() {
		return {
			onMentionsInsert: () => null,
			dataService: null,
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

						// 检查是否是来自Magic应用的剪贴板数据
						if (!isMagicClipboard(clipboardData)) {
							return false
						}

						// 使用兼容移动端的方式提取元数据
						const metadata = extractClipboardMetadata(clipboardData)
						console.log("📋 Extracted clipboard metadata:", metadata)

						if (!metadata) {
							return false
						}

						// 处理富文本内容
						if (metadata.richText) {
							try {
								const mentionItems =
									metadata.mentions && Array.isArray(metadata.mentions)
										? prepareMentionItems(
												metadata.mentions,
												metadata,
												this.options.dataService ?? null,
											)
										: []
								const content = prepareRichTextContent(
									JSON.parse(metadata.richText),
									metadata,
									this.options.dataService ?? null,
								)
								const editorContent = transformInspectorContent(content)
								return (
									runActiveEditor(
										this.editor,
										(editor) => {
											if (!editor.commands.insertContent(editorContent))
												return false
											this.options.onMentionsInsert?.(mentionItems)
											return true
										},
										false,
									) ?? false
								)
							} catch (err) {
								console.error("❌ Failed to parse rich text content:", err)
							}
						}

						return false
					},
				},
			}),
		]
	},
})

export default CopyMessageExtension
