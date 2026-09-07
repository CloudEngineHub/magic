/**
 * Backward-compatible export for MessageList callers. The implementation lives
 * in core utils so Canvas and SuperMagic share one wire format without inverting
 * core → CanvasDesign dependencies.
 */
export {
	getClipboardHtml,
	getClipboardPlainText,
	getMentionClipboardRepresentation,
} from "@/utils/messageClipboardSerializer"

export type {
	MessageClipboardMetadata,
	MessageClipboardMentionItem,
	MessageClipboardPayload,
} from "@/utils/messageClipboardSerializer"
