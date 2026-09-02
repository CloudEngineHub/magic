import type { JSONContent } from "@/infrastructure/editors/tiptap/react"

import { MentionItemType } from "@/components/business/MentionPanel/types"
import { INSPECTOR_DETAIL_TYPE } from "@/pages/superMagic/components/MessageEditor/extensions/inspector-detail/const"
import type {
	HtmlMultiSelectionRequestTarget,
	HtmlSelectionTarget,
	InspectedElementInfo,
} from "./types"
import type { TiptapMentionAttributes } from "@/components/business/MentionPanel/tiptap-plugin"
import { getHtmlElementLabel } from "./selection"

/** Build the structured inspector context inserted into the agent input. */
export function buildAgentPromptContent(
	info: InspectedElementInfo,
	title: string,
	fileInfo?: { fileId: string; fileName: string; filePath: string },
	screenshotMention?: TiptapMentionAttributes | null,
	targetId?: string,
): JSONContent {
	const paragraphs: JSONContent[] = []
	const fileMention = fileInfo
		? {
				type: MentionItemType.PROJECT_FILE,
				data: {
					file_id: fileInfo.fileId,
					file_name: fileInfo.fileName,
					file_path: fileInfo.filePath,
					file_extension: fileInfo.fileName.includes(".")
						? (fileInfo.fileName.split(".").pop() ?? "")
						: "",
				},
			}
		: null

	const keyStyleProps = [
		"display",
		"position",
		"width",
		"height",
		"color",
		"backgroundColor",
		"fontSize",
		"fontFamily",
		"margin",
		"padding",
		"border",
		"borderRadius",
		"flexDirection",
		"alignItems",
		"justifyContent",
		"gap",
		"overflow",
		"zIndex",
	] as const
	const styleLines = keyStyleProps.flatMap((prop) => {
		const value = info.computedStyles[prop as keyof typeof info.computedStyles]
		if (
			value &&
			value !== "none" &&
			value !== "normal" &&
			value !== "auto" &&
			value !== "0px"
		) {
			return [`${prop}: ${value}`]
		}
		return []
	})

	const computedStyles: Record<string, string> = {}
	for (const line of styleLines) {
		const separatorIndex = line.indexOf(": ")
		if (separatorIndex > 0) {
			computedStyles[line.slice(0, separatorIndex)] = line.slice(separatorIndex + 2)
		}
	}
	const textPreview = info.textContent
		? info.textContent.length > 60
			? `${info.textContent.slice(0, 60)}…`
			: info.textContent
		: ""

	paragraphs.push({
		type: "paragraph",
		content: [
			{
				type: INSPECTOR_DETAIL_TYPE,
				attrs: {
					title,
					selector: info.selector,
					tagName: info.tagName,
					size: `${Math.round(info.rect.width)} × ${Math.round(info.rect.height)} px`,
					computedStyles: JSON.stringify(computedStyles),
					styleCount: styleLines.length,
					textContent: textPreview,
					elementAttributes: JSON.stringify(info.attributes ?? {}),
					resource: info.resource ?? "",
					domContext: JSON.stringify(info.domContext ?? {}),
					elementHtml: info.elementHtml ?? "",
					selectorMatchCount: info.selectorMatchCount ?? -1,
					fileMention,
					screenshotMention,
					...(targetId ? { targetId } : {}),
				},
			},
		],
	})

	return { type: "doc", content: paragraphs }
}

function buildFileMention(fileInfo: {
	fileId: string
	fileName: string
	filePath: string
}): TiptapMentionAttributes {
	return {
		type: MentionItemType.PROJECT_FILE,
		data: {
			file_id: fileInfo.fileId,
			file_name: fileInfo.fileName,
			file_path: fileInfo.filePath,
			file_extension: fileInfo.fileName.includes(".")
				? (fileInfo.fileName.split(".").pop() ?? "")
				: "",
		},
	}
}

function buildInspectorDetailNode(
	info: InspectedElementInfo,
	title: string,
	screenshotMention?: TiptapMentionAttributes | null,
	targetId?: string,
): JSONContent {
	const content = buildAgentPromptContent(info, title, undefined, screenshotMention, targetId)
	return content.content?.[0]?.content?.[0] ?? { type: "text", text: info.tagName }
}

/**
 * Reuse the inspector-detail node when a multi-selection request has already
 * been normalized to its transport shape and no longer contains full element
 * inspection data.
 */
function buildInspectorDetailNodeFromTarget(
	target: HtmlMultiSelectionRequestTarget,
	title: string,
	screenshotMention?: TiptapMentionAttributes | null,
): JSONContent {
	const tagName =
		target.selector.match(/(?:^|\s|>)\s*([a-z][a-z0-9-]*)/i)?.[1] ??
		target.elementLabel.match(/^[a-z][a-z0-9-]*/i)?.[0] ??
		""
	return {
		type: INSPECTOR_DETAIL_TYPE,
		attrs: {
			title,
			selector: target.selector,
			tagName,
			size: "",
			computedStyles: "{}",
			styleCount: 0,
			textContent: target.textContent ?? "",
			elementAttributes: "{}",
			resource: "",
			domContext: target.domContext ? JSON.stringify(target.domContext) : "{}",
			elementHtml: target.elementHtml ?? "",
			selectorMatchCount: -1,
			screenshotMention,
			...(target.id ? { targetId: target.id } : {}),
		},
	}
}

/** Build the message content used by multi-target HTML editing submission. */
export function buildHtmlMultiSelectionPromptContent(
	fileInfo: { fileId: string; fileName: string; filePath: string },
	targets: Array<HtmlSelectionTarget | HtmlMultiSelectionRequestTarget>,
	title: string,
	screenshotMentions: Map<string, TiptapMentionAttributes> = new Map(),
): JSONContent {
	const content: JSONContent[] = [
		{
			type: "paragraph",
			content: [
				{ type: "text", text: "请修改当前 HTML 文件：" },
				{ type: "mention", attrs: buildFileMention(fileInfo) },
			],
		},
		{
			type: "paragraph",
			content: [
				{
					type: "text",
					text: "请仅修改以下目标相关内容，并保持其他页面结构和样式不变。",
				},
			],
		},
	]

	targets.forEach((target, index) => {
		if (target.kind === "screenshot") {
			const mention = screenshotMentions.get(target.id ?? `screenshot:${index}`)
			content.push({
				type: "paragraph",
				content: [
					{ type: "text", text: `目标 ${index + 1}（图片区域）：` },
					...(mention ? [{ type: "mention", attrs: mention }] : []),
					{ type: "text", text: `\n修改要求：${target.instruction}` },
				],
			})
			return
		}

		const info = "info" in target ? target.info : undefined
		const label = info ? getHtmlElementLabel(info) : target.elementLabel
		content.push({
			type: "paragraph",
			content: [
				{
					type: "text",
					text: `目标 ${index + 1}（${label}）：${target.instruction}`,
				},
			],
		})
		if (info) {
			content.push({
				type: "paragraph",
				content: [buildInspectorDetailNode(info, title, undefined, target.id)],
			})
		} else {
			content.push({
				type: "paragraph",
				content: [buildInspectorDetailNodeFromTarget(target, title)],
			})
		}
	})

	return { type: "doc", content }
}
