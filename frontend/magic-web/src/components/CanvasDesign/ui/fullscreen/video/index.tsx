import { useCallback, useEffect, useState } from "react"
import { ElementTypeEnum, type VideoElement } from "../../../runtime/document/types"
import { useCanvasElement } from "../../../app/hooks/canvas"
import { useCanvas } from "../../../app/providers/CanvasProvider"
import { VideoElement as VideoElementClass } from "../../../runtime/elements/video/VideoElement"
import VideoFullscreenPlayerOverlay from "./VideoFullscreenPlayerOverlay"

interface VideoFullscreenOverlayProps {
	elementId: string
	onClose: () => void
}

/** 画布视频全屏层：优先复用画布已有播放会话，避免进入全屏时重新建流 */
export default function VideoFullscreenOverlay(props: VideoFullscreenOverlayProps) {
	const { elementId, onClose } = props
	const { canvas } = useCanvas()
	const element = useCanvasElement(elementId)
	const videoElement = element?.type === ElementTypeEnum.Video ? (element as VideoElement) : null
	const [playbackVideoElement, setPlaybackVideoElement] = useState<HTMLVideoElement | null>(null)
	const [isLoading, setIsLoading] = useState(false)
	const [hasError, setHasError] = useState(false)
	const [intrinsicSizeHint, setIntrinsicSizeHint] = useState<{
		width: number
		height: number
	} | null>(null)

	useEffect(() => {
		const src = videoElement?.src
		if (!canvas || !src) {
			setIntrinsicSizeHint(null)
			return
		}
		let cancelled = false
		void (async () => {
			const metadata = await canvas.videoResourceManager.getCachedMetadata(src)
			if (cancelled) return
			if (!metadata) {
				setIntrinsicSizeHint(null)
				return
			}
			setIntrinsicSizeHint({
				width: metadata.videoWidth,
				height: metadata.videoHeight,
			})
		})()
		return () => {
			cancelled = true
		}
	}, [canvas, videoElement?.src])

	useEffect(() => {
		if (videoElement) {
			return
		}
		onClose()
	}, [onClose, videoElement])

	useEffect(() => {
		if (!canvas || !elementId || !videoElement?.src) {
			setPlaybackVideoElement(null)
			setIsLoading(false)
			setHasError(false)
			return
		}

		const elementInstance = canvas.elementManager.getElementInstance(videoElement.id)
		if (!(elementInstance instanceof VideoElementClass)) {
			setPlaybackVideoElement(null)
			setIsLoading(false)
			setHasError(true)
			return
		}

		let isCancelled = false
		let usedHandoff = false

		setPlaybackVideoElement(null)
		setIsLoading(true)
		setHasError(false)

		void (async () => {
			try {
				let video = elementInstance.handoffPlaybackToFullscreen()
				if (video) {
					usedHandoff = true
					await video.play().catch((error) => {
						void error
					})
				} else {
					video = await elementInstance.acquireFullscreenPlayback()
				}

				if (isCancelled) {
					if (usedHandoff) {
						elementInstance.handoffPlaybackFromFullscreen()
					} else {
						elementInstance.releaseFullscreenPlayback()
					}
					return
				}

				setPlaybackVideoElement(video)
				setHasError(!video)
			} catch {
				if (isCancelled) {
					return
				}
				setPlaybackVideoElement(null)
				setHasError(true)
			} finally {
				if (!isCancelled) {
					setIsLoading(false)
				}
			}
		})()

		return () => {
			isCancelled = true
			setPlaybackVideoElement(null)
			setIsLoading(false)
			if (usedHandoff) {
				elementInstance.handoffPlaybackFromFullscreen()
			} else {
				elementInstance.releaseFullscreenPlayback()
			}
		}
	}, [canvas, elementId, videoElement?.id, videoElement?.src])

	const handlePlayRequest = useCallback(async () => {
		if (!canvas || !elementId || !videoElement?.src) {
			return false
		}

		const elementInstance = canvas.elementManager.getElementInstance(videoElement.id)
		if (!(elementInstance instanceof VideoElementClass)) {
			return false
		}

		setIsLoading(true)
		setHasError(false)
		try {
			const video = await elementInstance.acquireFullscreenPlayback()
			setPlaybackVideoElement(video)
			setHasError(!video)
			return !!video
		} catch {
			setPlaybackVideoElement(null)
			setHasError(true)
			return false
		} finally {
			setIsLoading(false)
		}
	}, [canvas, elementId, videoElement?.id, videoElement?.src])

	return (
		<VideoFullscreenPlayerOverlay
			isOpen={Boolean(elementId && videoElement)}
			onClose={onClose}
			videoElement={playbackVideoElement}
			onPlayRequest={handlePlayRequest}
			intrinsicSizeHint={intrinsicSizeHint}
			isLoading={isLoading}
			hasError={hasError}
			resourcePath={videoElement?.src ?? ""}
		/>
	)
}
