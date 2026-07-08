import { useCallback, useEffect, useRef, useState } from "react"
import { useDebounceFn } from "ahooks"
import {
	finishSearchInputToVisible,
	recordSearchDebounceDropped,
	recordSearchInputStarted,
} from "./useTopicFilesPerf"

export const TOPIC_FILES_SEARCH_DEBOUNCE_MS = 300

interface UseDebouncedSearchValueOptions {
	source: string
	wait?: number
}

export function useDebouncedSearchValue({
	source,
	wait = TOPIC_FILES_SEARCH_DEBOUNCE_MS,
}: UseDebouncedSearchValueOptions) {
	// rawSearchValue mirrors input; debouncedSearchValue drives tree filtering.
	const [rawSearchValue, setRawSearchValue] = useState("")
	const [debouncedSearchValue, setDebouncedSearchValue] = useState("")
	// Track pending debounce work so overwritten inputs can be counted.
	const hasPendingDebounceRef = useRef(false)

	const { run: updateDebouncedSearchValue, cancel: cancelDebouncedSearchValue } = useDebounceFn(
		(value: string) => {
			hasPendingDebounceRef.current = false
			setDebouncedSearchValue(value)
		},
		{ wait },
	)

	useEffect(() => {
		return () => {
			cancelDebouncedSearchValue()
		}
	}, [cancelDebouncedSearchValue])

	const updateSearchValue = useCallback(
		(value: string) => {
			setRawSearchValue(value)

			// Sync immediately when clearing search to avoid stale results.
			if (!value.trim()) {
				cancelDebouncedSearchValue()
				hasPendingDebounceRef.current = false
				setDebouncedSearchValue("")
				finishSearchInputToVisible({ source, reason: "search_cleared" })
				return
			}

			if (hasPendingDebounceRef.current) {
				recordSearchDebounceDropped({
					source,
					searchValueLength: value.length,
					debounceWaitMs: wait,
				})
			}

			recordSearchInputStarted({
				source,
				searchValueLength: value.length,
				debounceWaitMs: wait,
			})
			hasPendingDebounceRef.current = true
			updateDebouncedSearchValue(value)
		},
		[cancelDebouncedSearchValue, source, updateDebouncedSearchValue, wait],
	)

	const commitSearchValue = useCallback(
		(value: string) => {
			// Commit the final IME value immediately to avoid the extra debounce delay.
			cancelDebouncedSearchValue()
			hasPendingDebounceRef.current = false
			setRawSearchValue(value)
			setDebouncedSearchValue(value)

			if (value.trim()) {
				recordSearchInputStarted({
					source,
					searchValueLength: value.length,
					debounceWaitMs: 0,
					reason: "composition_end",
				})
				return
			}

			finishSearchInputToVisible({ source, reason: "search_committed_empty" })
		},
		[cancelDebouncedSearchValue, source],
	)

	const resetSearchValue = useCallback(() => {
		// Cancel pending work when leaving search mode to avoid stale writes.
		cancelDebouncedSearchValue()
		hasPendingDebounceRef.current = false
		setRawSearchValue("")
		setDebouncedSearchValue("")
		finishSearchInputToVisible({ source, reason: "search_closed" })
	}, [cancelDebouncedSearchValue, source])

	return {
		rawSearchValue,
		debouncedSearchValue,
		updateSearchValue,
		commitSearchValue,
		resetSearchValue,
	}
}
