import type { AttachmentItem } from "@/pages/superMagic/components/TopicFilesButton/hooks/types"
import type { RecordingDetailFileMap } from "../types/recording-detail"
import { collectExportableFileIds } from "./download-recording-batch"

/** Identifies which detail tab group a shareable recording file belongs to. */
export type RecordingShareGroupKey = "audio" | "transcript" | "notes" | "summary"

/** One whitelisted file entry used by PC/H5 share pickers. */
export interface RecordingShareGroupedItem {
	groupKey: RecordingShareGroupKey
	summaryType?: string
	file: AttachmentItem
	fileId: string
}

/** Flat and grouped share selection derived from the recording detail file map. */
export interface RecordingShareSelection {
	shareableFiles: AttachmentItem[]
	groupedItems: RecordingShareGroupedItem[]
	defaultSelectedFileIds: string[]
}

/**
 * Builds the recording share whitelist from the same fileMap used by the detail workbench.
 * Excludes magic.project.js and only includes files the detail page can surface.
 */
export function buildRecordingShareSelection(
	fileMap: RecordingDetailFileMap | null,
): RecordingShareSelection {
	const defaultSelectedFileIds = collectExportableFileIds(fileMap)
	if (!fileMap) {
		return { shareableFiles: [], groupedItems: [], defaultSelectedFileIds: [] }
	}

	const groupedItems: RecordingShareGroupedItem[] = []
	const shareableFiles: AttachmentItem[] = []
	const seen = new Set<string>()

	function pushItem(
		file: AttachmentItem | undefined,
		groupKey: RecordingShareGroupKey,
		summaryType?: string,
	) {
		const fileId = file?.file_id
		if (!file || !fileId || seen.has(fileId)) return

		seen.add(fileId)
		groupedItems.push({ groupKey, summaryType, file, fileId })
		shareableFiles.push(file)
	}

	pushItem(fileMap.audio, "audio")
	pushItem(fileMap.transcript, "transcript")
	pushItem(fileMap.notes, "notes")
	fileMap.summaryFiles.forEach((ref) => {
		pushItem(ref.file, "summary", ref.type)
	})

	return { shareableFiles, groupedItems, defaultSelectedFileIds }
}
