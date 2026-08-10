type PromptCarouselKeyboardEvent = Pick<
	KeyboardEvent,
	"key" | "shiftKey" | "metaKey" | "ctrlKey" | "altKey" | "isComposing"
>

export type PromptCarouselDirection = "previous" | "next"

interface ResolvePromptCarouselStateParams {
	promptCarouselConfigured: boolean
	hasEditorContent: boolean
	hasFiles: boolean
	isComposing: boolean
	aiCompletionEnabled: boolean
	previousState?: PromptCarouselState | null
}

export interface PromptCarouselState {
	promptCarouselEnabled: boolean
	aiCompletionEnabled: boolean
}

export function resolvePromptCarouselState({
	promptCarouselConfigured,
	hasEditorContent,
	hasFiles,
	isComposing,
	aiCompletionEnabled,
	previousState,
}: ResolvePromptCarouselStateParams): PromptCarouselState {
	if (isComposing && previousState) return previousState

	return {
		promptCarouselEnabled: promptCarouselConfigured && !hasEditorContent && !hasFiles,
		aiCompletionEnabled: aiCompletionEnabled && (!promptCarouselConfigured || hasEditorContent),
	}
}

export function tryAcceptPromptCarouselShortcut(
	event: PromptCarouselKeyboardEvent,
	onAccept?: () => boolean,
) {
	if (
		event.isComposing ||
		event.key !== "Tab" ||
		event.shiftKey ||
		event.metaKey ||
		event.ctrlKey ||
		event.altKey
	) {
		return false
	}

	return onAccept?.() ?? false
}

export function tryNavigatePromptCarouselShortcut(
	event: PromptCarouselKeyboardEvent,
	onNavigate?: (direction: PromptCarouselDirection) => boolean,
) {
	if (
		event.isComposing ||
		(event.key !== "ArrowUp" && event.key !== "ArrowDown") ||
		event.shiftKey ||
		event.metaKey ||
		event.ctrlKey ||
		event.altKey
	) {
		return false
	}

	return onNavigate?.(event.key === "ArrowUp" ? "previous" : "next") ?? false
}
