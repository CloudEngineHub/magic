import { useMemo, type CSSProperties } from "react"
import { Tooltip, TooltipContent, TooltipTrigger } from "../../primitives/shadcn/tooltip"
import * as TooltipPrimitive from "@radix-ui/react-tooltip"
import { usePortalContainer } from "../../primitives/custom/PortalContainerContext"
import { useReferenceImageUrls } from "../../../app/hooks/resources/useReferenceImageUrls"
import { ImagePlus, LoaderCircle } from "lucide-react"
import {
	TOOLTIP_PREVIEW_MIN_SIZE,
	calculateTooltipBoundedPreviewSize,
} from "../../../runtime/resources/image/imagePreviewUtils"
import {
	getPersistedSourceCrop,
	computeReferenceImageCroppedDisplayLayout,
} from "../../../runtime/resources/image/imageCropUtils"
import { cn } from "../../../runtime/shared/lib/utils"
import styles from "../../editors/message/index.module.css"
import type { ReferenceMediaPreviewProps } from "./types"
import { useObserveBoxSize } from "./useObserveBoxSize"

export function ReferenceImageLowPreview(props: ReferenceMediaPreviewProps) {
	const { fileName, path, fillParent, objectFit = "cover", inlineOriginal, sourceCrop } = props
	const portalContainer = usePortalContainer()
	const {
		lowUrl,
		fullUrl,
		isLoading,
		hasError,
		imageInfo,
		isFullUrlLoading,
		open,
		handleOpenChange,
	} = useReferenceImageUrls(path, { eagerFullUrl: !!inlineOriginal })

	const previewSize = useMemo(() => {
		if (!imageInfo) {
			return {}
		}
		if (sourceCrop) {
			const p = getPersistedSourceCrop(sourceCrop, {
				width: imageInfo.naturalWidth,
				height: imageInfo.naturalHeight,
			})
			if (p.width > 0 && p.height > 0) {
				return calculateTooltipBoundedPreviewSize({
					naturalWidth: p.width,
					naturalHeight: p.height,
				})
			}
		}
		return calculateTooltipBoundedPreviewSize(imageInfo)
	}, [imageInfo, sourceCrop])

	const canCropLayout =
		Boolean(sourceCrop) && Boolean(imageInfo?.naturalWidth && imageInfo?.naturalHeight)

	const {
		ref: previewBoxRef,
		w: previewBoxW,
		h: previewBoxH,
	} = useObserveBoxSize(Boolean(canCropLayout && !inlineOriginal))
	const {
		ref: inlineBoxRef,
		w: inlineBoxW,
		h: inlineBoxH,
	} = useObserveBoxSize(Boolean(canCropLayout && inlineOriginal))

	const displayUrl = inlineOriginal ? (fullUrl ?? lowUrl) : lowUrl

	const previewCroppedStyle = useMemo(() => {
		if (!canCropLayout || !sourceCrop || !imageInfo || inlineOriginal) {
			return undefined
		}
		return computeReferenceImageCroppedDisplayLayout(
			previewBoxW,
			previewBoxH,
			imageInfo.naturalWidth,
			imageInfo.naturalHeight,
			sourceCrop,
		)
	}, [canCropLayout, sourceCrop, imageInfo, previewBoxW, previewBoxH, inlineOriginal])

	const inlineCroppedStyle = useMemo(() => {
		if (!canCropLayout || !sourceCrop || !imageInfo || !inlineOriginal) {
			return undefined
		}
		return computeReferenceImageCroppedDisplayLayout(
			inlineBoxW,
			inlineBoxH,
			imageInfo.naturalWidth,
			imageInfo.naturalHeight,
			sourceCrop,
		)
	}, [canCropLayout, sourceCrop, imageInfo, inlineBoxW, inlineBoxH, inlineOriginal])

	const tooltipW = previewSize.width || TOOLTIP_PREVIEW_MIN_SIZE
	const tooltipH = previewSize.height || TOOLTIP_PREVIEW_MIN_SIZE
	const tooltipCroppedStyle = useMemo(() => {
		if (!canCropLayout || !sourceCrop || !imageInfo) {
			return undefined
		}
		return computeReferenceImageCroppedDisplayLayout(
			tooltipW,
			tooltipH,
			imageInfo.naturalWidth,
			imageInfo.naturalHeight,
			sourceCrop,
		)
	}, [canCropLayout, sourceCrop, imageInfo, tooltipW, tooltipH])

	const previewWrapperClass = cn(
		styles.referenceImagePreview,
		fillParent && styles.referenceImagePreviewFill,
		fillParent && objectFit === "contain" && styles.referenceImagePreviewFillContain,
	)

	const renderPreviewInner = (croppedStyle: CSSProperties | null | undefined) => (
		<>
			{isLoading && (
				<div className={styles.referenceImageLoading}>
					<LoaderCircle size={12} className={styles.loadingIcon} />
				</div>
			)}
			{hasError && (
				<div className={styles.referenceImageError}>
					<ImagePlus size={12} />
				</div>
			)}
			{displayUrl &&
				(croppedStyle ? (
					<img src={displayUrl} alt={fileName} style={croppedStyle} />
				) : (
					<img
						src={displayUrl}
						alt={fileName}
						className={styles.referenceImagePreviewImgCover}
					/>
				))}
		</>
	)

	if (inlineOriginal) {
		return (
			<div ref={inlineBoxRef} className={previewWrapperClass}>
				{renderPreviewInner(inlineCroppedStyle)}
			</div>
		)
	}

	return (
		<Tooltip open={open} onOpenChange={handleOpenChange}>
			<TooltipTrigger asChild>
				<div ref={previewBoxRef} className={previewWrapperClass}>
					{renderPreviewInner(previewCroppedStyle)}
				</div>
			</TooltipTrigger>
			<TooltipPrimitive.Portal container={portalContainer || undefined}>
				<TooltipContent
					side="left"
					sideOffset={8}
					className={styles.referenceImageTooltip}
					style={{
						...(previewSize.width ? { width: previewSize.width } : {}),
						maxWidth: TOOLTIP_PREVIEW_MIN_SIZE,
						maxHeight: TOOLTIP_PREVIEW_MIN_SIZE,
					}}
				>
					{isFullUrlLoading ? (
						<div
							style={{
								display: "flex",
								alignItems: "center",
								justifyContent: "center",
								width: previewSize.width || TOOLTIP_PREVIEW_MIN_SIZE,
								height: previewSize.height || TOOLTIP_PREVIEW_MIN_SIZE,
							}}
						>
							<LoaderCircle
								size={16}
								className={styles.loadingIcon}
								style={{ animation: "spin 1s linear infinite" }}
							/>
						</div>
					) : (
						fullUrl && (
							<div
								style={{
									position: "relative",
									overflow: "hidden",
									width: tooltipW,
									height: tooltipH,
								}}
							>
								{tooltipCroppedStyle ? (
									<img
										src={fullUrl}
										alt={fileName}
										className={styles.referenceImageTooltipPreview}
										style={{
											...tooltipCroppedStyle,
											maxWidth: "none",
											maxHeight: "none",
										}}
									/>
								) : (
									<img
										src={fullUrl}
										alt={fileName}
										className={styles.referenceImageTooltipPreview}
										style={{
											...(previewSize.width ? previewSize : {}),
											maxWidth: TOOLTIP_PREVIEW_MIN_SIZE,
											maxHeight: TOOLTIP_PREVIEW_MIN_SIZE,
										}}
									/>
								)}
							</div>
						)
					)}
				</TooltipContent>
			</TooltipPrimitive.Portal>
		</Tooltip>
	)
}
