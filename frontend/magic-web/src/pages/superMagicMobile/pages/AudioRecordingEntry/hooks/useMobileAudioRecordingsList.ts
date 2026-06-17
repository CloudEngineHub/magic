import { useCallback, useEffect, useMemo, useState } from "react"
import { useDebounce } from "ahooks"
import type { AudioProjectListItem, AudioRecordingSummaryFilter } from "@/types/audioProject"
import { audioRecordingsStore } from "@/pages/superMagic/pages/AudioRecordings/stores/audio-recordings-store"
import {
	ALL_RECORDING_GROUP_ID,
	audioRecordingsService,
	recordingGroupsService,
	UNGROUPED_RECORDING_GROUP_ID,
	type AudioRecordingGroup,
} from "@/services/audioRecordings"
import { resolveMobileDatePresetRange } from "../utils/mobile-recording-date-filter"
import {
	countActiveMobileAudioFilters,
	MOBILE_AUDIO_RECORDINGS_FILTER_DEFAULT,
	parseMobileSortOption,
	type MobileAudioRecordingsFilterState,
} from "../types"

const SEARCH_DEBOUNCE_MS = 300

/**
 * Binds mobile recording list UI to a global shared AudioRecordingsStore instance.
 * Mirrors PC desktop lifecycle: register poller on mount, reset on unmount.
 */
