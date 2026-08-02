const DEFAULT_DESKTOP_ROW_SIZE = 128
const DESKTOP_HORIZONTAL_INSET = 28
const DESKTOP_VERTICAL_CHROME = 28

export const PPT_SIDEBAR_THUMBNAIL_DIMENSIONS = {
	width: 16,
	height: 9,
} as const

/**
 * Estimate a desktop row from the live sidebar width and the fixed thumbnail aspect ratio.
 * The fixed inset accounts for viewport/right padding plus the virtual row's horizontal padding.
 */
export function estimateDesktopSlideRowSize(sidebarWidth: number): number {
	if (sidebarWidth <= 0) return DEFAULT_DESKTOP_ROW_SIZE

	const thumbnailWidth = Math.max(0, sidebarWidth - DESKTOP_HORIZONTAL_INSET)
	const estimatedSize = Math.ceil(
		(thumbnailWidth * PPT_SIDEBAR_THUMBNAIL_DIMENSIONS.height) /
			PPT_SIDEBAR_THUMBNAIL_DIMENSIONS.width +
			DESKTOP_VERTICAL_CHROME,
	)

	return Math.max(DEFAULT_DESKTOP_ROW_SIZE, estimatedSize)
}
