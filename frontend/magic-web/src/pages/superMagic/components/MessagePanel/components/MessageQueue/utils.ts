import type { JSONContent } from "@/infrastructure/editors/tiptap/core"
import i18n from "i18next"
import type { QueuedMessage } from "../../hooks/useMessageQueue"

const MENTION_PREVIEW_FALLBACKS: Record<string, string> = {
	agent: "Agent",
	cloud_file: "Cloud File",
	design_marker: "Marker",
	mcp: "MCP",
	memory_directory: "Memory Folder",
	memory_file: "Memory File",
	project_directory: "Folder",
	project_file: "File",
	skill: "Skill",
	tool: "Tool",
	upload_file: "File",
}

/** Resolve a mention node into readable text without loading editor extensions. */
function getMentionPreviewText(node: JSONContent) {
	const data = node.attrs?.data as Record<string, unknown> | undefined
	const mentionType = typeof node.attrs?.type === "string" ? node.attrs.type : ""
	const displayName =
		data?.name ||
		data?.file_name ||
		data?.agent_name ||
		data?.directory_name ||
		data?.label ||
		node.attrs?.label ||
		node.attrs?.name ||
		MENTION_PREVIEW_FALLBACKS[mentionType]
	const memoryPrefix = i18n.t("super/longMemory:mentionPrefix", {
		defaultValue: "Memory",
	})

	if (typeof displayName !== "string" || !displayName) return ""
	if (mentionType === "memory_file" || mentionType === "memory_directory") {
		return `@${memoryPrefix}:${displayName}`
	}
	return `@${displayName}`
}

/** Walk TipTap JSON content so mobile previews avoid importing the full editor runtime. */
function collectTextFromContent(node: JSONContent): string {
	if (typeof node.text === "string") return node.text
	if (node.type === "mention") return getMentionPreviewText(node)
	if (!Array.isArray(node.content)) return ""

	return node.content.map(collectTextFromContent).filter(Boolean).join(" ")
}

/** Normalize rich queue content into the one-line preview used by the mobile queue card. */
export function normalizeQueuePreviewText(content: QueuedMessage["content"]) {
	return collectTextFromContent(content).replace(/\s+/g, " ").trim()
}

/** Trim leading/trailing whitespace while preserving rich-text nodes and mentions. */
export function trimQueueContent(content: QueuedMessage["content"]): JSONContent {
	const clonedContent = JSON.parse(JSON.stringify(content)) as JSONContent
	const textNodes: JSONContent[] = []

	const collectTextNodes = (node: JSONContent) => {
		if (typeof node.text === "string") textNodes.push(node)
		node.content?.forEach(collectTextNodes)
	}

	collectTextNodes(clonedContent)
	if (textNodes.length > 0) {
		textNodes[0].text = textNodes[0].text?.replace(/^\s+/, "")
		const lastTextNode = textNodes[textNodes.length - 1]
		lastTextNode.text = lastTextNode.text?.replace(/\s+$/, "")
	}

	const isBoundaryBreak = (node: JSONContent): boolean => {
		return node.type === "hardBreak" || node.type === "hard_break"
	}

	const trimBoundaryBreaks = (node: JSONContent) => {
		if (!Array.isArray(node.content)) return

		node.content.forEach(trimBoundaryBreaks)
		while (
			node.content[0] &&
			(isBoundaryBreak(node.content[0]) || !hasContent(node.content[0]))
		) {
			node.content.shift()
		}
		while (
			node.content.length > 0 &&
			(isBoundaryBreak(node.content[node.content.length - 1]) ||
				!hasContent(node.content[node.content.length - 1]))
		) {
			node.content.pop()
		}
	}

	const hasContent = (node: JSONContent): boolean => {
		if (typeof node.text === "string") return node.text.length > 0
		if (node.type === "mention") return true
		return node.content?.some(hasContent) ?? false
	}

	trimBoundaryBreaks(clonedContent)

	if (Array.isArray(clonedContent.content)) {
		while (clonedContent.content[0] && !hasContent(clonedContent.content[0])) {
			clonedContent.content.shift()
		}
		while (
			clonedContent.content.length > 0 &&
			!hasContent(clonedContent.content[clonedContent.content.length - 1])
		) {
			clonedContent.content.pop()
		}
	}

	return clonedContent
}
