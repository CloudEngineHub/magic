import type { AttachmentItem } from "../../components/TopicFilesButton/hooks"
import { AttachmentDataProcessor } from "../attachmentDataProcessor"
import { flattenAttachmentTree, removeHiddenAttachmentItems, sortAttachmentTree } from "./treeUtils"

export interface ProjectAttachmentsChangeOperationCounts {
	add: number
	delete: number
	update: number
	unknown: number
}

export function createProjectAttachmentsChangeOperationCounts(): ProjectAttachmentsChangeOperationCounts {
	return {
		add: 0,
		delete: 0,
		update: 0,
		unknown: 0,
	}
}

export function toProcessedAttachmentTree(tree: AttachmentItem[], locale?: string) {
	// fallback or legacy callers may pass unfiltered/unsorted trees; normalize them.
	const visibleTree = removeHiddenAttachmentItems(tree)
	const sortedTree = sortAttachmentTree(visibleTree, locale)
	return toProcessedSortedAttachmentTree(sortedTree)
}

export function toProcessedSortedAttachmentTree(sortedTree: AttachmentItem[]) {
	// sortedTree is sorted but has no list; flatten once in this compatibility entry.
	return toProcessedSortedAttachmentData(sortedTree, flattenAttachmentTree(sortedTree))
}

export function toProcessedSortedAttachmentData(
	sortedTree: AttachmentItem[],
	sortedList: AttachmentItem[],
) {
	// Successful reducer returns tree/list; preserveList avoids another flatten pass.
	// Keep display_config/metadata post-processing consistent with first load.
	const processedData = AttachmentDataProcessor.processAttachmentData(
		{
			tree: sortedTree,
			list: sortedList,
		},
		{
			preserveList: true,
		},
	)

	return {
		tree: processedData.tree as AttachmentItem[],
		list: processedData.list as AttachmentItem[],
	}
}
