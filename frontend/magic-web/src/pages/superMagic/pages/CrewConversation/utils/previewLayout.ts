import type { MagicWidget } from "@magic-web/widget-sdk"
import type { ActiveDetailTabType } from "@/pages/superMagic/components/Detail/components/FilesViewer/types"

export type PreviewConversationAction = "collapse" | "expand" | null

interface PreviewConversationTransition {
	isSessionActive: boolean
	action: PreviewConversationAction
	shouldCloseHistoryPanel: boolean
}

/** Resolves one conversation-panel action without overriding choices inside an active session. */
export function resolvePreviewConversationTransition(
	mode: MagicWidget.PreviewMode,
	tabType: ActiveDetailTabType,
	isSessionActive: boolean,
): PreviewConversationTransition {
	// All tabs that render preview content participate in the preview conversation session.
	const isPreviewTab =
		tabType === "file" ||
		tabType === "website" ||
		tabType === "knowledge_base" ||
		tabType === "playback"
	if (!isPreviewTab) {
		return {
			isSessionActive: false,
			action: isSessionActive ? "expand" : null,
			shouldCloseHistoryPanel: false,
		}
	}
	if (isSessionActive) {
		return {
			isSessionActive: true,
			action: null,
			shouldCloseHistoryPanel: false,
		}
	}

	return {
		isSessionActive: true,
		action: mode === "switchable" ? "collapse" : "expand",
		shouldCloseHistoryPanel: mode === "switchable",
	}
}
