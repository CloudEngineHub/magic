import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useDebounce } from "ahooks"
import type { AudioProjectListItem, AudioRecordingSummaryFilter } from "@/types/audioProject"
import { AudioRecordingsStore } from "@/pages/superMagic/pages/AudioRecordings/stores/audio-recordings-store"
import { resolveMobileDatePresetRange } from "../utils/mobile-recording-date-filter"
import {
	countActiveMobileAudioFilters,
	MOBILE_AUDIO_RECORDINGS_FILTER_DEFAULT,
	parseMobileSortOption,
	type MobileAudioRecordingsFilterState,
} from "../types"

const SEARCH_DEBOUNCE_MS = 300

/**
 * Binds mobile recording list UI to a page-scoped AudioRecordingsStore instance.
 * Mirrors PC desktop lifecycle: register poller on mount, reset on unmount.
 */
export function useMobileAudioRecordingsList() {
	const storeRef = useRef(new AudioRecordingsStore())
	const store = storeRef.current

	const [searchKeyword, setSearchKeyword] = useState("")
	const [isSearchComposing, setIsSearchComposing] = useState(false)
	const [searchOpen, setSearchOpen] = useState(false)
	const [filterState, setFilterState] = useState<MobileAudioRecordingsFilterState>(
		MOBILE_AUDIO_RECORDINGS_FILTER_DEFAULT,
	)
	const [filterSheetOpen, setFilterSheetOpen] = useState(false)
	const [summarySheetOpen, setSummarySheetOpen] = useState(false)
	const [importSheetOpen, setImportSheetOpen] = useState(false)
	const [moreTarget, setMoreTarget] = useState<AudioProjectListItem | null>(null)

	const debouncedKeyword = useDebounce(searchKeyword, { wait: SEARCH_DEBOUNCE_MS })
	const activeFilterCount = useMemo(
		() => countActiveMobileAudioFilters(filterState),
		[filterState],
	)

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
		return () => {
			store.disposePoller()
			store.reset()
		}
	}, [store])

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
	])

	const handleRefresh = useCallback(async () => {
		await store.fetchList({ page: 1, keyword: debouncedKeyword.trim() })
	}, [store, debouncedKeyword])

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
		summarySheetOpen,
		setSummarySheetOpen,
		importSheetOpen,
		setImportSheetOpen,
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
	}
}
