import { useCallback, useRef, useState } from "react"
import JSZip from "jszip"
import { saveAs } from "file-saver"
import * as htmlToImage from "html-to-image"
import { logger as rootLogger } from "@/utils/log"
import type { CardFrameRef } from "../components/CardFrame"
import type { SelfMediaCard, SelfMediaPost } from "../types"

const log = rootLogger.createLogger("useExportZip")

export interface ExportProgress {
	current: number
	total: number
	status: "idle" | "running" | "done" | "error"
}

interface UseExportZipResult {
	progress: ExportProgress
	exportZip: (args: {
		posts: SelfMediaPost[]
		zipName?: string
		/** Output pixel ratio for each captured card. Defaults to 2. */
		pixelRatio?: number
		getCardRef: (postIdx: number, cardIdx: number) => CardFrameRef | null
	}) => Promise<void>
	exportLongImage: (args: {
		post: SelfMediaPost
		fileName?: string
		/** Output pixel ratio for each captured card before stitching. Defaults to 2. */
		pixelRatio?: number
		getCardRef: (cardIdx: number) => CardFrameRef | null
	}) => Promise<void>
}

const DEFAULT_PIXEL_RATIO = 2
const PER_CARD_TIMEOUT = 20000
const LONG_IMAGE_SEPARATOR_COLOR = "#e5e7eb"

function dataUrlToBlob(dataUrl: string): Blob {
	const [meta, base64] = dataUrl.split(",")
	const mime = /data:(.*?);base64/.exec(meta)?.[1] || "image/png"
	const binary = atob(base64)
	const len = binary.length
	const buffer = new Uint8Array(len)
	for (let i = 0; i < len; i++) buffer[i] = binary.charCodeAt(i)
	return new Blob([buffer], { type: mime })
}

