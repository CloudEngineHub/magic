import type { JSONContent } from "@tiptap/react"

import { MentionItemType } from "@/components/business/MentionPanel/types"
import { INSPECTOR_DETAIL_TYPE } from "@/pages/superMagic/components/MessageEditor/extensions/inspector-detail/const"
import type { InspectedElementInfo } from "./types"

/** Build the structured inspector context inserted into the agent input. */
export function buildAgentPromptContent(
	info: InspectedElementInfo,
	title: string,
	fileInfo?: { fileId: string; fileName: string; filePath: string },
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
				},
			},
		],
	})

	return { type: "doc", content: paragraphs }
}
