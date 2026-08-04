import { isMagicApp } from "@/utils/devices"

// The viewport layer paints the whole screen so safe-area gutters never reveal the page below.
export const FILE_VIEWER_FULLSCREEN_VIEWPORT_CLASS_NAME =
	"fixed inset-0 z-detail-fullscreen h-screen w-screen rounded-none bg-white"

// Pure shares need to look fullscreen initially while remaining on the document scroll path.
export const FILE_VIEWER_DOCUMENT_FLOW_FULLSCREEN_VIEWPORT_CLASS_NAME =
	"relative z-detail-fullscreen min-h-dvh w-full bg-white"

// The safe-area layer keeps file preview controls clear of iPad WebView status and home areas.
export const FILE_VIEWER_FULLSCREEN_SAFE_AREA_CLASS_NAME =
	"absolute bottom-[var(--safe-area-inset-bottom)] left-[var(--safe-area-inset-left)] right-[var(--safe-area-inset-right)] top-[var(--safe-area-inset-top)] flex min-h-0 min-w-0 flex-col"

// Fullscreen tabs should be bounded by the safe-area shell instead of claiming the viewport.
export const FILE_VIEWER_FULLSCREEN_TAB_CONTENT_CLASS_NAME = "absolute inset-0 h-full"

// Browser fullscreen keeps the legacy viewport-anchored tab layer because safe-area is only needed inside Magic App WebView.
export const FILE_VIEWER_FULLSCREEN_BROWSER_TAB_CONTENT_CLASS_NAME = "fixed top-0 h-full"

// Cached tabs must not add their height to a document-flow share; only the active tab does.
export const FILE_VIEWER_DOCUMENT_FLOW_FULLSCREEN_TAB_CONTENT_CLASS_NAME =
	"relative min-h-dvh w-full"

/**
 * Return whether FilesViewer fullscreen should reserve native safe-area insets.
 */
export function shouldUseFileViewerFullscreenSafeArea() {
	return isMagicApp
}
