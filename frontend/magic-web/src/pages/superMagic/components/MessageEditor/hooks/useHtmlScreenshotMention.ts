import { useEffect, useState } from "react"
import type { TiptapMentionAttributes } from "@/components/business/MentionPanel/tiptap-plugin"
import {
	getHtmlScreenshotMention,
	subscribeHtmlScreenshotTarget,
} from "../services/HtmlScreenshotTargetStore"

/** Resolve a screenshot mention from node attrs or the target store. */
export function useHtmlScreenshotMention(
	targetId?: string | null,
	fallback?: TiptapMentionAttributes | null,
): TiptapMentionAttributes | null {
	const [storeMention, setStoreMention] = useState<TiptapMentionAttributes | null>(() =>
		targetId ? (getHtmlScreenshotMention(targetId) ?? null) : null,
	)

	useEffect(() => {
		if (!targetId) {
			setStoreMention(null)
			return
		}

		setStoreMention(getHtmlScreenshotMention(targetId) ?? null)
		return subscribeHtmlScreenshotTarget(targetId, () => {
			setStoreMention(getHtmlScreenshotMention(targetId) ?? null)
		})
	}, [targetId])

	return fallback ?? storeMention
}
