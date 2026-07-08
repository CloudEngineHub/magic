import type { TFunction } from "i18next"
import type { FontResolver } from "@magic/html2pptx"

export namespace DocumentExport {
	export interface Handle {
		promise: Promise<unknown>
		cancel?: () => void
	}

	export interface PageProgressContext {
		index: number
		total: number
		[key: string]: unknown
	}

	export interface CaptureProgressContext {
		phase?: string
		current: number
		total: number
		[key: string]: unknown
	}

	export interface ResourceLoadError {
		url: string
		kind: string
		reason: "timeout" | "load-error"
	}

	export interface ResourceErrorCollector {
		onResourceLoadError: (error: ResourceLoadError) => void
		getFailures?: () => ResourceLoadError[]
	}

	export interface PageExportOptions {
		fileName?: string
		skipFailedPages?: boolean
		pptMode?: boolean
		vector?: {
			fitContentWidth?: boolean
			[key: string]: unknown
		}
		onResourceLoadError?: (error: ResourceLoadError) => void
		onPageProgress?: (context: PageProgressContext) => void
		[key: string]: unknown
	}

	export interface RasterPageExportOptions extends Omit<PageExportOptions, "vector"> {
		pageMode?: "fit" | "paginate"
	}

	export interface MarkdownOptions {
		markdown?: string
		processedContent?: string
		fileId?: string
		fileName?: string
		selectedProject?: unknown
		relativeFilePath?: string
		attachments?: unknown[]
		initialImageUrlMap?: unknown
		pageMode?: "fit" | "paginate"
		onResourceLoadError?: (error: ResourceLoadError) => void
		onProgress?: (context: CaptureProgressContext) => void
	}

	export interface Runtime {
		createResourceErrorCollector: (
			t: TFunction | ((key: string, options?: Record<string, unknown>) => string),
		) => ResourceErrorCollector
		exportPages: (content: string | string[], options?: PageExportOptions) => Handle
		exportRasterPages: (content: string | string[], options?: RasterPageExportOptions) => Handle
		exportMarkdown: (options: MarkdownOptions) => Handle
		exportMarkdownFile: (options: MarkdownOptions) => Handle
		exportMarkdownRaster: (options: MarkdownOptions) => Handle
		getPptFontResolver?: () => FontResolver | undefined
	}
}
