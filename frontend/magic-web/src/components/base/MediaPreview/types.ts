import type { CSSProperties, ReactElement, ReactNode } from "react"

export type MediaPreviewType = "image" | "video" | "audio"

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
	previewContent?: ReactNode
	isLoading?: boolean
	hasError?: boolean
	/** 调用层提供的本地化失败文案。 */
	errorMessage: ReactNode
	/** 调用层提供的本地化关闭按钮文案。 */
	closeLabel: string
	audioLabels: {
		play: string
		pause: string
		progress: string
	}
	enableTouchTrigger?: boolean
	disabled?: boolean
	side?: "top" | "right" | "bottom" | "left"
	maxWidth?: number
	maxHeight?: number
	/** 媒体实际展示尺寸；未提供时按 maxWidth/maxHeight 计算。 */
	previewSize?: { width: number; height: number }
	/** 可选的 Tooltip Portal 挂载节点，避免宿主容器裁剪内容。 */
	container?: HTMLElement | null
	open?: boolean
	onOpenChange?: (open: boolean) => void
}
