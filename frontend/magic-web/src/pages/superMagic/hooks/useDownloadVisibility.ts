/**
 * Download visibility policy extension point.
 * Customer overlays can replace this module with deployment-specific rules.
 */
export function useDownloadVisibility(allowDownload = true, _isMobile = false): boolean {
	return allowDownload
}
