import { useCallback, useMemo, type CSSProperties } from "react"
import { Tooltip, TooltipContent, TooltipTrigger } from "../../primitives/shadcn/tooltip"
import * as TooltipPrimitive from "@radix-ui/react-tooltip"
import { usePortalContainer } from "../../primitives/custom/PortalContainerContext"
import { useReferenceImageUrls } from "../../../app/hooks/resources/useReferenceImageUrls"
import { ImagePlus, LoaderCircle, X } from "lucide-react"
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
import { useTouchTooltipTrigger } from "./useTouchTooltipTrigger"
import { useCanvasDesignI18n } from "../../../app/providers/I18nProvider"
import { REFERENCE_MEDIA_TOOLTIP_MAX_SIZE } from "./constants"

export function ReferenceImageLowPreview(props: ReferenceMediaPreviewProps) {
	const {
		fileName,
		path,
		fillParent,
		objectFit = "cover",
		inlineOriginal,
		sourceCrop,
		enableTooltip,
		tooltipSide,
	} = props
	const showTooltip = enableTooltip ?? !inlineOriginal
	const tooltipMaxSize = enableTooltip
		? REFERENCE_MEDIA_TOOLTIP_MAX_SIZE
		: TOOLTIP_PREVIEW_MIN_SIZE
	const portalContainer = usePortalContainer()
	const { t } = useCanvasDesignI18n()
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
	const handleTooltipClose = useCallback(() => handleOpenChange(false), [handleOpenChange])
	const { handlePointerDown, handleClick, handlePointerCancel } = useTouchTooltipTrigger(
		() => handleOpenChange(true),
		{ open, onClose: handleTooltipClose },
	)

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
				return calculateTooltipBoundedPreviewSize(
					{
						naturalWidth: p.width,
						naturalHeight: p.height,
					},
					tooltipMaxSize,
				)
			}
		}
		return calculateTooltipBoundedPreviewSize(imageInfo, tooltipMaxSize)
	}, [imageInfo, sourceCrop, tooltipMaxSize])

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

	const tooltipW = previewSize.width || tooltipMaxSize
	const tooltipH = previewSize.height || tooltipMaxSize
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

	const triggerHandlers = showTooltip
		? {
				onPointerDown: handlePointerDown,
				onClick: handleClick,
				onPointerCancel: handlePointerCancel,
			}
		: undefined
	const inlinePreview = (
		<div
			ref={inlineBoxRef}
			className={previewWrapperClass}
			data-reference-media-tooltip-trigger={showTooltip ? "" : undefined}
			{...triggerHandlers}
		>
			{renderPreviewInner(inlineCroppedStyle)}
		</div>
	)

	if (inlineOriginal && !showTooltip) {
		return inlinePreview
	}

	const tooltipPreview = (
		<TooltipContent
			data-reference-media-tooltip-content=""
			side={enableTooltip ? (tooltipSide ?? "top") : (tooltipSide ?? "left")}
			sideOffset={8}
			className={enableTooltip ? styles.referenceMediaTooltip : styles.referenceImageTooltip}
			style={{
				...(previewSize.width ? { width: previewSize.width } : {}),
				maxWidth: tooltipMaxSize,
				maxHeight: tooltipMaxSize,
			}}
		>
			{enableTooltip ? (
				<div className={styles.referenceMediaTooltipBody}>
					<div
						className={styles.referenceMediaTooltipImageViewport}
						style={{ width: tooltipW, height: tooltipH }}
					>
						<div className={styles.referenceMediaTooltipImageChrome}>
							<span
								className={styles.referenceMediaTooltipImageFileName}
								title={fileName}
							>
								{fileName}
							</span>
							<button
								type="button"
								className={styles.referenceMediaTooltipImageClose}
								aria-label={t("mediaResourceFullscreenPreview.close", "关闭预览")}
								onClick={(event) => {
									event.stopPropagation()
									handleTooltipClose()
								}}
							>
								<X size={16} aria-hidden />
							</button>
						</div>
						{isFullUrlLoading ? (
							<div className={styles.referenceMediaTooltipLoading}>
								<LoaderCircle size={16} className={styles.loadingIcon} />
							</div>
						) : fullUrl ? (
							tooltipCroppedStyle ? (
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
										width: tooltipW,
										height: tooltipH,
										maxWidth: "none",
										maxHeight: "none",
									}}
								/>
							)
						) : (
							<div className={styles.referenceMediaTooltipError}>
								{t(
									"mediaResourceFullscreenPreview.imageLoadFailed",
									"图片加载失败",
								)}
							</div>
						)}
					</div>
				</div>
			) : isFullUrlLoading ? (
				<div
					style={{
						display: "flex",
						alignItems: "center",
						justifyContent: "center",
						width: previewSize.width || tooltipMaxSize,
						height: previewSize.height || tooltipMaxSize,
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
									maxWidth: tooltipMaxSize,
									maxHeight: tooltipMaxSize,
								}}
							/>
						)}
					</div>
				)
			)}
		</TooltipContent>
	)

	if (inlineOriginal) {
		return (
			<Tooltip
				open={open}
				onOpenChange={handleOpenChange}
				delayDuration={enableTooltip ? 250 : undefined}
			>
				<TooltipTrigger asChild>{inlinePreview}</TooltipTrigger>
				<TooltipPrimitive.Portal container={portalContainer || undefined}>
					{tooltipPreview}
				</TooltipPrimitive.Portal>
			</Tooltip>
		)
	}

	return (
		<Tooltip
			open={open}
			onOpenChange={handleOpenChange}
			delayDuration={enableTooltip ? 250 : undefined}
		>
			<TooltipTrigger asChild>
				<div
					ref={previewBoxRef}
					className={previewWrapperClass}
					data-reference-media-tooltip-trigger=""
					{...triggerHandlers}
				>
					{renderPreviewInner(previewCroppedStyle)}
				</div>
			</TooltipTrigger>
			<TooltipPrimitive.Portal container={portalContainer || undefined}>
				{tooltipPreview}
			</TooltipPrimitive.Portal>
		</Tooltip>
	)
}
