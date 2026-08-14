import { useEffect, useMemo, useState, type CSSProperties } from "react"
import { MediaPreviewTooltip } from "@/components/base/MediaPreview"
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
import { useCanvasDesignI18n } from "../../../app/providers/I18nProvider"
import { REFERENCE_MEDIA_TOOLTIP_MAX_SIZE } from "./constants"
import { usePortalContainer } from "../../primitives/custom/PortalContainerContext"

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
	const { t } = useCanvasDesignI18n()
	const [previewContentError, setPreviewContentError] = useState(false)
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
	useEffect(() => setPreviewContentError(false), [fullUrl])

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

	const inlinePreview = (
		<div ref={inlineOriginal ? inlineBoxRef : previewBoxRef} className={previewWrapperClass}>
			{renderPreviewInner(inlineOriginal ? inlineCroppedStyle : previewCroppedStyle)}
		</div>
	)

	if (inlineOriginal && !showTooltip) {
		return inlinePreview
	}

	if (!showTooltip) return inlinePreview

	const previewContent = fullUrl ? (
		<div
			className="relative overflow-hidden bg-black"
			style={{ width: tooltipW, height: tooltipH }}
		>
			<img
				src={fullUrl}
				alt={fileName}
				className="block object-contain"
				style={{
					...(tooltipCroppedStyle || { width: tooltipW, height: tooltipH }),
					maxWidth: "none",
					maxHeight: "none",
				}}
				onError={() => setPreviewContentError(true)}
			/>
		</div>
	) : undefined

	return (
		<MediaPreviewTooltip
			mediaType="image"
			fileName={fileName}
			previewUrl={fullUrl}
			isLoading={isFullUrlLoading}
			hasError={hasError || previewContentError || (!isFullUrlLoading && !fullUrl)}
			errorMessage={t("mediaResourceFullscreenPreview.imageLoadFailed", "图片加载失败")}
			closeLabel={t("mediaResourceFullscreenPreview.close", "关闭预览")}
			audioLabels={{
				play: t("video.fullscreen.play", "播放"),
				pause: t("video.fullscreen.pause", "暂停"),
				progress: t("video.fullscreen.progress", "播放进度"),
			}}
			maxWidth={tooltipW}
			maxHeight={tooltipH}
			side={tooltipSide ?? "top"}
			open={open}
			onOpenChange={handleOpenChange}
			enableTouchTrigger
			container={portalContainer}
			previewContent={previewContent}
		>
			{inlinePreview}
		</MediaPreviewTooltip>
	)
}
