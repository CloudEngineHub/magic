import { useState, useCallback, useEffect, useRef } from "react"
import { useCanvas } from "../context/CanvasContext"
import { useCanvasEvent } from "./useCanvasEvent"
import { ElementTypeEnum } from "../canvas/types"
import { resolveCanonicalResourcePath } from "../canvas/utils/pathUtils"
import type { ImageInfo } from "../canvas/utils/ImageResourceManager"

export interface UseImageThumbnailUrlOptions {
	elementId: string
	src?: string
	enabled?: boolean
}

export interface UseImageThumbnailUrlResult {
	thumbnailUrl: string | null
	imageInfo: ImageInfo | null
	isLoading: boolean
	hasError: boolean
}

export function useImageThumbnailUrl(
	options: UseImageThumbnailUrlOptions,
): UseImageThumbnailUrlResult {
	const { elementId, src, enabled = true } = options
	const { canvas } = useCanvas()
	const requestIdRef = useRef(0)
	const [thumbnailUrl, setThumbnailUrl] = useState<string | null>(null)
	const [imageInfo, setImageInfo] = useState<ImageInfo | null>(null)
	const [isLoading, setIsLoading] = useState(false)
	const [hasError, setHasError] = useState(false)

	const resetThumbnail = useCallback(() => {
		requestIdRef.current += 1
		setThumbnailUrl(null)
		setImageInfo(null)
		setIsLoading(false)
		setHasError(false)
	}, [])

	const syncLoadedThumbnail = useCallback(async () => {
		if (!canvas || !src || !enabled) return
		const currentRequestId = requestIdRef.current + 1
		requestIdRef.current = currentRequestId
		setThumbnailUrl(null)
		setImageInfo(null)
		setIsLoading(true)
		setHasError(false)

		const loaded = await canvas.imageResourceManager.getThumbnail(src)
		if (requestIdRef.current !== currentRequestId) return

		const smallUrl = loaded?.thumbnail.small ?? null
		setThumbnailUrl(smallUrl)
		setImageInfo(loaded?.imageInfo ?? null)
		setHasError(false)
		setIsLoading(false)
	}, [canvas, enabled, src])

	useEffect(() => {
		if (!enabled || !src) {
			resetThumbnail()
			return
		}
		void syncLoadedThumbnail()
	}, [enabled, resetThumbnail, src, syncLoadedThumbnail])

	// 监听元素更新事件，当图片元素的 src 更新时更新 URL
	useCanvasEvent(
		"element:updated",
		useCallback(
			({ data }) => {
				if (!enabled || data.elementId !== elementId) return
				if (data.data?.type !== ElementTypeEnum.Image) return
				if (data.data.src !== src) return
				void syncLoadedThumbnail()
			},
			[elementId, enabled, src, syncLoadedThumbnail],
		),
	)

	// 监听临时元素转正事件，当图片上传完成转为正式元素时更新 URL
	useCanvasEvent(
		"element:temporary:converted",
		useCallback(
			({ data }) => {
				if (!enabled || data.elementId !== elementId) return
				void syncLoadedThumbnail()
			},
			[elementId, enabled, syncLoadedThumbnail],
		),
	)

	// 监听元素删除事件，移除已删除的图片元素的 URL
	useCanvasEvent(
		"element:deleted",
		useCallback(
			({ data }) => {
				if (data.elementId === elementId) resetThumbnail()
			},
			[elementId, resetThumbnail],
		),
	)

	// 监听图片资源加载完成事件，当图片加载完成时更新 URL
	useCanvasEvent(
		"resource:image:loaded",
		useCallback(
			({ data }) => {
				if (!canvas || !enabled || !src) return
				const resolveAbs = canvas.magicConfigManager.config?.methods?.resolveAbsolutePath
				const normalizedPath = resolveCanonicalResourcePath(data.path, resolveAbs)
				if (resolveCanonicalResourcePath(src, resolveAbs) !== normalizedPath) return

				const currentRequestId = requestIdRef.current + 1
				requestIdRef.current = currentRequestId
				void (async () => {
					const loaded = await canvas.imageResourceManager.getThumbnail(src)
					if (requestIdRef.current !== currentRequestId) return
					setThumbnailUrl(loaded?.thumbnail.small ?? null)
					setImageInfo(loaded?.imageInfo ?? null)
					setIsLoading(false)
					setHasError(false)
				})()
			},
			[canvas, enabled, src],
		),
	)

	return {
		thumbnailUrl,
		imageInfo,
		isLoading,
		hasError,
	}
}
