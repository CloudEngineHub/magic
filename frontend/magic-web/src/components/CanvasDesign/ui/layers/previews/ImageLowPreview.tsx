import { useMemo, useState, useCallback, useEffect, useRef } from "react"
import styles from "../drawer/index.module.css"
import { Image as ImageIcon } from "lucide-react"
import { type ImageElement } from "../../../runtime/document/types"
import { getPersistedSourceCrop } from "../../../runtime/resources/image/imageCropUtils"
import { useCanvas } from "../../../app/providers/CanvasProvider"
import { ImageElement as ImageElementClass } from "../../../runtime/elements/image/ImageElement"
import * as TooltipPrimitive from "@radix-ui/react-tooltip"
import { Tooltip, TooltipTrigger, TooltipContent } from "../../primitives/shadcn/tooltip"
import { usePortalContainer } from "../../primitives/custom/PortalContainerContext"
import { useImageLowUrl } from "../../../app/hooks/resources/useImageUrls"

const LAYER_IMAGE_PREVIEW_SIZE = 16
const TOOLTIP_PREVIEW_MAX_SIZE = 160

export default function LayerImageLowPreview(props: { element: ImageElement; alt: string }) {
	const { element, alt } = props
	const { canvas } = useCanvas()
	const portalContainer = usePortalContainer()
	const previewRootRef = useRef<HTMLDivElement>(null)
	const [shouldLoadLow, setShouldLoadLow] = useState(false)
	const { lowUrl, imageInfo: lowImageInfo } = useImageLowUrl({
		elementId: element.id,
		src: element.src,
		enabled: shouldLoadLow,
	})
	const elementInstance = canvas?.elementManager.getElementInstance(element.id)
	const imageInfo =
		(elementInstance instanceof ImageElementClass
			? elementInstance.getImageInfo()
			: undefined) ??
		lowImageInfo ??
		undefined

	const [tooltipOpen, setTooltipOpen] = useState(false)
	const [tooltipImageUrl, setTooltipImageUrl] = useState<string | null>(null)
	const [isTooltipLoading, setIsTooltipLoading] = useState(false)
	const [hasTooltipError, setHasTooltipError] = useState(false)

	useEffect(() => {
		const node = previewRootRef.current
		if (!node || shouldLoadLow) return
		if (typeof IntersectionObserver === "undefined") {
			setShouldLoadLow(true)
			return
		}

		const observer = new IntersectionObserver(
			(entries) => {
				if (!entries.some((entry) => entry.isIntersecting)) return
				setShouldLoadLow(true)
				observer.disconnect()
			},
			{ rootMargin: "120px" },
		)
		observer.observe(node)
		return () => observer.disconnect()
	}, [shouldLoadLow])

	useEffect(() => {
		setTooltipImageUrl(null)
		setIsTooltipLoading(false)
		setHasTooltipError(false)
	}, [element.src])

	const loadTooltipImageUrl = useCallback(() => {
		if (!canvas || !element.src) return
		setIsTooltipLoading(true)
		setHasTooltipError(false)
		canvas.imageResourceManager
			.ensureFreshOssSrc(element.src)
			.then((ossSrc) => {
				setTooltipImageUrl(ossSrc)
				setHasTooltipError(!ossSrc)
			})
			.catch(() => {
				setTooltipImageUrl(null)
				setHasTooltipError(true)
			})
			.finally(() => {
				setIsTooltipLoading(false)
			})
	}, [canvas, element.src])

	const handleTooltipOpenChange = useCallback(
		(open: boolean) => {
			setTooltipOpen(open)
			if (open && !tooltipImageUrl) loadTooltipImageUrl()
		},
		[tooltipImageUrl, loadTooltipImageUrl],
	)

	const { viewportStyle, contentStyle, tooltipPreview } = useMemo(() => {
		const baseViewportStyle = {
			width: "100%",
			height: "100%",
			left: "0px",
			top: "0px",
		}
		const baseContentStyle = {
			backgroundImage: lowUrl ? `url("${lowUrl}")` : undefined,
			backgroundPosition: "center",
			backgroundSize: "contain",
		}
		const noTooltipPreview = null

		if (!imageInfo) {
			return {
				viewportStyle: baseViewportStyle,
				contentStyle: baseContentStyle,
				tooltipPreview: noTooltipPreview,
			}
		}

		const sourceWidth = imageInfo.naturalWidth ?? 0
		const sourceHeight = imageInfo.naturalHeight ?? 0
		if (sourceWidth <= 0 || sourceHeight <= 0) {
			return {
				viewportStyle: baseViewportStyle,
				contentStyle: baseContentStyle,
				tooltipPreview: noTooltipPreview,
			}
		}

		const sourceCrop = getPersistedSourceCrop(element.crop, {
			width: sourceWidth,
			height: sourceHeight,
		})
		if (sourceCrop.width <= 0 || sourceCrop.height <= 0) {
			return {
				viewportStyle: baseViewportStyle,
				contentStyle: baseContentStyle,
				tooltipPreview: noTooltipPreview,
			}
		}

		const scale = Math.min(
			LAYER_IMAGE_PREVIEW_SIZE / sourceCrop.width,
			LAYER_IMAGE_PREVIEW_SIZE / sourceCrop.height,
		)
		const viewportWidth = sourceCrop.width * scale
		const viewportHeight = sourceCrop.height * scale
		const viewportOffsetX = (LAYER_IMAGE_PREVIEW_SIZE - viewportWidth) / 2
		const viewportOffsetY = (LAYER_IMAGE_PREVIEW_SIZE - viewportHeight) / 2

		const tooltipScale = Math.min(
			TOOLTIP_PREVIEW_MAX_SIZE / sourceCrop.width,
			TOOLTIP_PREVIEW_MAX_SIZE / sourceCrop.height,
		)
		const tooltipViewportWidth = sourceCrop.width * tooltipScale
		const tooltipViewportHeight = sourceCrop.height * tooltipScale

		return {
			viewportStyle: {
				width: `${viewportWidth}px`,
				height: `${viewportHeight}px`,
				left: `${viewportOffsetX}px`,
				top: `${viewportOffsetY}px`,
			},
			contentStyle: {
				...baseContentStyle,
				width: `${sourceWidth * scale}px`,
				height: `${sourceHeight * scale}px`,
				transform: `translate(${-sourceCrop.x * scale}px, ${-sourceCrop.y * scale}px)`,
				backgroundSize: "100% 100%",
			},
			tooltipPreview: {
				viewportStyle: {
					width: `${tooltipViewportWidth}px`,
					height: `${tooltipViewportHeight}px`,
				},
				contentStyle: {
					...baseContentStyle,
					width: `${sourceWidth * tooltipScale}px`,
					height: `${sourceHeight * tooltipScale}px`,
					transform: `translate(${-sourceCrop.x * tooltipScale}px, ${
						-sourceCrop.y * tooltipScale
					}px)`,
					backgroundSize: "100% 100%",
				},
			},
		}
	}, [element.crop, imageInfo, lowUrl])

	return (
		<Tooltip open={tooltipOpen} onOpenChange={handleTooltipOpenChange}>
			<TooltipTrigger asChild>
				<div
					ref={previewRootRef}
					className={styles.layerNodeElementIcon}
					role="img"
					aria-label={alt}
				>
					{lowUrl ? (
						<div className={styles.layerNodeImagePreview}>
							<div
								className={styles.layerNodeImagePreviewViewport}
								style={viewportStyle}
							>
								<div
									className={styles.layerNodeImagePreviewContent}
									style={contentStyle}
								/>
							</div>
						</div>
					) : (
						<ImageIcon size={16} className={styles.layerNodeImageIcon} />
					)}
				</div>
			</TooltipTrigger>
			<TooltipPrimitive.Portal container={portalContainer || undefined}>
				<TooltipContent
					side="right"
					sideOffset={6}
					className={styles.layerNodeImagePreviewTooltip}
				>
					{isTooltipLoading ? (
						<div className={styles.layerNodeImagePreviewTooltipLoading} />
					) : hasTooltipError ? (
						<div className={styles.layerNodeImagePreviewTooltipLoading} />
					) : tooltipPreview && tooltipImageUrl ? (
						<div
							className={styles.layerNodeImagePreviewTooltipViewport}
							style={tooltipPreview.viewportStyle}
						>
							<div
								className={styles.layerNodeImagePreviewContent}
								style={{
									...tooltipPreview.contentStyle,
									backgroundImage: `url("${tooltipImageUrl}")`,
								}}
							/>
						</div>
					) : (
						<img
							src={tooltipImageUrl ?? undefined}
							alt={alt}
							className={styles.layerNodeImagePreviewTooltipImg}
						/>
					)}
				</TooltipContent>
			</TooltipPrimitive.Portal>
		</Tooltip>
	)
}
