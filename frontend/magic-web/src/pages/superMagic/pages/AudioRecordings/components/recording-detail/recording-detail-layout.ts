/** Shared horizontal inset for PC detail tab bodies (excludes mindmap). */
export const RECORDING_DESKTOP_CONTENT_INSET_CLASS = "w-full px-24"

/** Markdown bodies add scroll-end breathing room on top of the shared inset. */
export const RECORDING_DESKTOP_MD_CONTENT_CLASS = `${RECORDING_DESKTOP_CONTENT_INSET_CLASS} pb-8`

/** Minimum readable width of the desktop transcript column. */
export const RECORDING_DETAIL_TRANSCRIPT_MIN_WIDTH = 360

/** Maximum width reserved for the desktop transcript column. */
export const RECORDING_DETAIL_TRANSCRIPT_MAX_WIDTH = 440

/** Minimum readable width of the desktop summary and notes column. */
export const RECORDING_DETAIL_SUMMARY_MIN_WIDTH = 480

/** Minimum width of both detail columns including the 24px gap and 32px side insets. */
export const RECORDING_DETAIL_WORKBENCH_MIN_WIDTH =
	RECORDING_DETAIL_TRANSCRIPT_MIN_WIDTH + RECORDING_DETAIL_SUMMARY_MIN_WIDTH + 24 + 64

/** Width of the project-detail style icon rail after the recording chat is collapsed. */
export const RECORDING_CHAT_COLLAPSED_WIDTH = 24

/** Default width of the recording conversation surface. */
export const RECORDING_CHAT_EXPANDED_WIDTH = 380

/** Compact history width reserved for the constrained recording-detail workspace. */
export const RECORDING_CHAT_HISTORY_WIDTH = 240