function safeName(input: string, fallback: string): string {
	const trimmed = (input || "").trim().replace(/[\\/:*?"<>|]+/g, "_")
	return trimmed || fallback
}

/** Last path segment, without .html/.htm. */
function stemFromCardHtmlPath(path: string): string {
	const trimmed = (path || "").trim()
	if (!trimmed) return ""
	const base = trimmed.split(/[/\\]/).pop() || trimmed
	return base.replace(/\.html?$/i, "").trim()
}

/** 01_foo.png from HTML stem "foo", ordered by export index within the post. */
function pngNameForCard(card: SelfMediaCard, oneBasedIndex: number): string {
	const idx = String(oneBasedIndex).padStart(2, "0")
	const stem = stemFromCardHtmlPath(card.path)
	const safeStem = safeName(stem, "card")
	return `${idx}_${safeStem}.png`
}

function resolveZipBaseName(posts: SelfMediaPost[], zipName: string | undefined): string {
	if (zipName && zipName.trim()) return safeName(zipName.trim(), "self-media")
	const first = posts[0]
	const title = first?.meta?.title
	const id = first?.meta?.id
	return safeName((title && title.trim()) || id || "", "self-media")
}

function resolvePostBaseName(post: SelfMediaPost, fileName: string | undefined): string {
	if (fileName && fileName.trim()) return safeName(fileName.trim(), "self-media-long-image")
	return safeName(post.meta.title || post.meta.id, "self-media-long-image")
}

async function captureCardDataUrl(args: {
	cardRef: CardFrameRef | null
	pixelRatio: number
	postIdx: number
	cardIdx: number
}): Promise<string | null> {
	const { cardRef, pixelRatio, postIdx, cardIdx } = args
	let dataUrl: string | null = null
	let usedHostFallback = false
	if (cardRef) {
		try {
			dataUrl = await cardRef.capture({
				pixelRatio,
				timeoutMs: PER_CARD_TIMEOUT,
			})
		} catch (err) {
			log.warn("⚠️ 卡片截图失败，尝试回退到宿主截图", {
				postIdx,
				cardIdx,
				error: err,
			})
		}
		if (!dataUrl) {
			const iframe = cardRef.getIframeElement()
			if (iframe) {
				usedHostFallback = true
				try {
					dataUrl = await htmlToImage.toPng(iframe, {
						pixelRatio,
						cacheBust: true,
					})
				} catch (hostErr) {
					log.warn("⚠️ 宿主截图回退也失败，跳过当前卡片", {
						postIdx,
						cardIdx,
						error: hostErr,
					})
					dataUrl = null
				}
			}
		}
	}
	if (!dataUrl) {
		log.warn("⚠️ 当前卡片未产出图像，已跳过", {
			postIdx,
			cardIdx,
			usedHostFallback,
		})
	}
	return dataUrl
}

function loadImageFromDataUrl(dataUrl: string): Promise<HTMLImageElement> {
	return new Promise((resolve, reject) => {
		const image = new Image()
		image.onload = () => resolve(image)
		image.onerror = () => reject(new Error("Failed to load captured card image"))
		image.src = dataUrl
	})
}

function canvasToPngBlob(canvas: HTMLCanvasElement): Promise<Blob> {
	return new Promise((resolve, reject) => {
		canvas.toBlob((blob) => {
			if (blob) resolve(blob)
			else reject(new Error("Failed to create long image blob"))
		}, "image/png")
	})
}

async function stitchCardDataUrlsToPngBlob(
	dataUrls: string[],
	separatorHeight: number,
): Promise<Blob> {
	const images = await Promise.all(dataUrls.map(loadImageFromDataUrl))
	const width = Math.max(...images.map((image) => image.width))
	const safeSeparatorHeight = Math.max(0, Math.floor(separatorHeight))
	const height =
		images.reduce((sum, image) => sum + image.height, 0) +
		Math.max(images.length - 1, 0) * safeSeparatorHeight
	if (width <= 0 || height <= 0) {
		throw new Error("Captured card images have invalid dimensions")
	}
	const canvas = document.createElement("canvas")
	canvas.width = width
	canvas.height = height
	const context = canvas.getContext("2d")
	if (!context) throw new Error("Canvas 2D context is unavailable")
	let y = 0
	for (let index = 0; index < images.length; index++) {
		const image = images[index]
		const x = Math.floor((width - image.width) / 2)
		context.drawImage(image, x, y)
		y += image.height
		if (safeSeparatorHeight > 0 && index < images.length - 1) {
			context.fillStyle = LONG_IMAGE_SEPARATOR_COLOR
			context.fillRect(0, y, width, safeSeparatorHeight)
			y += safeSeparatorHeight
		}
	}
	return canvasToPngBlob(canvas)
}

/**
 * Export each card as PNG packaged in a ZIP.
 *
 * Strategy:
 * 1. Capture the iframe content from `CardFrame.capture()`.
 * 2. Fall back to host-side `htmlToImage` on the iframe element
 *    (only succeeds when iframe is same-origin or tainted-canvas tolerated).
 */
export function useExportZip(): UseExportZipResult {
	const [progress, setProgress] = useState<ExportProgress>({
		current: 0,
		total: 0,
		status: "idle",
	})
	const runningRef = useRef(false)

	const exportZip = useCallback<UseExportZipResult["exportZip"]>(
		async ({ posts, zipName, pixelRatio, getCardRef }) => {
			if (runningRef.current) return
			runningRef.current = true
			const effectivePixelRatio =
				typeof pixelRatio === "number" && pixelRatio > 0 ? pixelRatio : DEFAULT_PIXEL_RATIO
			const total = posts.reduce((sum, p) => sum + p.cards.length, 0)
			setProgress({ current: 0, total, status: "running" })

			const zip = new JSZip()
			let processed = 0
			let captured = 0
			const startedAt = Date.now()
			const rootZipName = resolveZipBaseName(posts, zipName)
			log.log("📤 开始导出 ZIP", {
				zipName: rootZipName,
				posts: posts.length,
				totalCards: total,
				pixelRatio: effectivePixelRatio,
			})

			try {
				for (let p = 0; p < posts.length; p++) {
					const post = posts[p]
					const folderName = safeName(post.meta.title || post.meta.id, `post-${p + 1}`)
					const folder = zip.folder(folderName)
					if (!folder) continue
					for (let c = 0; c < post.cards.length; c++) {
						const dataUrl = await captureCardDataUrl({
							cardRef: getCardRef(p, c),
							pixelRatio: effectivePixelRatio,
							postIdx: p,
							cardIdx: c,
						})
						if (dataUrl) {
							captured += 1
							const fileName = pngNameForCard(post.cards[c], c + 1)
							folder.file(fileName, dataUrlToBlob(dataUrl))
						}
						processed += 1
						setProgress({ current: processed, total, status: "running" })
					}
				}
				if (captured === 0) throw new Error("No card images were captured")
				const blob = await zip.generateAsync({ type: "blob" })
				saveAs(blob, `${rootZipName}.zip`)
				setProgress({ current: total, total, status: "done" })
				log.log("✅ 导出 ZIP 完成", {
					zipName: rootZipName,
					totalCards: total,
					durationMs: Date.now() - startedAt,
				})
			} catch (err) {
				log.error("❌ 导出 ZIP 失败", {
					zipName: rootZipName,
					processed,
					total,
					durationMs: Date.now() - startedAt,
					error: err,
				})
				setProgress((prev) => ({ ...prev, status: "error" }))
			} finally {
				runningRef.current = false
			}
		},
		[],
	)

	const exportLongImage = useCallback<UseExportZipResult["exportLongImage"]>(
		async ({ post, fileName, pixelRatio, getCardRef }) => {
			if (runningRef.current) return
			runningRef.current = true
			const effectivePixelRatio =
				typeof pixelRatio === "number" && pixelRatio > 0 ? pixelRatio : DEFAULT_PIXEL_RATIO
			const total = post.cards.length
			setProgress({ current: 0, total, status: "running" })

			let processed = 0
			const startedAt = Date.now()
			const imageName = resolvePostBaseName(post, fileName)
			const dataUrls: string[] = []
			log.log("📤 开始导出长图", {
				fileName: imageName,
				totalCards: total,
				pixelRatio: effectivePixelRatio,
			})

			try {
				for (let c = 0; c < post.cards.length; c++) {
					const dataUrl = await captureCardDataUrl({
						cardRef: getCardRef(c),
						pixelRatio: effectivePixelRatio,
						postIdx: 0,
						cardIdx: c,
					})
					if (dataUrl) dataUrls.push(dataUrl)
					processed += 1
					setProgress({ current: processed, total, status: "running" })
				}
				if (!dataUrls.length) throw new Error("No card images were captured")
				if (dataUrls.length !== total) {
					throw new Error(`Only captured ${dataUrls.length} of ${total} card images`)
				}
				const separatorHeight = Math.max(1, Math.round(effectivePixelRatio))
				const blob = await stitchCardDataUrlsToPngBlob(dataUrls, separatorHeight)
				saveAs(blob, `${imageName}.png`)
				setProgress({ current: total, total, status: "done" })
				log.log("✅ 导出长图完成", {
					fileName: imageName,
					totalCards: total,
					durationMs: Date.now() - startedAt,
				})
			} catch (err) {
				log.error("❌ 导出长图失败", {
					fileName: imageName,
					processed,
					total,
					durationMs: Date.now() - startedAt,
					error: err,
				})
				setProgress((prev) => ({ ...prev, status: "error" }))
			} finally {
				runningRef.current = false
			}
		},
		[],
	)

	return { progress, exportZip, exportLongImage }
}
