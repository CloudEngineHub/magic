import { LoaderCircle } from "lucide-react"
import { useEffect, useState } from "react"
import type { MediaPreviewThumbnailProps } from "./types"

export function MediaPreviewThumbnail(props: MediaPreviewThumbnailProps) {
	const {
		mediaType,
		thumbnailUrl,
		src,
		posterUrl,
		poster,
		alt = "",
		fallback,
		className = "",
		style,
		objectFit = "cover",
	} = props
	const resolvedSrc = thumbnailUrl ?? src
	const resolvedPoster = posterUrl ?? poster
	const [hasLoadError, setHasLoadError] = useState(false)

	useEffect(() => setHasLoadError(false), [mediaType, resolvedSrc, resolvedPoster])

	if (hasLoadError || (!resolvedSrc && !resolvedPoster)) {
		return (
			<>
				{fallback ?? (
					<LoaderCircle size={12} className="animate-spin text-muted-foreground" />
				)}
			</>
		)
	}

	if (mediaType === "image") {
		return (
			<img
				src={resolvedSrc ?? resolvedPoster ?? undefined}
				alt={alt}
				draggable={false}
				className={className}
				style={{ objectFit, ...style }}
				onError={() => setHasLoadError(true)}
			/>
		)
	}

	if (mediaType === "video") {
		return (
			<video
				src={resolvedSrc ?? undefined}
				poster={resolvedPoster ?? undefined}
				muted
				playsInline
				preload="metadata"
				aria-label={alt}
				className={className}
				style={{ objectFit, ...style }}
				onError={() => setHasLoadError(true)}
			/>
		)
	}

	return <>{fallback}</>
}
