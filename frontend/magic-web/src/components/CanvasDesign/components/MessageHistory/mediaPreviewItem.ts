import { getMediaResourcePathKind } from "../../canvas/utils/mediaResourcePathKind"
import type { MediaResourceFullscreenPreviewItem } from "../MediaResourceFullscreenPreview"
import { getFullscreenMediaFileLabel } from "../FullscreenMediaShell/getFullscreenMediaFileLabel"

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
