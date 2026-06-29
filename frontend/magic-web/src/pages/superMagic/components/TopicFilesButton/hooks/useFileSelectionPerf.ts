import { measureManualPerfOperation } from "@/utils/manualPerfLogger"

interface SizedResult {
	size: number
}

interface SelectionTogglePerfData {
	previousSelectedCount: number
	checkState: string
	isDirectory: boolean
}

export function measureSelectionIndexBuild<T extends SizedResult>(
	treeDataRootCount: number,
	callback: () => T,
): T {
	return measureManualPerfOperation("selection_index_build_ms", callback, (result) => ({
		tree_data_root_count: treeDataRootCount,
		index_entry_count: result.size,
	}))
}

export function measureSelectionCompute<T extends SizedResult>(
	treeDataRootCount: number,
	selectedCountRaw: number,
	callback: () => T,
): T {
	return measureManualPerfOperation("selection_compute_ms", callback, (result) => ({
		tree_data_root_count: treeDataRootCount,
		selected_count_raw: selectedCountRaw,
		check_state_count: result.size,
	}))
}

export function measureSelectedCountCompute(
	selectedCountRaw: number,
	indexEntryCount: number,
	callback: () => number,
): number {
	return measureManualPerfOperation("selected_count_compute_ms", callback, (result) => ({
		selected_count_raw: selectedCountRaw,
		selected_count: result,
		index_entry_count: indexEntryCount,
	}))
}

export function measureSelectAll(treeDataRootCount: number, callback: () => string[]) {
	return measureManualPerfOperation("select_all_ms", callback, (rootFileIds) => ({
		tree_data_root_count: treeDataRootCount,
		selected_root_count: rootFileIds.length,
	}))
}

export function measureSelectionToggle(data: SelectionTogglePerfData, callback: () => string[]) {
	return measureManualPerfOperation("selection_toggle_ms", callback, (nextSelectedIds) => ({
		previous_selected_count: data.previousSelectedCount,
		next_selected_count: nextSelectedIds.length,
		check_state: data.checkState,
		is_directory: data.isDirectory,
	}))
}
