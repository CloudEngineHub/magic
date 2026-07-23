import { useEffect, useState, type ReactNode } from "react"
import SmartTooltip from "@/components/other/SmartTooltip"
import {
	ProjectFileImagePreviewTooltipContent,
	type ProjectFileImagePreviewSource,
	useProjectFileImagePreviewContext,
	useProjectFileImagePreviewState,
} from "./ProjectFileImagePreviewProvider"

interface ProjectFileImageSmartTooltipProps {
	source: ProjectFileImagePreviewSource
	children: ReactNode
	className?: string
	sideOffset?: number
}

/** Falls back to SmartTooltip's regular file-name overflow behavior when image preview fails. */
export function ProjectFileImageSmartTooltip({
	source,
	children,
	className,
	sideOffset = 0,
}: ProjectFileImageSmartTooltipProps) {
	const manager = useProjectFileImagePreviewContext()
	const previewState = useProjectFileImagePreviewState(source)
	const [previewImageFailed, setPreviewImageFailed] = useState(false)

	useEffect(() => {
		setPreviewImageFailed(false)
	}, [previewState?.url, source.cacheKey])

	const previewRequestFailed = previewState?.status === "error"
	const previewUnavailable = previewState?.status === "unavailable"
	const shouldUseNameTooltip = previewRequestFailed || previewUnavailable || previewImageFailed

	return (
		<SmartTooltip
			placement="right"
			className={className}
			sideOffset={sideOffset}
			forceShowTooltip={!shouldUseNameTooltip}
			tooltipContentClassName={
				shouldUseNameTooltip
					? undefined
					: "max-w-none whitespace-nowrap text-nowrap break-normal"
			}
			tooltipContentStyle={shouldUseNameTooltip ? undefined : { maxWidth: "none" }}
			content={
				shouldUseNameTooltip ? undefined : (
					<ProjectFileImagePreviewTooltipContent
						source={source}
						onPreviewUnavailable={() => setPreviewImageFailed(true)}
					/>
				)
			}
			onOpenChange={(open) => {
				if (open && !previewUnavailable && !previewImageFailed) {
					manager?.ensurePreview(source)
				}
			}}
		>
			{children}
		</SmartTooltip>
	)
}
