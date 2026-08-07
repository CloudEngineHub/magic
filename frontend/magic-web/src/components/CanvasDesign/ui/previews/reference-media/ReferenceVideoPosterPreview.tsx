import { useCallback, useLayoutEffect, useMemo, useRef, useState } from "react"
import * as TooltipPrimitive from "@radix-ui/react-tooltip"
import { LoaderCircle } from "lucide-react"
import { cn } from "../../../runtime/shared/lib/utils"
import { ReferenceSlotVideoIcon } from "../../primitives/icons/index"
import styles from "../../editors/message/index.module.css"
import { useReferenceVideoPoster } from "./useReferenceVideoPoster"
import { Tooltip, TooltipContent, TooltipTrigger } from "../../primitives/shadcn/tooltip"
import { usePortalContainer } from "../../primitives/custom/PortalContainerContext"
import { calculateTooltipBoundedPreviewSize } from "../../../runtime/resources/image/imagePreviewUtils"
import { useTouchTooltipTrigger } from "./useTouchTooltipTrigger"
import { REFERENCE_MEDIA_TOOLTIP_MAX_SIZE } from "./constants"

export interface ReferenceVideoPosterPreviewProps {
	fileName: string
	path: string
	fillParent?: boolean
	objectFit?: "cover" | "contain"
	enableTooltip?: boolean
	tooltipSide?: "top" | "right" | "bottom" | "left"
}

/** 视频参考槽位：与画布同源，用 VideoResourceManager 解码首帧海报 */
export function ReferenceVideoPosterPreview(props: ReferenceVideoPosterPreviewProps) {
	const {
		fileName,
		path,
		fillParent,
		objectFit = "cover",
		enableTooltip = false,
		tooltipSide = "top",
	} = props
	const portalContainer = usePortalContainer()
	const { loadState, posterClone, ossSrc } = useReferenceVideoPoster(path)
	const canvasRef = useRef<HTMLCanvasElement>(null)
	const tooltipVideoRef = useRef<HTMLVideoElement>(null)
	const [open, setOpen] = useState(false)
	const [videoReady, setVideoReady] = useState(false)
	const previewSize = useMemo(
		() =>
			posterClone
				? calculateTooltipBoundedPreviewSize(
						{
							naturalWidth: posterClone.width,
							naturalHeight: posterClone.height,
						},
						REFERENCE_MEDIA_TOOLTIP_MAX_SIZE,
					)
				: {},
		[posterClone],
	)

	useLayoutEffect(() => {
		const el = canvasRef.current
		if (!el || !posterClone || loadState !== "ready") return
		el.width = posterClone.width
		el.height = posterClone.height
		const ctx = el.getContext("2d")
		if (!ctx) return
		ctx.clearRect(0, 0, el.width, el.height)
		ctx.drawImage(posterClone, 0, 0)
	}, [posterClone, loadState])

	const handleOpenChange = useCallback((nextOpen: boolean) => {
		setOpen(nextOpen)
		if (!nextOpen) {
			setVideoReady(false)
			tooltipVideoRef.current?.pause()
		}
	}, [])
	const handleTooltipClose = useCallback(() => handleOpenChange(false), [handleOpenChange])
	const { handlePointerDown, handleClick, handlePointerCancel } = useTouchTooltipTrigger(
		() => handleOpenChange(true),
		{ open, onClose: handleTooltipClose },
	)

	const previewWrapperClass = cn(
		styles.referenceImagePreview,
		fillParent && styles.referenceImagePreviewFill,
		fillParent && objectFit === "contain" && styles.referenceImagePreviewFillContain,
	)

	const previewContent =
		loadState === "loading" ? (
			<div className={styles.referenceImageLoading}>
				<LoaderCircle size={12} className={styles.loadingIcon} />
			</div>
		) : loadState === "error" || !posterClone ? (
			<div className="flex h-full w-full items-center justify-center bg-muted/40">
				<ReferenceSlotVideoIcon size={28} />
			</div>
		) : (
			<canvas
				ref={canvasRef}
				className={styles.referenceImagePreviewImgCover}
				role="img"
				aria-label={fileName}
			/>
		)

	const trigger = (
		<div
			className={previewWrapperClass}
			data-reference-media-tooltip-trigger={enableTooltip ? "" : undefined}
			onPointerDown={enableTooltip ? handlePointerDown : undefined}
			onClick={enableTooltip ? handleClick : undefined}
			onPointerCancel={enableTooltip ? handlePointerCancel : undefined}
		>
			{previewContent}
		</div>
	)

	if (!enableTooltip) return trigger

	const tooltipWidth = previewSize.width || REFERENCE_MEDIA_TOOLTIP_MAX_SIZE
	const tooltipHeight =
		previewSize.height || Math.round(REFERENCE_MEDIA_TOOLTIP_MAX_SIZE * (9 / 16))

	return (
		<Tooltip open={open} onOpenChange={handleOpenChange} delayDuration={250}>
			<TooltipTrigger asChild>{trigger}</TooltipTrigger>
			<TooltipPrimitive.Portal container={portalContainer || undefined}>
				<TooltipContent
					data-reference-media-tooltip-content=""
					side={tooltipSide}
					sideOffset={8}
					className={styles.referenceMediaTooltip}
				>
					<div className={styles.referenceMediaTooltipBody}>
						<div
							className={styles.referenceMediaTooltipVideoViewport}
							style={{ width: tooltipWidth, height: tooltipHeight }}
						>
							{ossSrc ? (
								<video
									ref={tooltipVideoRef}
									src={ossSrc}
									muted
									loop
									autoPlay
									playsInline
									preload="auto"
									aria-label={fileName}
									className={styles.referenceMediaTooltipVideo}
									onCanPlay={() => setVideoReady(true)}
									onError={() => setVideoReady(false)}
								/>
							) : null}
							{!videoReady && posterClone ? (
								<canvas
									className={styles.referenceMediaTooltipPoster}
									ref={(node) => {
										if (!node) return
										node.width = posterClone.width
										node.height = posterClone.height
										const context = node.getContext("2d")
										context?.drawImage(posterClone, 0, 0)
									}}
									aria-label={fileName}
								/>
							) : null}
						</div>
						<div className={styles.referenceMediaTooltipFileName} title={fileName}>
							{fileName}
						</div>
					</div>
				</TooltipContent>
			</TooltipPrimitive.Portal>
		</Tooltip>
	)
}
