import { captureToCanvas } from "../capture/pageCapture"
import { materializePseudoIcons, restoreIcons } from "../materialize/pseudo-icon"
import { preprocessDOM } from "../preprocess/domLevel"
import { RenderSandbox } from "../sandbox"
import { measureContentSize } from "../sandbox/renderSandbox.helpers"
import { throwIfAborted } from "../sandbox/abort"
import { packageImagesInWorker } from "../packaging/package-images"
import { configureLogger, log, LogLevel } from "../logger"
import type { ExternalLogger, LogLevelLabel } from "../logger"

const RESIZE_EPSILON_PX = 2

const MAX_CANVAS_PIXELS = 64_000_000

const MAX_CANVAS_DIMENSION = 16384

const yieldToMain = (): Promise<void> =>
	new Promise((resolve) => requestAnimationFrame(() => setTimeout(resolve, 0)))

// ─── 类型 ───────────────────────────────────────────────────

export type ImageExportFormat = "png" | "jpeg"

export type ImageExportPhase = "preprocess" | "render" | "capture" | "assemble"

export interface ImageExportProgress {
	phase: ImageExportPhase
	current: number
	total: number
}

export interface ExportHtmlToImageOptions {
	pages: string[]
	format?: ImageExportFormat
	/** JPEG 质量 (0-1)，仅 format=jpeg 时有效 */
	imageQuality?: number
	fileName?: string
	viewport?: { width: number; height: number }
	pixelRatio?: number
	onProgress?: (ctx: ImageExportProgress) => void
	logger?: ExternalLogger
	logLevel?: LogLevelLabel
}

interface ResolvedOptions {
	pages: string[]
	format: ImageExportFormat
	imageQuality: number
	fileName: string
	viewport: { width: number; height: number }
	pixelRatio: number
	onProgress?: (ctx: ImageExportProgress) => void
}

export interface ExportImageHandle {
	promise: Promise<void>
	cancel: () => void
}

// ─── 工具 ───────────────────────────────────────────────────

function resolveOptions(options: ExportHtmlToImageOptions): ResolvedOptions {
	const pages = options.pages.filter((p) => typeof p === "string" && p.length > 0)
	if (!pages.length)
		throw new Error("exportHtmlToImage requires at least one non-empty HTML page")

	const format = options.format ?? "png"
	const fallbackWidth = typeof window !== "undefined" ? window.innerWidth : 1440
	const fallbackHeight = typeof window !== "undefined" ? window.innerHeight : 900
	return {
		pages,
		format,
		imageQuality: options.imageQuality ?? (format === "jpeg" ? 0.92 : 1),
		fileName: options.fileName?.replace(/\.[^.]+$/, "") ?? "export",
		viewport: {
			width: options.viewport?.width ?? fallbackWidth,
			height: options.viewport?.height ?? fallbackHeight,
		},
		pixelRatio: options.pixelRatio ?? 2,
		onProgress: options.onProgress,
	}
}

function canvasToArrayBuffer(
	canvas: HTMLCanvasElement,
	format: ImageExportFormat,
	quality: number,
): Promise<ArrayBuffer> {
	const mimeType = format === "png" ? "image/png" : "image/jpeg"
	return new Promise((resolve, reject) => {
		canvas.toBlob(
			(blob) => {
				if (!blob) return reject(new Error("canvas.toBlob returned null"))
				blob.arrayBuffer().then(resolve, reject)
			},
			mimeType,
			quality,
		)
	})
}

function downloadBlob(blob: Blob, fileName: string): void {
	const url = URL.createObjectURL(blob)
	const anchor = document.createElement("a")
	anchor.href = url
	anchor.download = fileName
	anchor.click()
	setTimeout(() => URL.revokeObjectURL(url), 0)
}

// ─── 核心流水线 ──────────────────────────────────────────────

