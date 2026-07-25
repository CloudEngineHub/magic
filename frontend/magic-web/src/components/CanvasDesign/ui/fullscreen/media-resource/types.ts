import type { MediaResourcePathKind } from "../../../runtime/resources/media-common/mediaResourcePathKind"
import type { CropConfig } from "../../../runtime/document/types"

export type PreviewableMediaResourceKind = Exclude<MediaResourcePathKind, "other">

export interface MediaResourceFullscreenPreviewItem {
	path: string
	fileName: string
	kind: PreviewableMediaResourceKind
	crop?: CropConfig
}
