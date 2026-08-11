import { LoaderCircle } from "lucide-react"
import { useCallback, useRef, useState } from "react"
import * as TooltipPrimitive from "@radix-ui/react-tooltip"
import { Tooltip, TooltipContent, TooltipTrigger } from "../../primitives/shadcn/tooltip"
import { usePortalContainer } from "../../primitives/custom/PortalContainerContext"
import { cn } from "../../../runtime/shared/lib/utils"
import styles from "../../editors/message/index.module.css"
import { ReferenceSlotAudioIcon } from "../../primitives/icons/index"
import { useReferenceAudioSrc } from "./useReferenceAudioSrc"
import { useTouchTooltipTrigger } from "./useTouchTooltipTrigger"
import { useCanvasDesignI18n } from "../../../app/providers/I18nProvider"
import { ReferenceMediaTooltipHeader } from "./ReferenceMediaTooltipHeader"
import { ReferenceAudioTooltipPlayer } from "./ReferenceAudioTooltipPlayer"

interface ReferenceAudioPreviewProps {
	fileName: string
	path: string
	fillParent?: boolean
	objectFit?: "cover" | "contain"
	enableTooltip?: boolean
	tooltipSide?: "top" | "right" | "bottom" | "left"
}

export function ReferenceAudioPreview(props: ReferenceAudioPreviewProps) {
	const {
		fileName,
		path,
		fillParent,
		objectFit = "cover",
		enableTooltip = false,
		tooltipSide = "top",
	} = props
	const portalContainer = usePortalContainer()
	const { t } = useCanvasDesignI18n()
	const [open, setOpen] = useState(false)
	const audioRef = useRef<HTMLAudioElement>(null)
	const { src, isLoading, hasError, load } = useReferenceAudioSrc(path)
	const handleOpenChange = useCallback(
		(nextOpen: boolean) => {
			setOpen(nextOpen)
			if (nextOpen) {
				void load()
			} else {
				audioRef.current?.pause()
			}
		},
		[load],
	)
	const handleTooltipClose = useCallback(() => handleOpenChange(false), [handleOpenChange])
	const { handlePointerDown, handleClick, handlePointerCancel } = useTouchTooltipTrigger(
		() => handleOpenChange(true),
		{ open, onClose: handleTooltipClose },
	)
	const previewWrapperClass = cn(
		styles.referenceImagePreview,
		fillParent && styles.referenceImagePreviewFill,
		fillParent && objectFit === "contain" && styles.referenceImagePreviewFillContain,
	)
	const previewContent = (
		<div className="flex h-full w-full items-center justify-center bg-muted/40">
			<ReferenceSlotAudioIcon size={28} />
		</div>
	)

	if (!enableTooltip) {
		return <div className={previewWrapperClass}>{previewContent}</div>
	}

	return (
		<Tooltip open={open} onOpenChange={handleOpenChange} delayDuration={250}>
			<TooltipTrigger asChild>
				<div
					className={previewWrapperClass}
					data-reference-media-tooltip-trigger=""
					onPointerDown={handlePointerDown}
					onClick={handleClick}
					onPointerCancel={handlePointerCancel}
				>
					{previewContent}
				</div>
			</TooltipTrigger>
			<TooltipPrimitive.Portal container={portalContainer || undefined}>
				<TooltipContent
					data-reference-media-tooltip-content=""
					side={tooltipSide}
					sideOffset={8}
					className={styles.referenceMediaTooltip}
				>
					<div className={styles.referenceMediaTooltipBody}>
						<div className={styles.referenceMediaTooltipAudioViewport}>
							<ReferenceMediaTooltipHeader fileName={fileName} />
							{isLoading ? (
								<div className={styles.referenceMediaTooltipLoading}>
									<LoaderCircle size={16} className={styles.loadingIcon} />
								</div>
							) : hasError || !src ? (
								<div className={styles.referenceMediaTooltipError}>
									{t(
										"mediaResourceFullscreenPreview.audioLoadFailed",
										"音频加载失败",
									)}
								</div>
							) : (
								<ReferenceAudioTooltipPlayer
									audioRef={audioRef}
									src={src}
									fileName={fileName}
									autoPlay={open}
								/>
							)}
						</div>
					</div>
				</TooltipContent>
			</TooltipPrimitive.Portal>
		</Tooltip>
	)
}