async function runImageExportPipeline(
	options: ExportHtmlToImageOptions,
	signal: AbortSignal,
): Promise<void> {
	const resolved = resolveOptions(options)
	const { pages, format, imageQuality, fileName, viewport, pixelRatio } = resolved
	const total = pages.length
	const ext = format === "png" ? "png" : "jpg"
	const mimeType = format === "png" ? "image/png" : "image/jpeg"

	const imageFiles: { buffer: ArrayBuffer; name: string }[] = []

	const sandbox = new RenderSandbox({
		pageWidthPx: viewport.width,
		pageHeightPx: viewport.height,
	})

	try {
		for (let index = 0; index < total; index++) {
			throwIfAborted(signal)

			resolved.onProgress?.({ phase: "preprocess", current: index, total })
			const html = pages[index]
			resolved.onProgress?.({ phase: "preprocess", current: index + 1, total })

			resolved.onProgress?.({ phase: "render", current: index, total })
			let { iDocument, iWindow, totalWidth, totalHeight } = await sandbox.render(html, {
				signal,
			})
			throwIfAborted(signal)

			// 关键：渲染宽度只允许「因内容横向溢出而变宽」，绝不回缩到比目标视口更窄。
			// 否则居中容器 / fit-content / paint 估算偏小等情况会把 iframe 缩窄并触发 reflow，
			// 导致响应式头部（flex-wrap）在更窄的宽度下重新排版（卡片换行），与预览不一致。
			// 高度则照常贴合内容。
			const targetWidth = Math.max(viewport.width, totalWidth)
			const targetHeight = totalHeight

			if (
				Math.abs(targetWidth - viewport.width) > RESIZE_EPSILON_PX ||
				Math.abs(targetHeight - viewport.height) > RESIZE_EPSILON_PX
			) {
				sandbox.resize({ pageWidthPx: targetWidth, pageHeightPx: targetHeight })
				const reflowed = await sandbox.reflow({ signal })
				iDocument = reflowed.iDocument
				iWindow = reflowed.iWindow
				totalWidth = reflowed.totalWidth
				totalHeight = reflowed.totalHeight
				throwIfAborted(signal)
			}

			preprocessDOM(iDocument)
			await yieldToMain()

			const postPre = measureContentSize({
				iframeDocument: iDocument,
				fallbackWidth: viewport.width,
				fallbackHeight: viewport.height,
			})

			if (
				postPre.width > totalWidth + RESIZE_EPSILON_PX ||
				postPre.height > totalHeight + RESIZE_EPSILON_PX
			) {
				sandbox.resize({ pageWidthPx: postPre.width, pageHeightPx: postPre.height })
				const postLayoutReflow = await sandbox.reflow({ signal })
				iDocument = postLayoutReflow.iDocument
				iWindow = postLayoutReflow.iWindow
				preprocessDOM(iDocument)
				await yieldToMain()
			}

			const iconBackups = materializePseudoIcons(iDocument, iWindow)
			resolved.onProgress?.({ phase: "render", current: index + 1, total })
			await yieldToMain()

			const contentWidth = iDocument.body.scrollWidth || viewport.width
			const contentHeight = iDocument.body.scrollHeight || viewport.height

			const requestedScale = Math.max(1, pixelRatio || 1)
			let safeScale = requestedScale
			const estimatedCanvasWidth = contentWidth * requestedScale
			const estimatedCanvasHeight = contentHeight * requestedScale
			const estimatedPixels = estimatedCanvasWidth * estimatedCanvasHeight

			if (
				estimatedCanvasHeight > MAX_CANVAS_DIMENSION ||
				estimatedCanvasWidth > MAX_CANVAS_DIMENSION ||
				estimatedPixels > MAX_CANVAS_PIXELS
			) {
				const scaleByHeight = MAX_CANVAS_DIMENSION / contentHeight
				const scaleByWidth = MAX_CANVAS_DIMENSION / contentWidth
				const scaleByPixels = Math.sqrt(MAX_CANVAS_PIXELS / (contentWidth * contentHeight))
				safeScale = Math.max(
					1,
					Math.min(safeScale, scaleByHeight, scaleByWidth, scaleByPixels),
				)
				log(LogLevel.L1, "Reduced snapdom scale for oversized content", {
					contentWidth,
					contentHeight,
					requestedScale,
					safeScale,
				})
			}

			resolved.onProgress?.({ phase: "capture", current: index, total })
			let canvas = await captureToCanvas({ iDocument, signal, scale: safeScale })
			throwIfAborted(signal)

			restoreIcons(iconBackups)

			const buffer = await canvasToArrayBuffer(canvas, format, imageQuality)
			canvas.width = 0
			canvas.height = 0

			const pageName = total === 1 ? `${fileName}.${ext}` : `${fileName}-${index + 1}.${ext}`
			imageFiles.push({ buffer, name: pageName })

			resolved.onProgress?.({ phase: "capture", current: index + 1, total })
			sandbox.resize({ pageWidthPx: viewport.width, pageHeightPx: viewport.height })
		}

		resolved.onProgress?.({ phase: "assemble", current: 0, total: 1 })

		if (imageFiles.length === 1) {
			const blob = new Blob([imageFiles[0].buffer], { type: mimeType })
			downloadBlob(blob, imageFiles[0].name)
		} else {
			const zipBuffer = await packageImagesInWorker({
				files: imageFiles,
				zipFileName: `${fileName}.zip`,
				signal,
			})
			const zipBlob = new Blob([zipBuffer], { type: "application/zip" })
			downloadBlob(zipBlob, `${fileName}.zip`)
		}

		resolved.onProgress?.({ phase: "assemble", current: 1, total: 1 })
	} finally {
		sandbox.destroy()
	}
}

// ─── 公开 API ───────────────────────────────────────────────

export function exportHtmlToImage(options: ExportHtmlToImageOptions): ExportImageHandle {
	const controller = new AbortController()
	const promise = (async (): Promise<void> => {
		if (options.logLevel || options.logger) {
			configureLogger({ minLevel: options.logLevel, logger: options.logger })
		}
		await runImageExportPipeline(options, controller.signal)
	})()
	return { promise, cancel: () => controller.abort() }
}
