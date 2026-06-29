import { exportHtmlToImage, type ImageExportFormat } from "@magic-web/html2image"
import {
	documentExportService,
	type DocumentExport,
} from "@/pages/superMagic/services/documentExport"

export type ExportFormat = ImageExportFormat | "pdf"

export interface RunExportOptions {
	element: HTMLElement
	format: ExportFormat
	fileName: string
	onProgress?: (percent: number) => void
}

export interface RunExportHandle {
	promise: Promise<void>
	cancel: () => void
}

function ensureExt(name: string, ext: string): string {
	return name.toLowerCase().endsWith(`.${ext}`) ? name : `${name}.${ext}`
}

function appendMeta(target: Document, attrs: Record<string, string>): void {
	const meta = target.createElement("meta")
	Object.entries(attrs).forEach(([key, value]) => meta.setAttribute(key, value))
	target.head.appendChild(meta)
}

function appendBaseUrl(target: Document): void {
	const base = target.createElement("base")
	base.href = document.baseURI
	target.head.appendChild(base)
}

function copyStylesheetLink(target: Document, source: HTMLLinkElement): void {
	if (!source.href) return
	const link = target.createElement("link")
	Array.from(source.attributes).forEach((attr) => link.setAttribute(attr.name, attr.value))
	link.rel = "stylesheet"
	link.href = source.href
	target.head.appendChild(link)
}

function copyInlineStyle(target: Document, source: HTMLStyleElement): void {
	const style = target.createElement("style")
	Array.from(source.attributes).forEach((attr) => style.setAttribute(attr.name, attr.value))
	style.textContent = source.textContent
	target.head.appendChild(style)
}

function copyDocumentStyles(target: Document): void {
	document.head.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]').forEach((link) => {
		copyStylesheetLink(target, link)
	})
	document.head.querySelectorAll<HTMLStyleElement>("style").forEach((style) => {
		copyInlineStyle(target, style)
	})
}

function appendExportDefaults(target: Document): void {
	const style = target.createElement("style")
	style.textContent = [
		"html, body { margin: 0; padding: 0; background: #ffffff; }",
		'body { width: fit-content; font-family: -apple-system, BlinkMacSystemFont, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif; }',
	].join("\n")
	target.head.appendChild(style)
}

function createStandaloneExportDocument(element: HTMLElement): Document {
	const target = document.implementation.createHTMLDocument("")
	target.documentElement.lang = "zh-CN"
	target.documentElement.className = document.documentElement.className
	target.body.className = document.body.className

	appendMeta(target, { charset: "utf-8" })
	appendMeta(target, { name: "viewport", content: "width=800" })
	appendBaseUrl(target)
	copyDocumentStyles(target)
	appendExportDefaults(target)
	target.body.appendChild(target.importNode(element, true))

	return target
}

function serializeDocument(doc: Document): string {
	const html = new XMLSerializer().serializeToString(doc)
	return html.startsWith("<!DOCTYPE") ? html : `<!doctype html>\n${html}`
}

function serializeNodeToStandaloneHtml(element: HTMLElement): string {
	return serializeDocument(createStandaloneExportDocument(element))
}

export function runExport(opts: RunExportOptions): RunExportHandle {
	const html = serializeNodeToStandaloneHtml(opts.element)

	if (opts.format === "pdf") {
		const documentExporter = documentExportService.get()
		if (!documentExporter) {
			throw new Error("PDF export is not supported in current version")
		}

		const handle = documentExporter.exportRasterPages(html, {
			fileName: ensureExt(opts.fileName, "pdf"),
			skipFailedPages: true,
			pageMode: "fit",
			pixelRatio: 2,
			onPageProgress: (
				ctx: DocumentExport.PageProgressContext | DocumentExport.CaptureProgressContext,
			) => {
				if (ctx.phase === "capture" && typeof ctx.current === "number" && ctx.total > 0) {
					opts.onProgress?.(Math.round((ctx.current / ctx.total) * 100))
				}
			},
		})
		return { promise: handle.promise.then(() => undefined), cancel: () => handle.cancel?.() }
	}

	const handle = exportHtmlToImage({
		pages: [html],
		format: opts.format,
		fileName: opts.fileName,
		pixelRatio: 2,
		onProgress: ({ phase, current, total }) => {
			if (phase === "capture" && total > 0) {
				opts.onProgress?.(Math.round((current / total) * 100))
			}
		},
	})
	return { promise: handle.promise.then(() => undefined), cancel: handle.cancel }
}
