import { useCallback, useEffect, useMemo, useState } from "react"
import { useDebounce } from "ahooks"
import type { AudioProjectListItem, AudioRecordingSummaryFilter } from "@/types/audioProject"
import { audioRecordingsStore } from "@/pages/superMagic/pages/AudioRecordings/stores/audio-recordings-store"
import {
	ALL_RECORDING_GROUP_ID,
	UNGROUPED_RECORDING_GROUP_ID,
} from "@/services/audioRecordings/RecordingGroupsConstants"
import { audioRecordingsService } from "@/services/audioRecordings/AudioRecordingsService"
import {
	recordingGroupsService,
	type AudioRecordingGroup,
} from "@/services/audioRecordings/RecordingGroupsService"
import { resolveMobileDatePresetRange } from "../utils/mobile-recording-date-filter"
import {
	countActiveMobileAudioFilters,
	MOBILE_AUDIO_RECORDINGS_FILTER_DEFAULT,
	parseMobileSortOption,
	type MobileAudioRecordingsFilterState,
} from "../types"
import { registerAudioRecordingsShellRefreshHandler } from "@/pages/superMagic/pages/AudioRecordings/utils/request-audio-recordings-shell-refresh"
import {
	patchAudioRecordingsFilterSession,
	readAudioRecordingsFilterSession,
	resolveMobileAudioRecordingsSortOption,
} from "@/pages/superMagic/pages/AudioRecordings/utils/audio-recordings-filter-session"

const SEARCH_DEBOUNCE_MS = 300

/**
 * Binds mobile recording list UI to a global shared AudioRecordingsStore instance.
 * Mirrors PC desktop lifecycle: register poller on mount, reset on unmount.
 */
export function useMobileAudioRecordingsList() {
	const store = audioRecordingsStore
	const [initialFilterSession] = useState(() => readAudioRecordingsFilterSession())

	const [searchKeyword, setSearchKeywordState] = useState(initialFilterSession.searchKeyword)
	const [isSearchComposing, setIsSearchComposing] = useState(false)
	const [searchOpen, setSearchOpen] = useState(
		() => initialFilterSession.searchKeyword.trim().length > 0,
	)
	const [filterState, setFilterState] = useState<MobileAudioRecordingsFilterState>(() => ({
		datePreset: initialFilterSession.datePreset,
		sortOption: resolveMobileAudioRecordingsSortOption(initialFilterSession),
	}))
	const [hasHydratedFilters, setHasHydratedFilters] = useState(false)
	const [filterSheetOpen, setFilterSheetOpen] = useState(false)
	const [importSheetOpen, setImportSheetOpen] = useState(false)
	const [moreTarget, setMoreTarget] = useState<AudioProjectListItem | null>(null)
	const [groupSheetOpen, setGroupSheetOpen] = useState(false)
	const [moveGroupSheetOpen, setMoveGroupSheetOpen] = useState(false)
	const [moveTarget, setMoveTarget] = useState<AudioProjectListItem | null>(null)
	const [groups, setGroups] = useState<AudioRecordingGroup[]>([])
	const [totalGroupCount, setTotalGroupCount] = useState(0)
	const [ungroupedCount, setUngroupedCount] = useState(0)
	const [currentGroupId, setCurrentGroupId] = useState(initialFilterSession.groupId)
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

	// Restore shared query filters before the first mobile list fetch is allowed to run.
	useEffect(() => {
		store.hydrateFiltersFromSession(initialFilterSession)
		setHasHydratedFilters(true)
	}, [store, initialFilterSession])

	/** Apply secondary filters (date + sort) to the store whenever sheet state changes */
	useEffect(() => {
		if (!hasHydratedFilters) return
		const range = resolveMobileDatePresetRange(filterState.datePreset)
		store.setDateRange(range.start, range.end)
		const { sortBy, sortOrder } = parseMobileSortOption(filterState.sortOption)
		store.setSort(sortBy, sortOrder)
	}, [store, filterState, hasHydratedFilters])

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
		if (!hasHydratedFilters) return
		if (isSearchComposing) return
		void store.fetchList({ page: 1, keyword: debouncedKeyword.trim() })
	}, [
		store,
		hasHydratedFilters,
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
		if (!hasHydratedFilters) return
		// Pull-to-refresh should keep the list rows and group counters in sync for cross-entry changes.
		await Promise.all([
			store.fetchList({ page: 1, keyword: debouncedKeyword.trim() }),
			refreshGroups(),
		])
	}, [store, debouncedKeyword, refreshGroups, hasHydratedFilters])

	useEffect(() => {
		return registerAudioRecordingsShellRefreshHandler(handleRefresh)
	}, [handleRefresh])

	const handleLoadMore = useCallback(async () => {
		await store.loadMore()
	}, [store])

	/** Applies the mobile summary tab and keeps the shared session snapshot in sync. */
	const handleSummaryFilterChange = useCallback(
		(value: AudioRecordingSummaryFilter) => {
			store.setSummaryFilter(value)
			patchAudioRecordingsFilterSession({ summaryFilter: value })
		},
		[store],
	)

	/** Converts mobile sheet state into shared API filter fields before persisting. */
	const handleFilterStateChange = useCallback((next: MobileAudioRecordingsFilterState) => {
		setFilterState(next)
		const { sortBy, sortOrder } = parseMobileSortOption(next.sortOption)
		patchAudioRecordingsFilterSession({
			datePreset: next.datePreset,
			sortBy,
			sortOrder,
		})
	}, [])

	/** Resets only query filters owned by the mobile filter sheet, leaving transient UI state alone. */
	const handleFilterReset = useCallback(() => {
		setFilterState(MOBILE_AUDIO_RECORDINGS_FILTER_DEFAULT)
		const { sortBy, sortOrder } = parseMobileSortOption(
			MOBILE_AUDIO_RECORDINGS_FILTER_DEFAULT.sortOption,
		)
		patchAudioRecordingsFilterSession({
			datePreset: MOBILE_AUDIO_RECORDINGS_FILTER_DEFAULT.datePreset,
			sortBy,
			sortOrder,
		})
	}, [])

	/** Persists search text while leaving the existing debounced request timing unchanged. */
	const handleSearchKeywordChange = useCallback((value: string) => {
		setSearchKeywordState(value)
		patchAudioRecordingsFilterSession({ searchKeyword: value })
	}, [])

	const handleOpenSearch = useCallback(() => {
		setSearchOpen(true)
	}, [])

	const handleDismissSearch = useCallback(() => {
		setSearchOpen(false)
		handleSearchKeywordChange("")
		setIsSearchComposing(false)
	}, [handleSearchKeywordChange])

	const handleOpenMore = useCallback((item: AudioProjectListItem) => {
		setMoreTarget(item)
	}, [])

	const handleCloseMore = useCallback(() => {
		setMoreTarget(null)
	}, [])

	/** Persists group selection so PC and H5 reopen with the same workspace filter. */
	const handleGroupChange = useCallback(
		(groupId: string) => {
			setCurrentGroupId(groupId)
			store.setWorkspaceId(groupId)
			patchAudioRecordingsFilterSession({ groupId })
		},
		[store],
	)

	const handleCreateGroup = useCallback(
		async (name: string) => {
			setGroupActionSubmitting(true)
			try {
				// Refresh group list only; keep the current filter selection unchanged.
				await recordingGroupsService.createGroup(name)
				await refreshGroups()
			} finally {
				setGroupActionSubmitting(false)
			}
		},
		[refreshGroups],
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
		setSearchKeyword: handleSearchKeywordChange,
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
