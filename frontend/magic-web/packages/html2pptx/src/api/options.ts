import type { ExternalLogger, LogLevelLabel } from "../logger"
import type { FontMissPolicy, FontResolver } from "./font"

/** Slide configuration */
export interface SlideConfig {
	/** Design width in pixels */
	htmlWidth: number
	/** Design height in pixels */
	htmlHeight: number
	/** PPT Width in inches */
	slideWidth: number
	/** PPT Height in inches */
	slideHeight: number
}

/** Export options */
export interface ExportOptions {
	/** Output file name */
	fileName?: string
	/** Slide configuration overrides */
	config?: Partial<SlideConfig>
	/** Export mode */
	exportMode?: "single"
	/** Skip failed pages and continue exporting later pages */
	skipFailedPages?: boolean
	/**
	 * Auto-size mode switch (defaults to `false`, standard PPT mode).
	 *
	 * - `false` (default / PPT mode): output one page strictly using `config.slideWidth/slideHeight`,
	 *   overflowing content is clipped by the PPT page bounds, and the export size stays fixed independently of the design size.
	 * - `true` (auto-size mode): adapt to the actual HTML dimensions:
	 *   - when actual width exceeds `config.htmlWidth`, expand `slideWidth` to the maximum measured width
	 *   - when actual height exceeds `config.htmlHeight`, split into multiple PPT pages by `slideHeight`
	 *   - throw immediately if any page width exceeds PowerPoint's 56-inch single-page limit (5376px)
	 */
	autoSize?: boolean
	/** Progress callback invoked when each slide starts rendering */
	onSlideProgress?: (context: ExportPageContext) => void
	/**
	 * Callback invoked when resources such as images or video posters fail to load or are skipped.
	 * Failed resources do not stop export and are only used for user notification. The same resource may trigger multiple times, so callers should deduplicate if needed.
	 */
	onResourceLoadError?: (error: ResourceLoadError) => void
	/** Minimum output level; logs below this level are ignored. Defaults to "info" */
	logLevel?: LogLevelLabel
	/** External logger. Passing console is supported; all methods are optional */
	logger?: ExternalLogger
	/** Font resolver. The package only reports used fonts; manifests, CDNs, and private paths are handled by the host application */
	fontResolver?: FontResolver
	/**
	 * Policy for missing fonts; defaults to 'fallback-with-warning'.
	 * - 'fallback-with-warning': skip that font and print a warning; embed the remaining fonts normally
	 * - 'no-embed': skip silently
	 * - 'fail': throw an error and stop export
	 */
	fontMissPolicy?: FontMissPolicy
}

/** Resource load failure information */
export interface ResourceLoadError {
	/** Resource URL, possibly truncated */
	url: string
	/** Resource kind, such as image, video, script, or style */
	kind: string
	/** Failure reason: timeout or load error */
	reason: "timeout" | "load-error"
}

/** Return handle from exportPPTX, used to wait for completion or cancel actively */
export interface ExportHandle {
	/** Wait for export completion; resolves on success and rejects on failure or cancelation */
	promise: Promise<void>
	/** Cancel this export */
	cancel: () => void
}

/** Client-side PPTX artifact produced without triggering a browser download. */
export interface GeneratedPPTX {
	data: Blob
	fileName: string
}

/** Return handle from generatePPTX, used to await an artifact or cancel actively. */
export interface GenerateHandle {
	promise: Promise<GeneratedPPTX>
	cancel: () => void
}

/** Per-slide export context */
export interface ExportPageContext {
	/** Current page index, starting from 0 */
	index: number
	/** Total page count */
	total: number
	/** HTML for the current page */
	html: string
	/** Output file name for the current page */
	fileName: string
	/** Slide configuration */
	config: SlideConfig
}
