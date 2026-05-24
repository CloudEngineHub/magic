import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react"
import { cn } from "@/lib/utils"
import { getTemporaryDownloadUrl } from "@/pages/superMagic/utils/api"
import { processHtmlContent } from "../../../contents/HTML/htmlProcessor"
import { flattenAttachments } from "../../../contents/HTML/utils"
import type { FileItem } from "../../../contents/HTML/utils/fetchInterceptor"

interface AICardIframeProps {
	fileId?: string
	attachmentList?: any[]
	className?: string
	style?: React.CSSProperties
	/** When true, iframe scales to fit container width */
	scaleToFit?: boolean
	/** When true, the component shows a skeleton loader */
	showSkeleton?: boolean
	onLoad?: () => void
}

/**
 * Lightweight iframe renderer for AI Cards.
 * Uses srcDoc for rendering — no editing, no DevConsole, no dynamic interception.
 * Inspired by CardFrame.tsx but stripped to essentials.
 */
function AICardIframe({
	fileId,
	attachmentList,
	className,
	style,
	scaleToFit = true,
	showSkeleton = true,
	onLoad,
}: AICardIframeProps) {
	const frameRef = useRef<HTMLDivElement>(null)
	const iframeRef = useRef<HTMLIFrameElement>(null)
	const [srcDoc, setSrcDoc] = useState<string | null>(null)
	const [loading, setLoading] = useState(true)
	const [error, setError] = useState<string | null>(null)
	const [containerWidth, setContainerWidth] = useState(0)
	const [contentSize, setContentSize] = useState({ width: 0, height: 0 })

	const flattenedFiles = useMemo(
		() =>
			(attachmentList?.length ? flattenAttachments(attachmentList) : []).filter(
				(item): item is FileItem =>
					Boolean(item?.file_id) &&
					Boolean(item?.relative_file_path) &&
					!item?.is_directory,
			),
		[attachmentList],
	)

	const currentFile = useMemo(
		() => flattenedFiles.find((item) => item.file_id === fileId) || null,
		[flattenedFiles, fileId],
	)

	const relativeFolderPath = useMemo(() => {
		const path = currentFile?.relative_file_path || ""
		if (!path) return "/"
		if (currentFile?.file_name && path.endsWith(currentFile.file_name)) {
			return path.slice(0, -currentFile.file_name.length)
		}
		const slashIndex = path.lastIndexOf("/")
		return slashIndex >= 0 ? path.slice(0, slashIndex + 1) : "/"
	}, [currentFile])

	// Load and process HTML content
	useEffect(() => {
		if (!fileId) {
			setSrcDoc(null)
			setLoading(false)
			return
		}

		let cancelled = false
		setLoading(true)
		setError(null)
		setSrcDoc(null)
		;(async () => {
			try {
				const urls = await getTemporaryDownloadUrl({ file_ids: [fileId] })
				const url = urls?.[0]?.url
				if (!url) throw new Error("No download URL")
				if (cancelled) return

				const resp = await fetch(url, { credentials: "omit" })
				if (!resp.ok) throw new Error("Failed to load HTML")
				const html = await resp.text()
				if (cancelled) return

				let processedContent = html
				if (attachmentList?.length) {
					const result = await processHtmlContent({
						content: html,
						attachments: attachmentList,
						attachmentList,
						fileId,
						fileName: currentFile?.file_name,
						html_relative_path: relativeFolderPath,
					})
					processedContent = result.processedContent || html
				}
				if (cancelled) return

				setSrcDoc(processedContent)
				setLoading(false)
			} catch (err) {
				if (cancelled) return
				setError(err instanceof Error ? err.message : "Load error")
				setLoading(false)
			}
		})()

		return () => {
			cancelled = true
		}
	}, [fileId, attachmentList, currentFile?.file_name, relativeFolderPath])

	// Measure container width
	useEffect(() => {
		const node = frameRef.current
		if (!node || typeof ResizeObserver === "undefined") return
		const observer = new ResizeObserver(() => {
			const w = node.clientWidth || node.getBoundingClientRect().width || 0
			setContainerWidth(w)
		})
		observer.observe(node)
		setContainerWidth(node.clientWidth || node.getBoundingClientRect().width || 0)
		return () => observer.disconnect()
	}, [])

	// Measure iframe content on load
	const handleIframeLoad = useCallback(() => {
		const iframe = iframeRef.current
		if (!iframe?.contentDocument) return
		const doc = iframe.contentDocument
		const body = doc.body
		const docEl = doc.documentElement
		const w = Math.max(body?.scrollWidth || 0, docEl?.scrollWidth || 0)
		const h = Math.max(body?.scrollHeight || 0, docEl?.scrollHeight || 0)
		if (w > 0 && h > 0) {
			setContentSize({ width: w, height: h })
		}
		onLoad?.()
	}, [onLoad])

	const scale =
		scaleToFit && contentSize.width > 0 && containerWidth > 0
			? Math.min(containerWidth / contentSize.width, 1)
			: 1

	const scaledHeight = contentSize.height > 0 ? contentSize.height * scale : undefined

	if (error) {
		return (
			<div
				className={cn(
					"flex h-full w-full items-center justify-center rounded-lg bg-muted/50 text-sm text-muted-foreground",
					className,
				)}
				style={style}
			>
				<span>Failed to load card</span>
			</div>
		)
	}

	return (
		<div
			ref={frameRef}
			className={cn("relative w-full overflow-hidden", className)}
			style={{ ...style, height: style?.height ?? scaledHeight }}
		>
			{loading && showSkeleton && (
				<div className="absolute inset-0 z-10 animate-pulse rounded-lg bg-muted/40" />
			)}
			{srcDoc && (
				<iframe
					ref={iframeRef}
					title="AI Card"
					srcDoc={srcDoc}
					className="block border-0 bg-white dark:bg-slate-900 max-h-full"
					style={{
						width: contentSize.width > 0 ? `${contentSize.width}px` : "100%",
						height: contentSize.height > 0 ? `${contentSize.height}px` : "100%",
						transform: `scale(${scale})`,
						transformOrigin: "top left",
						visibility: contentSize.width > 0 ? "visible" : "hidden",
					}}
					onLoad={handleIframeLoad}
					sandbox="allow-scripts allow-same-origin"
				/>
			)}
		</div>
	)
}

export default memo(AICardIframe)