export function useMobileAudioRecordingsList() {
	const store = audioRecordingsStore

	const [searchKeyword, setSearchKeyword] = useState("")
	const [isSearchComposing, setIsSearchComposing] = useState(false)
	const [searchOpen, setSearchOpen] = useState(false)
	const [filterState, setFilterState] = useState<MobileAudioRecordingsFilterState>(
		MOBILE_AUDIO_RECORDINGS_FILTER_DEFAULT,
	)
	const [filterSheetOpen, setFilterSheetOpen] = useState(false)
	const [importSheetOpen, setImportSheetOpen] = useState(false)
	const [moreTarget, setMoreTarget] = useState<AudioProjectListItem | null>(null)
	const [groupSheetOpen, setGroupSheetOpen] = useState(false)
	const [moveGroupSheetOpen, setMoveGroupSheetOpen] = useState(false)
	const [moveTarget, setMoveTarget] = useState<AudioProjectListItem | null>(null)
	const [groups, setGroups] = useState<AudioRecordingGroup[]>([])
	const [totalGroupCount, setTotalGroupCount] = useState(0)
	const [ungroupedCount, setUngroupedCount] = useState(0)
	const [currentGroupId, setCurrentGroupId] = useState(ALL_RECORDING_GROUP_ID)
	const [groupsLoading, setGroupsLoading] = useState(false)
	const [groupActionSubmitting, setGroupActionSubmitting] = useState(false)

	const debouncedKeyword = useDebounce(searchKeyword, { wait: SEARCH_DEBOUNCE_MS })
	const activeFilterCount = useMemo(
		() => countActiveMobileAudioFilters(filterState, store.summaryFilter),
		[filterState, store.summaryFilter],
	)
	const currentGroupLabel = useMemo(() => {
		if (currentGroupId === ALL_RECORDING_GROUP_ID) return "all"
		if (currentGroupId === UNGROUPED_RECORDING_GROUP_ID) return "ungrouped"
		return groups.find((group) => group.id === currentGroupId)?.name ?? ""
	}, [currentGroupId, groups])
	const currentGroupCount = useMemo(() => {
		if (currentGroupId === ALL_RECORDING_GROUP_ID) return totalGroupCount
		if (currentGroupId === UNGROUPED_RECORDING_GROUP_ID) return ungroupedCount
		return groups.find((group) => group.id === currentGroupId)?.projectCount ?? 0
	}, [currentGroupId, groups, totalGroupCount, ungroupedCount])

	const refreshGroups = useCallback(async () => {
		setGroupsLoading(true)
		try {
			const result = await recordingGroupsService.listGroups()
			setGroups(result.groups)
			setTotalGroupCount(result.totalCount)
			setUngroupedCount(result.ungroupedCount)
			return true
		} catch {
			// Group metadata is secondary to the recording list; keep UI usable if it fails.
			return false
		} finally {
			setGroupsLoading(false)
		}
	}, [])

	/** Apply secondary filters (date + sort) to the store whenever sheet state changes */
	useEffect(() => {
		const range = resolveMobileDatePresetRange(filterState.datePreset)
		store.setDateRange(range.start, range.end)
		const { sortBy, sortOrder } = parseMobileSortOption(filterState.sortOption)
		store.setSort(sortBy, sortOrder)
	}, [store, filterState])

	/** Register poller on mount; tear down on unmount (fetch is driven by filter effect) */
	useEffect(() => {
		store.registerPollerCallbacks()
		void refreshGroups()
		return () => {
			store.disposePoller()
			store.reset()
		}
	}, [refreshGroups, store])

	/** Re-fetch page 1 when filters or debounced keyword change */
	useEffect(() => {
		if (isSearchComposing) return
		void store.fetchList({ page: 1, keyword: debouncedKeyword.trim() })
	}, [
		store,
		debouncedKeyword,
		isSearchComposing,
		store.summaryFilter,
		store.createdAtStart,
		store.createdAtEnd,
		store.sortBy,
		store.sortOrder,
		currentGroupId,
	])

	const handleRefresh = useCallback(async () => {
		// Pull-to-refresh should keep the list rows and group counters in sync for cross-entry changes.
		await Promise.all([
			store.fetchList({ page: 1, keyword: debouncedKeyword.trim() }),
			refreshGroups(),
		])
	}, [store, debouncedKeyword, refreshGroups])

	const handleLoadMore = useCallback(async () => {
		await store.loadMore()
	}, [store])

	const handleSummaryFilterChange = useCallback(
		(value: AudioRecordingSummaryFilter) => {
			store.setSummaryFilter(value)
		},
		[store],
	)

	const handleFilterStateChange = useCallback((next: MobileAudioRecordingsFilterState) => {
		setFilterState(next)
	}, [])

	const handleFilterReset = useCallback(() => {
		setFilterState(MOBILE_AUDIO_RECORDINGS_FILTER_DEFAULT)
	}, [])

	const handleOpenSearch = useCallback(() => {
		setSearchOpen(true)
	}, [])

	const handleDismissSearch = useCallback(() => {
		setSearchOpen(false)
		setSearchKeyword("")
		setIsSearchComposing(false)
	}, [])

	const handleOpenMore = useCallback((item: AudioProjectListItem) => {
		setMoreTarget(item)
	}, [])

	const handleCloseMore = useCallback(() => {
		setMoreTarget(null)
	}, [])

	const handleGroupChange = useCallback(
		(groupId: string) => {
			setCurrentGroupId(groupId)
			store.setWorkspaceId(groupId)
		},
		[store],
	)

	const handleCreateGroup = useCallback(
		async (name: string) => {
			setGroupActionSubmitting(true)
			try {
				const created = await recordingGroupsService.createGroup(name)
				handleGroupChange(created.id)
				await refreshGroups()
			} finally {
				setGroupActionSubmitting(false)
			}
		},
		[handleGroupChange, refreshGroups],
	)

	const handleRenameGroup = useCallback(
		async (id: string, name: string) => {
			setGroupActionSubmitting(true)
			try {
				await recordingGroupsService.renameGroup(id, name)
				await refreshGroups()
			} finally {
				setGroupActionSubmitting(false)
			}
		},
		[refreshGroups],
	)

	const handleDeleteGroup = useCallback(
		async (id: string) => {
			setGroupActionSubmitting(true)
			try {
				await recordingGroupsService.deleteGroup(id)
				if (currentGroupId === id) handleGroupChange(ALL_RECORDING_GROUP_ID)
				await refreshGroups()
				await store.fetchList({ page: 1, keyword: debouncedKeyword.trim() })
			} finally {
				setGroupActionSubmitting(false)
			}
		},
		[currentGroupId, debouncedKeyword, handleGroupChange, refreshGroups, store],
	)

	const handleOpenMoveGroup = useCallback((item: AudioProjectListItem) => {
		setMoveTarget(item)
		setMoveGroupSheetOpen(true)
	}, [])

	const handleMoveGroupChange = useCallback(
		async (targetGroupId: string) => {
			if (!moveTarget) return false
			setGroupActionSubmitting(true)
			try {
				await audioRecordingsService.batchMoveProjects([moveTarget.id], targetGroupId)
				await refreshGroups()
				await store.fetchList({ page: 1, keyword: debouncedKeyword.trim() })
				setMoveTarget(null)
				return true
			} catch {
				return false
			} finally {
				setGroupActionSubmitting(false)
			}
		},
		[debouncedKeyword, moveTarget, refreshGroups, store],
	)

	return {
		store,
		searchKeyword,
		setSearchKeyword,
		isSearchComposing,
		setIsSearchComposing,
		searchOpen,
		filterState,
		filterSheetOpen,
		setFilterSheetOpen,
		importSheetOpen,
		setImportSheetOpen,
		groupSheetOpen,
		setGroupSheetOpen,
		moveGroupSheetOpen,
		setMoveGroupSheetOpen,
		moveTarget,
		groups,
		totalGroupCount,
		ungroupedCount,
		currentGroupId,
		currentGroupLabel,
		currentGroupCount,
		groupsLoading,
		groupActionSubmitting,
		activeFilterCount,
		debouncedKeyword,
		moreTarget,
		handleRefresh,
		handleLoadMore,
		handleSummaryFilterChange,
		handleFilterStateChange,
		handleFilterReset,
		handleOpenSearch,
		handleDismissSearch,
		handleOpenMore,
		handleCloseMore,
		handleGroupChange,
		handleCreateGroup,
		handleRenameGroup,
		handleDeleteGroup,
		handleOpenMoveGroup,
		handleMoveGroupChange,
		refreshGroups,
	}
}
