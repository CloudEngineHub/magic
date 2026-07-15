import { useEffect, useState, type ReactNode } from "react"
import { cn } from "@/lib/utils"
import type { AttachmentItem } from "../hooks/types"
import {
	resolveProjectFileImagePreviewSource,
	useProjectFileImagePreviewContext,
} from "./ProjectFileImagePreviewProvider"

type ImageLoadPhase = "loading" | "loaded" | "error"

interface ProjectFileImageThumbnailIconProps {
	item: AttachmentItem
	size?: number
	className?: string
	dataTestId?: string
	fallback: ReactNode
}

/** Displays project image thumbnails from the list-level preview manager. */
export function ProjectFileImageThumbnailIcon({
	item,
	size = 16,
	className,
	dataTestId = "project-file-image-thumbnail",
	fallback,
}: ProjectFileImageThumbnailIconProps) {
	const manager = useProjectFileImagePreviewContext()
	const source = resolveProjectFileImagePreviewSource(item)
	const previewState = source
		? manager?.getPreviewState(source) ||
			(source.directThumbnailUrl
				? { status: "loaded" as const, url: source.directThumbnailUrl }
				: { status: "idle" as const })
		: null
	const previewUrl = previewState?.url
	const [imagePhase, setImagePhase] = useState<ImageLoadPhase>("loading")

	useEffect(() => {
		setImagePhase("loading")
	}, [previewUrl, source?.cacheKey])

	if (!source || (!manager && !source.directThumbnailUrl)) {
		return <>{fallback}</>
	}

	if (previewState?.status === "error" || (previewUrl && imagePhase === "error")) {
		return <>{fallback}</>
	}

	return (
		<div
			className={cn("relative shrink-0 overflow-hidden rounded bg-muted", className)}
			style={{
				width: size,
				height: size,
				minWidth: size,
				minHeight: size,
				maxWidth: size,
				maxHeight: size,
			}}
			data-testid={dataTestId}
			aria-hidden
		>
			{(!previewUrl || imagePhase !== "loaded") && (
				<div
					className={cn(
						"absolute inset-0 rounded bg-muted",
						"animate-pulse motion-reduce:animate-none",
					)}
					data-testid={`${dataTestId}-loading`}
				/>
			)}
			{previewUrl && (
				<img
					src={previewUrl}
					alt=""
					className={cn(
						"absolute inset-0 block h-full w-full object-cover",
						imagePhase === "loaded" ? "opacity-100" : "opacity-0",
					)}
					loading="lazy"
					decoding="async"
					referrerPolicy="no-referrer"
					data-testid={`${dataTestId}-image`}
					onLoad={() => {
						setImagePhase("loaded")
					}}
					onError={() => {
						setImagePhase("error")
						manager?.markPreviewImageError(source)
					}}
				/>
			)}
		</div>
	)
}
