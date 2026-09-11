import { LoaderCircle } from "lucide-react"
import { useCallback, type CSSProperties, type ReactElement, type ReactNode } from "react"
import { MediaPreviewThumbnail } from "./MediaPreview"
import { MediaPreviewTooltip } from "./MediaPreviewTooltip"
import type { MediaPreviewSource } from "./types"

export interface MediaPreviewTriggerLabels {
	errorMessage: ReactNode
	audioLabels: {
		play: string
		pause: string
		loading?: string
		progress: string
	}
}

export interface MediaPreviewTriggerProps {
	fileName: string
	source?: MediaPreviewSource | null
	fallback: ReactNode
	/** Builds the business-specific trigger while receiving the shared thumbnail. */
	renderTrigger: (thumbnail: ReactNode) => ReactElement
	labels: MediaPreviewTriggerLabels
	enabled?: boolean
	enableTouchTrigger?: boolean
	disabled?: boolean
	side?: "top" | "right" | "bottom" | "left"
	sideOffset?: number
	container?: HTMLElement | null
	open?: boolean
	onOpenChange?: (open: boolean) => void
	thumbnailClassName?: string
	thumbnailStyle?: CSSProperties
}

/**
 * Shared media mention presenter. Resource owners provide source state while this
 * component owns thumbnail fallback, tooltip composition and open-time loading.
 */
export function MediaPreviewTrigger(props: MediaPreviewTriggerProps) {
	const {
		fileName,
		source,
		fallback,
		renderTrigger,
		labels,
		enabled = true,
		enableTouchTrigger = true,
		disabled = false,
		side = "top",
		sideOffset,
		container,
		open,
		onOpenChange,
		thumbnailClassName = "size-4 shrink-0 rounded object-cover",
		thumbnailStyle,
	} = props

	const loadPreview = useCallback(
		(nextOpen: boolean) => {
			if (nextOpen) void source?.loadPreview?.()
			onOpenChange?.(nextOpen)
		},
		[onOpenChange, source],
	)
	// Keep the loading slot on the same box as the ready thumbnail (default size-4 /
	// 16px) so mention chips do not jitter when the spinner swaps to icon or image.
	const thumbnailFallback = source?.isLoading ? (
		<span
			className={`${thumbnailClassName} inline-flex items-center justify-center`}
			aria-label="Loading"
		>
			<LoaderCircle className="size-full animate-spin text-muted-foreground" aria-hidden />
		</span>
	) : (
		fallback
	)

	const thumbnail = source
		? (source.thumbnailElement ?? (
				<MediaPreviewThumbnail
					mediaType={source.mediaType}
					thumbnailUrl={source.thumbnailUrl}
					posterUrl={source.posterUrl}
					alt={fileName}
					fallback={thumbnailFallback}
					className={thumbnailClassName}
					style={thumbnailStyle}
				/>
			))
		: fallback

	const trigger = renderTrigger(thumbnail)
	const canPreview = Boolean(
		source &&
		(source.thumbnailElement ||
			source.previewUrl ||
			source.posterUrl ||
			source.audioUrl ||
			source.isLoading ||
			source.hasError ||
			source.loadPreview),
	)
	if (!enabled || !source || !canPreview) return trigger

	return (
		<MediaPreviewTooltip
			mediaType={source.mediaType}
			fileName={fileName}
			previewUrl={source.previewUrl}
			posterUrl={source.posterUrl}
			audioUrl={source.audioUrl}
			poster={source.poster}
			crop={source.crop}
			isLoading={source.isLoading}
			hasError={source.hasError}
			errorMessage={labels.errorMessage}
			audioLabels={labels.audioLabels}
			enableTouchTrigger={enableTouchTrigger}
			disabled={disabled}
			side={side}
			sideOffset={sideOffset}
			previewSize={source.previewSize}
			sourceSize={source.sourceSize}
			container={container}
			open={open}
			onOpenChange={loadPreview}
		>
			{trigger}
		</MediaPreviewTooltip>
	)
}
