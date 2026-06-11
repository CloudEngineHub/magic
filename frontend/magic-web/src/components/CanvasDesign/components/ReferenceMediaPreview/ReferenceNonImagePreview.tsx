import type { MediaResourcePathKind } from "../../canvas/utils/mediaResourcePathKind"
import { cn } from "../../lib/utils"
import { CanvasFileIcon, ReferenceSlotAudioIcon } from "../ui/icons"
import styles from "../MessageEditor/index.module.css"

export interface ReferenceNonImagePreviewProps {
	fileType: Exclude<MediaResourcePathKind, "image" | "video">
	fillParent?: boolean
	objectFit?: "cover" | "contain"
}

export function ReferenceNonImagePreview(props: ReferenceNonImagePreviewProps) {
	const { fileType, fillParent, objectFit = "cover" } = props
	const previewWrapperClass = cn(
		styles.referenceImagePreview,
		fillParent && styles.referenceImagePreviewFill,
		fillParent && objectFit === "contain" && styles.referenceImagePreviewFillContain,
	)
	const slotIcon =
		fileType === "audio" ? (
			<ReferenceSlotAudioIcon size={28} />
		) : (
			<CanvasFileIcon size={28} className="text-muted-foreground" />
		)
	return (
		<div className={previewWrapperClass}>
			<div className="flex h-full w-full items-center justify-center bg-muted/40">
				{slotIcon}
			</div>
		</div>
	)
}
