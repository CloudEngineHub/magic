import { useMemo, useState } from "react"
import { measureFileTreeOperation } from "@/pages/superMagic/utils/fileTreePerf"
import {
	buildFileFilterResult,
	getFileTypeCategory,
	type FileFilterResult,
	type FileFilters,
} from "../utils/fileFilter"
import { recordSearchFilterResultMetrics } from "./useTopicFilesPerf"
import type { AttachmentItem } from "./types"

interface UseFileFilterOptions {
	attachments: AttachmentItem[]
	fileFilters: FileFilters
	externalSearchValue?: string
}

/**
 * useFileFilter - 处理文件过滤功能
 */
export function useFileFilter(options: UseFileFilterOptions) {
	const { attachments, fileFilters, externalSearchValue } = options

	// 搜索状态
	const [searchValue, setSearchValue] = useState("")

	// 使用外部搜索值（如果提供）否则使用内部搜索值
	const effectiveSearchValue =
		externalSearchValue !== undefined ? externalSearchValue : searchValue

	const filterResult = useMemo<FileFilterResult>(() => {
		const hasSearch = Boolean(effectiveSearchValue.trim())
		const result = measureFileTreeOperation(
			hasSearch ? "search_ms" : "file_filter_ms",
			attachments,
			() =>
				buildFileFilterResult({
					attachments,
					fileFilters,
					searchValue: effectiveSearchValue,
				}),
			(filterResult) => ({
				has_search: hasSearch,
				search_value_length: effectiveSearchValue.length,
				filtered_root_count: filterResult.filteredFiles.length,
				matched_item_count: filterResult.matchedItemCount,
				matched_parent_paths_count: filterResult.matchedItemPaths.length,
				search_result_too_large: filterResult.resultTooLarge,
			}),
		)
		recordSearchFilterResultMetrics({
			hasSearch,
			searchValueLength: effectiveSearchValue.length,
			filteredRootCount: result.filteredFiles.length,
			matchedItemCount: result.matchedItemCount,
			matchedAncestorCount: result.matchedItemPaths.length,
			resultTooLarge: result.resultTooLarge,
		})
		return result
	}, [attachments, effectiveSearchValue, fileFilters])
	const { filteredFiles, matchedItemPaths } = filterResult

	// 重置搜索状态
	const resetFilter = () => {
		setSearchValue("")
	}

	return {
		// 搜索状态
		searchValue,
		setSearchValue,

		// 计算值
		filteredFiles,
		matchedItemPaths,

		// 工具函数
		getFileTypeCategory,
		resetFilter,
	}
}
