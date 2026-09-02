import type { TiptapMentionAttributes } from "@/components/business/MentionPanel/tiptap-plugin"
import { getHtmlScreenshotMention } from "../services/HtmlScreenshotTargetStore"

export function resolveInspectorScreenshotMention(attrs?: {
	screenshotMention?: TiptapMentionAttributes | null
	targetId?: string | null
}): TiptapMentionAttributes | undefined {
	if (attrs?.screenshotMention) return attrs.screenshotMention
	if (!attrs?.targetId) return undefined
	return getHtmlScreenshotMention(attrs.targetId)
}
