import { useCallback, useEffect, useState } from "react"
import { useCanvas } from "../../../app/providers/CanvasProvider"
import { useCanvasEvent } from "../../../app/hooks/canvas"
interface ResolvedMediaPreviewSrcResult {
	src: string | undefined
	isLoading: boolean
	hasError: boolean
}

export function useResolvedVideoPreviewSrc(path: string): ResolvedMediaPreviewSrcResult {
	const { canvas } = useCanvas()
	const [src, setSrc] = useState<string | undefined>(undefined)
	const [isLoading, setIsLoading] = useState(false)
	const [hasError, setHasError] = useState(false)
	const [retryToken, setRetryToken] = useState(0)

	useCanvasEvent(
		"resource:remote-load-deferral-released",
		useCallback(
			({ data }) => {
				if (!canvas) return
				const pathKey =
					canvas.canvasFileUploadManager.getRemoteResourceLoadDeferralKey(path)
				if (!pathKey || pathKey !== data.key) return
				setRetryToken((value) => value + 1)
			},
			[canvas, path],
		),
		[canvas, path],
	)

	useEffect(() => {
		if (!canvas || !path) {
			setSrc(undefined)
			setIsLoading(false)
			setHasError(false)
			return
		}

		let cancelled = false
		setIsLoading(true)
		setHasError(false)
		if (canvas.canvasFileUploadManager.shouldDeferRemoteResourceLoad(path)) {
			return () => {
				cancelled = true
			}
		}

		void (async () => {
			let deferredAfterResource = false
			try {
				const resource = await canvas.videoResourceManager.getResource(path)
				if (cancelled) return
				if (
					!resource &&
					canvas.canvasFileUploadManager.shouldDeferRemoteResourceLoad(path)
				) {
					deferredAfterResource = true
					setSrc(undefined)
					setHasError(false)
					return
				}
				setSrc(resource?.ossSrc ?? undefined)
				setHasError(!resource?.ossSrc)
			} catch {
				if (cancelled) return
				setSrc(undefined)
				setHasError(true)
			} finally {
				if (!cancelled && !deferredAfterResource) {
					setIsLoading(false)
				}
			}
		})()

		return () => {
			cancelled = true
		}
	}, [canvas, path, retryToken])

	return {
		src,
		isLoading,
		hasError,
	}
}

export function useResolvedFilePreviewSrc(path: string): ResolvedMediaPreviewSrcResult {
	const { canvas } = useCanvas()
	const [src, setSrc] = useState<string | undefined>(undefined)
	const [isLoading, setIsLoading] = useState(false)
	const [hasError, setHasError] = useState(false)
	const [retryToken, setRetryToken] = useState(0)

	useCanvasEvent(
		"resource:remote-load-deferral-released",
		useCallback(
			({ data }) => {
				if (!canvas) return
				const pathKey =
					canvas.canvasFileUploadManager.getRemoteResourceLoadDeferralKey(path)
				if (!pathKey || pathKey !== data.key) return
				setRetryToken((value) => value + 1)
			},
			[canvas, path],
		),
		[canvas, path],
	)

	const resolveSrc = useCallback(async () => {
		void retryToken
		if (!path) {
			setSrc(undefined)
			setIsLoading(false)
			setHasError(false)
			return
		}

		const getFileInfo = canvas?.magicConfigManager.config?.methods?.getFileInfo
		if (canvas?.canvasFileUploadManager.shouldDeferRemoteResourceLoad(path)) {
			setSrc(undefined)
			setIsLoading(true)
			setHasError(false)
			return
		}

		if (!getFileInfo) {
			setSrc(path)
			setIsLoading(false)
			setHasError(false)
			return
		}

		setIsLoading(true)
		setHasError(false)
		try {
			const fileInfo = await getFileInfo(path, { useImageProcess: false })
			setSrc(fileInfo?.src || undefined)
			setHasError(!fileInfo?.src)
		} catch (error) {
			setSrc(undefined)
			setHasError(true)
		} finally {
			setIsLoading(false)
		}
	}, [canvas, path, retryToken])

	useEffect(() => {
		void resolveSrc()
	}, [resolveSrc])

	return {
		src,
		isLoading,
		hasError,
	}
}
