import { useState, useEffect, useCallback, useMemo, useRef } from "react"
import { useCanvas } from "../../providers/CanvasProvider"
import { useCanvasEvent } from "../canvas"
import { toCanonicalCanvasResourcePath } from "../../../runtime/shared/path/canvasResourcePath"
import type { ImageInfo } from "../../../runtime/resources/image/ImageResourceManager"
import { TOOLTIP_PREVIEW_MIN_SIZE } from "../../../runtime/resources/image/imagePreviewUtils"

/** 参考图 URL 信息 */
export interface ReferenceImageUrlInfo {
	/** low 档位展示 URL */
	lowUrl: string | undefined
	/** tooltip/popover 预览图 */
	fullUrl: string | undefined
	/** 图片信息 */
	imageInfo: ImageInfo | undefined
	/** 按需加载 tooltip 预览图的方法 */
	loadTooltip: () => Promise<void>
	/** 是否正在加载 low 档位 */
	isLoading: boolean
	/** 是否已确认加载失败 */
	hasError: boolean
	/** 预览尺寸（基于 imageInfo 计算） */
	previewSize: { width?: number; height?: number }
	/** 是否正在加载大图（当弹窗打开且 fullUrl 未加载时） */
	isFullUrlLoading: boolean
	/** 弹窗打开状态 */
	open: boolean
	/** 设置弹窗打开状态 */
	setOpen: (open: boolean) => void
	/** 处理弹窗打开/关闭事件 */
	handleOpenChange: (open: boolean) => void
}

// 计算预设尺寸，保持宽高比，最大不超过 tooltip 预览尺寸
function calculatePreviewSize(
	imageInfo: { naturalWidth: number; naturalHeight: number } | undefined,
): { width?: number; height?: number } {
	if (!imageInfo) {
		return {}
	}

	const maxSize = TOOLTIP_PREVIEW_MIN_SIZE
	const { naturalWidth, naturalHeight } = imageInfo

	if (naturalWidth <= maxSize && naturalHeight <= maxSize) {
		return { width: naturalWidth, height: naturalHeight }
	}

	const ratio = naturalWidth / naturalHeight
	if (naturalWidth > naturalHeight) {
		return { width: maxSize, height: Math.round(maxSize / ratio) }
	} else {
		return { width: Math.round(maxSize * ratio), height: maxSize }
	}
}

export interface UseReferenceImageUrlsOptions {
	/** 挂载后即拉取原图 URL（ossSrc），用于槽位内直接展示原图 */
	eagerFullUrl?: boolean
	/** 是否启用图片资源加载；非图片参考资源应关闭，避免误触发图片链路 */
	enabled?: boolean
}

/**
 * 从 ImageResourceManager 获取参考图 URL
 * @param path 图片路径
 */
