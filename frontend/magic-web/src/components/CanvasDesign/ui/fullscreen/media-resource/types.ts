import type { MediaResourcePathKind } from "../../../runtime/resources/media-common/mediaResourcePathKind"

export type PreviewableMediaResourceKind = Exclude<MediaResourcePathKind, "other">

export interface MediaResourceFullscreenPreviewItem {
	path: string
	fileName: string
	kind: PreviewableMediaResourceKind
}
