import { useMemo } from "react"
import { getMediaResourcePathKind } from "../../../runtime/resources/media-common/mediaResourcePathKind"
import { ReferenceImageLowPreview } from "./ReferenceImageLowPreview"
import { ReferenceNonImagePreview } from "./ReferenceNonImagePreview"
import { ReferenceVideoPosterPreview } from "./ReferenceVideoPosterPreview"
import type { ReferenceMediaPreviewProps } from "./types"

export type { ReferenceMediaPreviewProps } from "./types"

export default function ReferenceMediaPreview(props: ReferenceMediaPreviewProps) {
	const fileType = useMemo(() => getMediaResourcePathKind(props.path), [props.path])

	if (fileType === "video") {
		return (
			<ReferenceVideoPosterPreview
				fileName={props.fileName}
				path={props.path}
				fillParent={props.fillParent}
				objectFit={props.objectFit}
			/>
		)
	}

	if (fileType !== "image") {
		return (
			<ReferenceNonImagePreview
				fileType={fileType}
				fillParent={props.fillParent}
				objectFit={props.objectFit}
			/>
		)
	}

	return <ReferenceImageLowPreview {...props} />
}