export function useReferenceImageUrls(
	path: string,
	options?: UseReferenceImageUrlsOptions,
): ReferenceImageUrlInfo {
	const eagerFullUrl = options?.eagerFullUrl ?? false
	const enabled = options?.enabled ?? true
	const { canvas } = useCanvas()
	const [open, setOpen] = useState(false)
	const lowImageReleaseRef = useRef<(() => void) | null>(null)
	const lowImageRequestIdRef = useRef(0)
	const [urlInfo, setUrlInfo] = useState<{
		lowUrl: string | undefined
		fullUrl: string | undefined
		imageInfo: ImageInfo | undefined
		hasError: boolean
		loadTooltip: () => Promise<void>
	}>({
		lowUrl: undefined,
		fullUrl: undefined,
		imageInfo: undefined,
		hasError: false,
		loadTooltip: () => Promise.resolve(),
	})

	const releaseLowImageUrl = useCallback(() => {
		lowImageReleaseRef.current?.()
		lowImageReleaseRef.current = null
	}, [])

	// 计算预览尺寸
	const previewSize = useMemo(() => calculatePreviewSize(urlInfo.imageInfo), [urlInfo.imageInfo])

	// 是否正在加载：eager 时 low 档位或原图任一可用即可结束 loading
	const isLoading =
		enabled &&
		(eagerFullUrl
			? !urlInfo.hasError && !urlInfo.lowUrl && !urlInfo.fullUrl
			: !urlInfo.hasError && !urlInfo.lowUrl)

	// 是否正在加载大图（当弹窗打开且 fullUrl 未加载时）
	const isFullUrlLoading = enabled && open && !urlInfo.hasError && !urlInfo.fullUrl

	// 按需加载 tooltip 预览图（直接使用 ossSrc）
	const loadTooltip = useCallback(async () => {
		if (!canvas || !enabled) return

		const ossInfo = await canvas.imageResourceManager.ensureFreshOssInfo(path)
		const failureReason = canvas.imageResourceManager.getFailureReason(path)

		setUrlInfo((prev) => {
			if (prev.fullUrl) {
				return prev
			}

			return {
				...prev,
				fullUrl: ossInfo?.ossSrc || undefined,
				hasError: !ossInfo?.ossSrc && !!failureReason,
			}
		})
	}, [canvas, enabled, path])

	// 处理弹窗打开/关闭事件
	const handleOpenChange = useCallback(
		(newOpen: boolean) => {
			setOpen(newOpen)
			if (newOpen) {
				setUrlInfo((prev) => {
					if (!prev.fullUrl) {
						loadTooltip()
					}
					return prev
				})
			}
		},
		[loadTooltip],
	)

	// 更新路径的展示 URL（明确请求 low 档位）
	const updatePathUrl = useCallback(async () => {
		if (!canvas || !enabled) return

		const requestId = lowImageRequestIdRef.current + 1
		lowImageRequestIdRef.current = requestId
		const lowImage = await canvas.imageResourceManager.getLowImageUrl(path)
		if (lowImageRequestIdRef.current !== requestId) {
			lowImage?.release()
			return
		}

		releaseLowImageUrl()
		lowImageReleaseRef.current = lowImage?.release ?? null

		const lowUrl = lowImage?.url
		const imageInfo = lowImage?.imageInfo
		const failureReason = canvas.imageResourceManager.getFailureReason(path)

		setUrlInfo((prev) => {
			const newInfo = {
				lowUrl: lowUrl || undefined,
				fullUrl: prev.fullUrl, // 保持已有的 tooltip URL
				imageInfo: imageInfo || prev.imageInfo,
				hasError: !lowUrl && !!failureReason,
				loadTooltip,
			}

			// 只有当 URL 或 imageInfo 实际变化时才更新
			if (
				prev.lowUrl === newInfo.lowUrl &&
				prev.imageInfo === newInfo.imageInfo &&
				prev.hasError === newInfo.hasError
			) {
				return prev
			}

			return newInfo
		})
	}, [canvas, enabled, path, loadTooltip, releaseLowImageUrl])

	// 初始化 low 档位 URL
	useEffect(() => {
		if (!canvas || !enabled) {
			lowImageRequestIdRef.current += 1
			releaseLowImageUrl()
			setUrlInfo({
				lowUrl: undefined,
				fullUrl: undefined,
				imageInfo: undefined,
				hasError: false,
				loadTooltip: () => Promise.resolve(),
			})
			return
		}

		// 立即尝试更新一次 URL 映射（如果资源已缓存，可以立即显示）
		updatePathUrl()
	}, [canvas, enabled, path, releaseLowImageUrl, updatePathUrl])

	useEffect(() => releaseLowImageUrl, [releaseLowImageUrl])

	// 槽位内直接展示原图：与 low 档位并行拉取 ossSrc
	useEffect(() => {
		if (!eagerFullUrl || !canvas || !enabled) return
		let cancelled = false
		;(async () => {
			const ossInfo = await canvas.imageResourceManager.ensureFreshOssInfo(path)
			const failureReason = canvas.imageResourceManager.getFailureReason(path)
			if (cancelled) return
			setUrlInfo((prev) => ({
				...prev,
				fullUrl: ossInfo?.ossSrc || prev.fullUrl,
				hasError: !ossInfo?.ossSrc && !!failureReason,
			}))
		})()
		return () => {
			cancelled = true
		}
	}, [canvas, enabled, path, eagerFullUrl])

	// 监听图片资源加载完成事件，确保 ossSrc 可用后更新 tooltip URL
	useCanvasEvent(
		"resource:image:loaded",
		useCallback(
			({ data }) => {
				if (!canvas || !enabled) return
				const resolveAbs = canvas.magicConfigManager.config?.methods?.resolveAbsolutePath
				if (
					toCanonicalCanvasResourcePath(path, resolveAbs) !==
					toCanonicalCanvasResourcePath(data.path, resolveAbs)
				) {
					return
				}
				// 如果弹窗已打开但 fullUrl 还未设置，尝试加载
				if ((open || eagerFullUrl) && !urlInfo.fullUrl) {
					loadTooltip()
				}
			},
			[canvas, enabled, path, loadTooltip, open, urlInfo.fullUrl, eagerFullUrl],
		),
	)

	useCanvasEvent(
		"resource:image:load-failed",
		useCallback(
			({ data }) => {
				if (!canvas || !enabled) return
				const resolveAbs = canvas.magicConfigManager.config?.methods?.resolveAbsolutePath
				if (
					toCanonicalCanvasResourcePath(path, resolveAbs) !==
					toCanonicalCanvasResourcePath(data.path, resolveAbs)
				) {
					return
				}

				setUrlInfo((prev) => {
					if (prev.lowUrl || prev.fullUrl) {
						return prev
					}

					return {
						...prev,
						hasError: true,
					}
				})
			},
			[canvas, enabled, path],
		),
	)

	// 监听资源加载完成事件，刷新 low 档位 URL
	useCanvasEvent(
		"resource:image:loaded",
		useCallback(
			({ data }) => {
				if (!canvas || !enabled) return
				const resolveAbs = canvas.magicConfigManager.config?.methods?.resolveAbsolutePath
				if (
					toCanonicalCanvasResourcePath(path, resolveAbs) !==
					toCanonicalCanvasResourcePath(data.path, resolveAbs)
				) {
					return
				}
				updatePathUrl()
			},
			[canvas, enabled, path, updatePathUrl],
		),
	)

	useCanvasEvent(
		"resource:remote-load-deferral-released",
		useCallback(
			({ data }) => {
				if (!canvas || !enabled) return
				const pathKey =
					canvas.canvasFileUploadManager.getRemoteResourceLoadDeferralKey(path)
				if (!pathKey || pathKey !== data.key) {
					return
				}

				setUrlInfo((prev) => ({
					...prev,
					hasError: false,
				}))
				void updatePathUrl()
				if (open || eagerFullUrl) {
					void loadTooltip()
				}
			},
			[canvas, enabled, path, updatePathUrl, open, eagerFullUrl, loadTooltip],
		),
		[canvas, enabled, path, updatePathUrl, open, eagerFullUrl, loadTooltip],
	)

	return {
		...urlInfo,
		isLoading,
		hasError: urlInfo.hasError,
		previewSize,
		isFullUrlLoading,
		open,
		setOpen,
		handleOpenChange,
	}
}
