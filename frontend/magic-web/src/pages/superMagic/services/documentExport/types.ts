import type { TFunction } from "i18next"
import type { FontResolver } from "@magic/html2pptx"

export namespace DocumentExport {
	export type PdfPagePreset = "A3" | "A4" | "A5" | "B4" | "B5"
	export type PdfPageUnit = "mm" | "cm" | "in" | "pt"
	export type PdfPageOrientation = "portrait" | "landscape"

	export interface PdfCustomPageSize {
		width: number
		height: number
		unit: PdfPageUnit
	}

	export interface PdfPageConfig {
		size?: "auto" | PdfPagePreset | PdfCustomPageSize
		orientation?: PdfPageOrientation
	}

	export interface GeneratedPdf {
		data: Uint8Array
		fileName: string
	}

	export interface GeneratePdfHandle {
		promise: Promise<GeneratedPdf>
		cancel: () => void
	}

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
		page?: PdfPageConfig
		vector?: {
			renderWidth?: number
			adaptiveRenderWidth?: boolean
			minRenderWidth?: number
			maxRenderWidth?: number
			fitContentWidth?: boolean
			adaptivePageHeight?: boolean
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
		page?: PdfPageConfig
		selectedProject?: unknown
		relativeFilePath?: string
		attachments?: unknown[]
		initialImageUrlMap?: unknown
		pageMode?: "fit" | "paginate"
		onResourceLoadError?: (error: ResourceLoadError) => void
		onProgress?: (context: CaptureProgressContext) => void
	}

	export interface PdfExportSettingsOptions {
		previewElement?: HTMLElement
	}

	export interface Runtime {
		requestPdfExportSettings: (
			options?: PdfExportSettingsOptions,
		) => Promise<PdfPageConfig | null>
		createResourceErrorCollector: (
			t: TFunction | ((key: string, options?: Record<string, unknown>) => string),
		) => ResourceErrorCollector
		exportPages: (content: string | string[], options?: PageExportOptions) => Handle
		exportRasterPages: (content: string | string[], options?: RasterPageExportOptions) => Handle
		exportMarkdown: (options: MarkdownOptions) => Handle
		exportMarkdownFile: (options: MarkdownOptions) => Handle
		exportMarkdownRaster: (options: MarkdownOptions) => Handle
		/** Optional artifact APIs used by isolated client-side batch export flows. */
		generatePages?: (
			content: string | string[],
			options?: PageExportOptions,
		) => GeneratePdfHandle
		generateMarkdownFile?: (options: MarkdownOptions) => GeneratePdfHandle
		getPptFontResolver?: () => FontResolver | undefined
	}
}
