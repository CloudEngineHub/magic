import type { JSONContent } from "@/infrastructure/editors/tiptap/core"
import {
	MentionItemType,
	type DirectoryMentionData,
	type ProjectFileMentionData,
	type UploadFileMentionData,
} from "@/components/business/MentionPanel/types"
import {
	getMentionDisplayName,
	getMentionUniqueId,
	type TiptapMentionAttributes,
} from "@/components/business/MentionPanel/tiptap-plugin/types"
import {
	createCanonicalWorkspaceHref,
	escapeHtmlText,
	escapeMarkdownLinkLabel,
} from "@/pages/superMagic/utils/filePathMention"
import { INSPECTOR_DETAIL_TYPE } from "@/pages/superMagic/components/MessageEditor/extensions/inspector-detail/const"
import type { AttachmentItem } from "@/pages/superMagic/components/TopicFilesButton/hooks"

function getWorkspaceResourceId(attrs: TiptapMentionAttributes): string | undefined {
	if (attrs.type === MentionItemType.FOLDER) {
		return (attrs.data as DirectoryMentionData).directory_id
	}
	if (attrs.type === MentionItemType.PROJECT_FILE || attrs.type === MentionItemType.UPLOAD_FILE) {
		return (attrs.data as ProjectFileMentionData | UploadFileMentionData).file_id
	}
	return undefined
}

function getWorkspaceResourcePath(attrs: TiptapMentionAttributes): string {
	if (attrs.type === MentionItemType.FOLDER) {
		return (attrs.data as DirectoryMentionData).directory_path || ""
	}
	if (attrs.type === MentionItemType.PROJECT_FILE || attrs.type === MentionItemType.UPLOAD_FILE) {
		const data = attrs.data as ProjectFileMentionData | UploadFileMentionData
		return data.relative_file_path || data.file_path || ""
	}
	return ""
}

function findWorkspaceResource(
	attrs: TiptapMentionAttributes,
	workspaceFiles: ReadonlyArray<AttachmentItem>,
): AttachmentItem | undefined {
	const resourceId = getWorkspaceResourceId(attrs)
	if (!resourceId) return undefined

	return workspaceFiles.find(
		(item) => item.file_id !== undefined && String(item.file_id) === String(resourceId),
	)
}

function isPendingUpload(attrs: TiptapMentionAttributes): boolean {
	if (attrs.type !== MentionItemType.UPLOAD_FILE) return false

	const status = (attrs.data as UploadFileMentionData).upload_status
	return status === "init" || status === "uploading" || status === "error"
}

/**
 * 历史 Mention 未持久化路径时，从当前工作区文件列表补全路径。
 * 消息渲染也使用这份列表解析文件信息和图标。
 */
export function resolveMentionForClipboard(
	attrs: TiptapMentionAttributes,
	workspaceFiles: ReadonlyArray<AttachmentItem> = [],
): TiptapMentionAttributes {
	if (
		attrs.type !== MentionItemType.FOLDER &&
		attrs.type !== MentionItemType.PROJECT_FILE &&
		attrs.type !== MentionItemType.UPLOAD_FILE
	) {
		return attrs
	}

	const workspaceResource = findWorkspaceResource(attrs, workspaceFiles)
	const workspacePath = workspaceResource?.relative_file_path || workspaceResource?.path || ""
	const path = workspacePath || getWorkspaceResourcePath(attrs)
	if (!path) return attrs

	if (attrs.type === MentionItemType.FOLDER) {
		const data = attrs.data as DirectoryMentionData
		if (data.directory_path === path) return attrs
		return {
			...attrs,
			data: { ...data, directory_path: path } as TiptapMentionAttributes["data"],
		}
	}

	const data = attrs.data as ProjectFileMentionData | UploadFileMentionData
	if (attrs.type === MentionItemType.UPLOAD_FILE) {
		const uploadData = data as UploadFileMentionData
		if (!workspaceResource || isPendingUpload(attrs) || workspaceResource.is_directory) {
			return {
				...attrs,
				data: {
					...uploadData,
					relative_file_path: path,
					file_path: path,
				} as TiptapMentionAttributes["data"],
			}
		}

		return {
			type: MentionItemType.PROJECT_FILE,
			data: {
				file_id: uploadData.file_id,
				file_name:
					uploadData.file_name ||
					workspaceResource?.file_name ||
					workspaceResource?.name ||
					"",
				file_path: path,
				relative_file_path: path,
				file_extension:
					uploadData.file_extension || workspaceResource?.file_extension || "",
				file_size: uploadData.file_size ?? workspaceResource?.file_size,
				project_id: workspaceResource?.project_id,
				is_hidden: uploadData.is_hidden ?? workspaceResource?.is_hidden,
			},
		}
	}

	if (data.relative_file_path === path && data.file_path === path) return attrs
	return {
		...attrs,
		data: {
			...data,
			relative_file_path: path,
			file_path: path,
		} as TiptapMentionAttributes["data"],
	}
}

