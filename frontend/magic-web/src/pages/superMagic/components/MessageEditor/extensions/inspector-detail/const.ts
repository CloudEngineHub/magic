export const INSPECTOR_DETAIL_TYPE = "inspector-detail"

/** Collapsed chip stays compact in the editor and message bubbles. */
export const INSPECTOR_DETAIL_COLLAPSED_MAX_WIDTH_CLASS = "max-w-[min(220px,100%)]"

/**
 * Invisible marker character (U+2063, invisible separator) prepended to the
 * inspector title paragraph. Used by renderers to detect inspector content
 * blocks in plain-text messages and render them as collapsible panels.
 */
export const INSPECTOR_DETAIL_MARKER = "\u2063"

/** Invisible suffix used to persist captureId without a visible prompt line. */
export const INSPECTOR_CAPTURE_ID_MARKER = `${INSPECTOR_DETAIL_MARKER}\u2064`
