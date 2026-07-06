import { getMediaResourcePathKind } from "../../../runtime/resources/media-common/mediaResourcePathKind"
import type { MediaResourceFullscreenPreviewItem } from "../../fullscreen/media-resource/index"
import { getFullscreenMediaFileLabel } from "../../fullscreen/shell/getFullscreenMediaFileLabel"

export function buildPreviewMediaResourceItem(
	path: string,
): MediaResourceFullscreenPreviewItem | null {
	const kind = getMediaResourcePathKind(path)
	if (kind === "other") return null
	return {
		path,
		fileName: getFullscreenMediaFileLabel(path),
		kind,
	}
}
