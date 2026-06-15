import type { RecordingDetailFileMap } from "../types"

/** Resolves the mobile detail title from canonical project metadata only. */
export function resolveRecordingDetailTitle(input: {
	projectName?: string | null
	initialTitle?: string
	magicProjectConfig?: RecordingDetailFileMap["magicProjectConfig"] | null
}) {
	return input.projectName?.trim() || ""
}
