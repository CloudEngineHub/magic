import { resolveRecordingDisplayName } from "./audio-recordings-utils"
import type { RecordingDetailFileMap } from "../types/recording-detail"

/** Resolves the shared detail title from canonical project metadata plus the list-aligned time fallback. */
export function resolveRecordingDetailTitle(input: {
	projectName?: string | null
	createdAt?: string | number
	initialTitle?: string
	magicProjectConfig?: RecordingDetailFileMap["magicProjectConfig"] | null
}) {
	// Keep detail pages pinned to canonical project metadata while reusing the
	// list fallback name when the backend still returns an empty project_name.
	return resolveRecordingDisplayName(input.projectName, input.createdAt ?? 0)
}
