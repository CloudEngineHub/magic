import type { AttachmentItem } from "../components/TopicFilesButton/hooks"
import { manualPerfLogger } from "@/utils/manualPerfLogger"
import { collectFileTreeStats, type FileTreeStats } from "./fileTreePerf"

interface AttachmentProcessIndexesSnapshot {
	itemsByFileId: Map<string, unknown>
}

interface DisplayConfigProcessResult {
	processedTree: AttachmentItem[]
	processedList: AttachmentItem[]
}

export class AttachmentDataProcessorPerf {
	private readonly processStartedAt = manualPerfLogger.now()
	private readonly enabled = manualPerfLogger.isEnabled()
	private readonly sourceStats?: FileTreeStats
	private listFindCount = 0
	private listFindMs = 0
	private mapLookupCount = 0
	private mapLookupMs = 0

	private constructor(tree: AttachmentItem[]) {
		this.sourceStats = this.enabled ? collectFileTreeStats(tree) : undefined
	}

	static create(tree: AttachmentItem[]) {
		return new AttachmentDataProcessorPerf(tree)
	}

	measureFlatten<T extends unknown[]>(callback: () => T): T {
		if (!this.enabled) return callback()

		const startedAt = manualPerfLogger.now()
		const result = callback()
		manualPerfLogger.recordDuration("flatten_tree_ms", startedAt, {
			source: "AttachmentDataProcessor.processAttachmentData",
			...this.sourceStats,
			list_count: result.length,
		})
		return result
	}

	measureIndexBuild<T extends AttachmentProcessIndexesSnapshot>(
		flatItemsCount: number,
		callback: () => T,
	): T {
		if (!this.enabled) return callback()

		const startedAt = manualPerfLogger.now()
		const result = callback()
		manualPerfLogger.recordDuration("display_config_index_build_ms", startedAt, {
			source: "AttachmentDataProcessor.buildAttachmentIndexes",
			flat_items_count: flatItemsCount,
			index_entry_count: result.itemsByFileId.size,
		})
		return result
	}

	measureDisplayConfig(callback: () => DisplayConfigProcessResult): DisplayConfigProcessResult {
		if (!this.enabled) return callback()

		const startedAt = manualPerfLogger.now()
		const result = callback()
		manualPerfLogger.recordDuration("display_config_process_ms", startedAt, {
			source: "AttachmentDataProcessor.processDisplayConfigForItems",
			...this.sourceStats,
			list_count: result.processedList.length,
		})
		this.recordLookupSummary()
		return result
	}

	measureMapLookup<T>(callback: () => T): T {
		if (!this.enabled) return callback()

		const startedAt = manualPerfLogger.now()
		const result = callback()
		this.mapLookupCount += 1
		this.mapLookupMs += manualPerfLogger.now() - startedAt
		return result
	}

	finishSuccess(listCount: number) {
		this.recordProcessDuration("success", listCount)
	}

	finishValidationFailed(listCount: number) {
		this.recordProcessDuration("validation_failed", listCount)
	}

	finishError(error: unknown, listCount: number) {
		manualPerfLogger.logError("processAttachmentData", error, {
			...this.sourceStats,
			list_count: listCount,
		})
		this.recordProcessDuration("error", listCount)
	}

	private recordLookupSummary() {
		manualPerfLogger.count("list_find_count", this.listFindCount, {
			source: "AttachmentDataProcessor.processDisplayConfigForItems",
		})
		manualPerfLogger.recordMetric("list_find_ms", this.listFindMs, {
			source: "AttachmentDataProcessor.processDisplayConfigForItems",
		})
		manualPerfLogger.count("map_lookup_count", this.mapLookupCount, {
			source: "AttachmentDataProcessor.processDisplayConfigForItems",
		})
		manualPerfLogger.recordMetric("map_lookup_ms", this.mapLookupMs, {
			source: "AttachmentDataProcessor.processDisplayConfigForItems",
		})
	}

	private recordProcessDuration(status: string, listCount: number) {
		manualPerfLogger.recordDuration("processAttachmentData_ms", this.processStartedAt, {
			status,
			...this.sourceStats,
			list_count: listCount,
		})
	}
}
