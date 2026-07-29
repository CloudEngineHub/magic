import type { MediaResourcePathKind } from "../../../runtime/resources/media-common/mediaResourcePathKind"
import { cn } from "../../../runtime/shared/lib/utils"
import { CanvasFileIcon, ReferenceSlotAudioIcon } from "../../primitives/icons/index"
import styles from "../../editors/message/index.module.css"

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
