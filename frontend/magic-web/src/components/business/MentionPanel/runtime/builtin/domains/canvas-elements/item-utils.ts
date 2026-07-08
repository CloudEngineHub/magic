import type { CanvasElementMentionSourcePreview, MentionItem } from "../../../../types"

export const CANVAS_ELEMENT_TAG = "canvas-element"

export function isCanvasElementItem(item: Pick<MentionItem, "tags" | "sourcePreview">) {
	return (
		item.sourcePreview?.kind === "canvas-element" ||
		item.tags?.includes(CANVAS_ELEMENT_TAG) === true
	)
}

export function getCanvasElementSourcePreview(
	item: Pick<MentionItem, "sourcePreview">,
): CanvasElementMentionSourcePreview | null {
	const preview = item.sourcePreview
	return preview?.kind === "canvas-element" ? preview : null
}
