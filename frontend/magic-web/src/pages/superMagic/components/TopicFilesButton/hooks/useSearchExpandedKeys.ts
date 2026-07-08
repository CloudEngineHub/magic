import { useCallback, useEffect, useRef, useState, type Key } from "react"
import { useDebounceFn } from "ahooks"
import { finishSearchExpandDebounce, startSearchExpandDebounce } from "./useTopicFilesPerf"

const SEARCH_EXPAND_DEBOUNCE_MS = 300

interface UseSearchExpandedKeysOptions {
	searchValue: string
	matchedItemPaths: string[]
}

export function useSearchExpandedKeys({
	searchValue,
	matchedItemPaths,
}: UseSearchExpandedKeysOptions) {
	// Keep search-expanded keys separate from the user's manual expanded state.
	const [searchExpandedKeys, setSearchExpandedKeys] = useState<Key[]>([])
	const prevSearchValueRef = useRef<string>()
	const matchedItemPathsRef = useRef<string[]>([])
	const searchExpandDebounceStartedAtRef = useRef(0)

	matchedItemPathsRef.current = matchedItemPaths

	const { run: debouncedUpdateSearchKeys, cancel: cancelSearchExpandDebounce } = useDebounceFn(
		(paths: string[]) => {
			// Debounce bulk expansion because many matches can be costly.
			setSearchExpandedKeys(paths)
			finishSearchExpandDebounce(searchExpandDebounceStartedAtRef.current, {
				matched_parent_paths_count: paths.length,
				debounce_wait_ms: SEARCH_EXPAND_DEBOUNCE_MS,
			})
			searchExpandDebounceStartedAtRef.current = 0
		},
		{ wait: SEARCH_EXPAND_DEBOUNCE_MS },
	)

	const resetSearchExpandedKeys = useCallback(() => {
		// Cancel pending expansion when search clears or the project changes.
		cancelSearchExpandDebounce()
		searchExpandDebounceStartedAtRef.current = 0
		setSearchExpandedKeys([])
	}, [cancelSearchExpandDebounce])

	useEffect(() => {
		return () => {
			cancelSearchExpandDebounce()
		}
	}, [cancelSearchExpandDebounce])

	useEffect(() => {
		if (searchValue === prevSearchValueRef.current) return
		prevSearchValueRef.current = searchValue

		// matchedItemPaths changes often; expand only when the search term changes.
		if (searchValue && matchedItemPathsRef.current.length > 0) {
			searchExpandDebounceStartedAtRef.current = startSearchExpandDebounce({
				matched_parent_paths_count: matchedItemPathsRef.current.length,
				debounce_wait_ms: SEARCH_EXPAND_DEBOUNCE_MS,
			})
			debouncedUpdateSearchKeys(matchedItemPathsRef.current)
			return
		}

		resetSearchExpandedKeys()
	}, [debouncedUpdateSearchKeys, resetSearchExpandedKeys, searchValue])

	return {
		searchExpandedKeys,
		setSearchExpandedKeys,
		resetSearchExpandedKeys,
	}
}
