import type { CSSProperties, ReactElement, ReactNode } from "react"

export type MediaPreviewType = "image" | "video" | "audio"

export interface MediaPreviewPolicy {
	maxWidth: number
	maxHeight: number
	defaultHeight: number
}

/** Single visual policy shared by Canvas, SourceList and SuperMagic media previews. */
export const MEDIA_PREVIEW_POLICY: Record<MediaPreviewType, MediaPreviewPolicy> = {
	image: { maxWidth: 250, maxHeight: 250, defaultHeight: 141 },
	video: { maxWidth: 250, maxHeight: 250, defaultHeight: 141 },
	audio: { maxWidth: 320, maxHeight: 180, defaultHeight: 120 },
}

/**
 * Runtime-only media source consumed by the shared thumbnail/tooltip presenter.
 * URLs and React elements must never be persisted into mention or clipboard data.
 */
export interface MediaPreviewSource {
	mediaType: MediaPreviewType
	thumbnailUrl?: string | null
	thumbnailElement?: ReactNode
	previewUrl?: string | null
	/** 源媒体裁剪区域；由公共 Tooltip 统一渲染，不允许调用方传入任意媒体 DOM。 */
	crop?: MediaPreviewCrop
	posterUrl?: string | null
	poster?: ReactNode
	audioUrl?: string | null
	isLoading: boolean
	hasError: boolean
	loadPreview?: () => Promise<void>
	previewSize?: { width: number; height: number }
	/** 源媒体实际像素尺寸，用于裁剪计算；缺失时由公共媒体元素测量。 */
	sourceSize?: { width: number; height: number }
}

export interface MediaPreviewCrop {
	x: number
	y: number
	width: number
	height: number
}

export interface MediaPreviewThumbnailProps {
	mediaType: MediaPreviewType
	/** 缩略图地址；视频也可使用 poster 作为缩略图。 */
	thumbnailUrl?: string | null
	/** @deprecated 使用 thumbnailUrl。 */
	src?: string | null
	posterUrl?: string | null
	/** @deprecated 使用 posterUrl。 */
	poster?: string | null
	alt?: string
	fallback?: ReactNode
	className?: string
	style?: CSSProperties
	objectFit?: "cover" | "contain"
}

export interface MediaPreviewTooltipProps {
	children: ReactElement
	mediaType: MediaPreviewType
	fileName: string
	previewUrl?: string | null
	posterUrl?: string | null
	audioUrl?: string | null
	poster?: ReactNode
	crop?: MediaPreviewCrop
	isLoading?: boolean
	hasError?: boolean
	/** 调用层提供的本地化失败文案。 */
	errorMessage: ReactNode
	audioLabels: {
		play: string
		pause: string
		loading?: string
		progress: string
	}
	enableTouchTrigger?: boolean
	disabled?: boolean
	side?: "top" | "right" | "bottom" | "left"
	sideOffset?: number
	/** 媒体实际展示尺寸；公共 Tooltip 会按媒体类型的统一策略进行约束。 */
	previewSize?: { width: number; height: number }
	sourceSize?: { width: number; height: number }
	/** 可选的 Tooltip Portal 挂载节点，避免宿主容器裁剪内容。 */
	container?: HTMLElement | null
	open?: boolean
	onOpenChange?: (open: boolean) => void
}
