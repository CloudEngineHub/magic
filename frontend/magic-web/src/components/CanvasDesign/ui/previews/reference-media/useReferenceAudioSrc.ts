import { useCallback, useEffect, useRef, useState } from "react"
import { useCanvas } from "../../../app/providers/CanvasProvider"
import { useCanvasEvent } from "../../../app/hooks/canvas"

interface ReferenceAudioSrcResult {
	src: string | undefined
	isLoading: boolean
	hasError: boolean
	load: () => Promise<void>
}

/** 按需获取 SourceList 音频 Tooltip 播放地址。 */
export function useReferenceAudioSrc(path: string): ReferenceAudioSrcResult {
	const { canvas } = useCanvas()
	const [src, setSrc] = useState<string | undefined>(undefined)
	const [isLoading, setIsLoading] = useState(false)
	const [hasError, setHasError] = useState(false)
	const requestIdRef = useRef(0)
	const loadingRef = useRef(false)

	const load = useCallback(async () => {
		if (!canvas || !path || loadingRef.current || src) return

		const requestId = requestIdRef.current + 1
		requestIdRef.current = requestId
		loadingRef.current = true
		setIsLoading(true)
		setHasError(false)

		let deferredAfterResource = false
		try {
			const resource = await canvas.audioResourceManager.getResource(path)
			if (requestIdRef.current !== requestId) return
			if (!resource && canvas.canvasFileUploadManager.shouldDeferRemoteResourceLoad(path)) {
				deferredAfterResource = true
				setSrc(undefined)
				setHasError(false)
				return
			}
			setSrc(resource?.ossSrc || undefined)
			setHasError(!resource?.ossSrc)
		} catch {
			if (requestIdRef.current !== requestId) return
			setSrc(undefined)
			setHasError(true)
		} finally {
			if (requestIdRef.current === requestId) {
				loadingRef.current = false
				if (!deferredAfterResource) setIsLoading(false)
			}
		}
	}, [canvas, path, src])

	useCanvasEvent(
		"resource:remote-load-deferral-released",
		useCallback(
			({ data }) => {
				if (!canvas) return
				const pathKey =
					canvas.canvasFileUploadManager.getRemoteResourceLoadDeferralKey(path)
				if (pathKey && pathKey === data.key) {
					void load()
				}
			},
			[canvas, load, path],
		),
		[canvas, load, path],
	)

	useEffect(() => {
		requestIdRef.current += 1
		loadingRef.current = false
		setSrc(undefined)
		setIsLoading(false)
		setHasError(false)
	}, [path])

	useEffect(
		() => () => {
			requestIdRef.current += 1
			loadingRef.current = false
		},
		[],
	)

	return { src, isLoading, hasError, load }
}
