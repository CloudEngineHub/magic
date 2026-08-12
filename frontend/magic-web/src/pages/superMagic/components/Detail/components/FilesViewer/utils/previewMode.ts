import type { MagicWidget } from "@magic-web/widget-sdk"

export type PreviewExitAction = "restore" | "dismiss"

/** Decides whether a newly activated preview should enter the host viewport automatically. */
export function shouldAutoEnterPreviewFullscreen(mode: MagicWidget.PreviewMode): boolean {
	return mode === "fullscreen"
}

/** Maps the active presentation strategy to the user-visible fullscreen exit result. */
export function resolvePreviewExitAction(mode: MagicWidget.PreviewMode): PreviewExitAction {
	return mode === "fullscreen" ? "dismiss" : "restore"
}