/** 递归补全复制内容中的 Mention，确保内部剪贴板元数据也能恢复文件引用。 */
export function resolveClipboardContent(
	content: JSONContent,
	workspaceFiles: ReadonlyArray<AttachmentItem> = [],
): JSONContent {
	if (!content) return content

	let resolvedContent = content
	if (content.type === "mention" && content.attrs) {
		const attrs = content.attrs as TiptapMentionAttributes
		const resolvedAttrs = resolveMentionForClipboard(attrs, workspaceFiles)
		if (resolvedAttrs !== attrs) {
			resolvedContent = { ...resolvedContent, attrs: resolvedAttrs }
		}
	}

	if (content.type === INSPECTOR_DETAIL_TYPE && content.attrs?.fileMention) {
		const attrs = content.attrs.fileMention as TiptapMentionAttributes
		const resolvedAttrs = resolveMentionForClipboard(attrs, workspaceFiles)
		if (resolvedAttrs !== attrs) {
			resolvedContent = {
				...resolvedContent,
				attrs: { ...content.attrs, fileMention: resolvedAttrs },
			}
		}
	}

	if (Array.isArray(content.content)) {
		const resolvedChildren = content.content.map((child) =>
			resolveClipboardContent(child, workspaceFiles),
		)
		if (resolvedChildren.some((child, index) => child !== content.content?.[index])) {
			resolvedContent = { ...resolvedContent, content: resolvedChildren }
		}
	}

	return resolvedContent
}

export interface MentionClipboardRepresentation {
	plainText: string
	htmlContent: string
}

export function getMentionClipboardRepresentation(
	attrs: TiptapMentionAttributes,
	workspaceFiles: ReadonlyArray<AttachmentItem> = [],
): MentionClipboardRepresentation | null {
	const resolvedAttrs = resolveMentionForClipboard(attrs, workspaceFiles)
	let path = ""
	let label = ""

	if (resolvedAttrs.type === MentionItemType.FOLDER) {
		const data = resolvedAttrs.data as DirectoryMentionData
		path = data.directory_path
		label = data.directory_name?.trim() || ""
	} else if (
		resolvedAttrs.type === MentionItemType.PROJECT_FILE ||
		resolvedAttrs.type === MentionItemType.UPLOAD_FILE
	) {
		const data = resolvedAttrs.data as ProjectFileMentionData | UploadFileMentionData
		path = data.relative_file_path || data.file_path || ""
		label = data.file_name?.trim() || ""
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

function collectMentionIds(content: JSONContent, ids: Set<string>): void {
	if (content.type === "mention" && content.attrs) {
		ids.add(getMentionUniqueId(content.attrs as TiptapMentionAttributes))
	}

	if (content.type === INSPECTOR_DETAIL_TYPE && content.attrs?.fileMention) {
		ids.add(getMentionUniqueId(content.attrs.fileMention as TiptapMentionAttributes))
	}

	content.content?.forEach((child) => collectMentionIds(child, ids))
}

/** Add external attachment mentions to a copied document when they are rendered outside its JSON. */
export function prependPortableMentions(
	content: JSONContent,
	mentionAttrs: TiptapMentionAttributes[],
	workspaceFiles: ReadonlyArray<AttachmentItem> = [],
): JSONContent {
	const resolvedContent = resolveClipboardContent(content, workspaceFiles)
	const existingIds = new Set<string>()
	collectMentionIds(resolvedContent, existingIds)

	const missingMentions = mentionAttrs
		.map((attrs) => resolveMentionForClipboard(attrs, workspaceFiles))
		.filter((attrs) => Boolean(getMentionClipboardRepresentation(attrs, workspaceFiles)))
		.filter((attrs) => {
			const id = getMentionUniqueId(attrs)
			if (existingIds.has(id)) return false

			existingIds.add(id)
			return true
		})
	if (missingMentions.length === 0) return resolvedContent

	return {
		...resolvedContent,
		content: [
			{
				type: "paragraph",
				content: missingMentions.map((attrs) => ({ type: "mention", attrs })),
			},
			...(resolvedContent.content || []),
		],
	}
}

export function getClipboardPlainText(
	content: JSONContent,
	workspaceFiles: ReadonlyArray<AttachmentItem> = [],
): string {
	function serialize(node: JSONContent): string {
		if (node.type === "text") return node.text || ""

		if (node.type === "mention" && node.attrs) {
			const attrs = node.attrs as TiptapMentionAttributes
			const portable = getMentionClipboardRepresentation(attrs, workspaceFiles)
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

export function getClipboardHtml(
	htmlContent: string,
	workspaceFiles: ReadonlyArray<AttachmentItem> = [],
): string {
	const container = document.createElement("div")
	container.innerHTML = htmlContent

	container.querySelectorAll<HTMLElement>("span.magic-mention").forEach((element) => {
		const type = element.dataset.type
		const data = element.dataset.data
		if (!type || !data) return

		try {
			const attrs: TiptapMentionAttributes = {
				type: type as TiptapMentionAttributes["type"],
				data: JSON.parse(data) as TiptapMentionAttributes["data"],
			}
			const portable = getMentionClipboardRepresentation(attrs, workspaceFiles)
			if (!portable) return

			const replacement = document.createElement("span")
			replacement.innerHTML = portable.htmlContent
			const link = replacement.firstElementChild
			if (!link) return
			element.replaceWith(document.createTextNode(" "), link, document.createTextNode(" "))
		} catch {
			// 无法还原 attrs 时保留原 mention HTML，内部剪贴板元数据仍可继续使用。
		}
	})

	return container.innerHTML
}
