import { useCallback, useEffect, useRef, useState, type RefObject } from "react"
import {
	findMobileRecordingTextNodeMatches,
	isExcludedMobileRecordingSearchNode,
	normalizeMobileRecordingSearchQuery,
	scrollMobileRecordingSearchRangeIntoView,
} from "../utils/content-search"

interface SearchMatch {
	range: Range
}

interface UseMobileRecordingContentSearchOptions {
	scopeRef: RefObject<HTMLElement | null>
	enabled: boolean
	contentKey?: string | number
}

interface UseMobileRecordingContentSearchResult {
	currentIndex: number
	totalMatches: number
	isSupported: boolean
	goToPrevious: () => void
	goToNext: () => void
}

const SEARCH_HIGHLIGHT_NAME = "mobile-recording-search"
const CURRENT_SEARCH_HIGHLIGHT_NAME = "mobile-recording-search-current"

/** Uses the native text selection as a current-match fallback in older mobile WebViews. */
function selectFallbackSearchRange(range?: Range) {
	const selection = window.getSelection()
	if (!selection) return
	selection.removeAllRanges()
	if (range) selection.addRange(range.cloneRange())
}

/** Scans rendered mobile recording content and keeps literal search highlights synchronized. */
export function useMobileRecordingContentSearch(
	query: string,
	{ scopeRef, enabled, contentKey }: UseMobileRecordingContentSearchOptions,
): UseMobileRecordingContentSearchResult {
	const [matches, setMatches] = useState<SearchMatch[]>([])
	const [currentIndex, setCurrentIndex] = useState(0)
	const matchesRef = useRef<SearchMatch[]>([])
	const currentIndexRef = useRef(0)
	const fallbackSelectionActiveRef = useRef(false)
	const positionedSearchRef = useRef<{ query: string; scope: HTMLElement } | null>(null)
	const normalizedQuery = normalizeMobileRecordingSearchQuery(query)
	const isSupported = enabled && normalizedQuery.length > 0

	const clearHighlights = useCallback(() => {
		if (typeof CSS === "undefined" || !("highlights" in CSS)) {
			if (fallbackSelectionActiveRef.current) selectFallbackSearchRange()
			fallbackSelectionActiveRef.current = false
			return
		}
		CSS.highlights.delete(SEARCH_HIGHLIGHT_NAME)
		CSS.highlights.delete(CURRENT_SEARCH_HIGHLIGHT_NAME)
	}, [])

	const applyHighlights = useCallback((nextMatches: SearchMatch[], nextCurrentIndex: number) => {
		const currentRange = nextMatches[nextCurrentIndex]?.range
		if (typeof CSS === "undefined" || !("highlights" in CSS)) {
			fallbackSelectionActiveRef.current = Boolean(currentRange)
			selectFallbackSearchRange(currentRange)
			return
		}
		const allRanges = nextMatches.map((match) => match.range)
		// eslint-disable-next-line compat/compat -- Older WebViews use the native selection fallback above.
		CSS.highlights.set(SEARCH_HIGHLIGHT_NAME, new Highlight(...allRanges))
		if (currentRange) {
			CSS.highlights.set(CURRENT_SEARCH_HIGHLIGHT_NAME, new Highlight(currentRange))
		}
	}, [])

	useEffect(() => {
		let frameId = 0
		let observer: MutationObserver | undefined
		clearHighlights()
		matchesRef.current = []
		setMatches([])
		currentIndexRef.current = 0
		setCurrentIndex(0)

		if (!isSupported) {
			positionedSearchRef.current = null
			return undefined
		}

		/** Rebuilds ranges while preserving navigation and manual scroll after the initial positioning. */
		function scanRenderedContent() {
			const scope = scopeRef.current
			if (!scope) return
			const walker = document.createTreeWalker(scope, NodeFilter.SHOW_TEXT)
			const nextMatches: SearchMatch[] = []
			let node: Node | null
			while ((node = walker.nextNode())) {
				if (!(node instanceof Text) || isExcludedMobileRecordingSearchNode(node)) continue
				for (const match of findMobileRecordingTextNodeMatches(node, normalizedQuery)) {
					const range = document.createRange()
					range.setStart(node, match.start)
					range.setEnd(node, match.end)
					nextMatches.push({ range })
				}
			}
			const nextCurrentIndex = Math.min(
				currentIndexRef.current,
				Math.max(0, nextMatches.length - 1),
			)
			matchesRef.current = nextMatches
			currentIndexRef.current = nextCurrentIndex
			setMatches(nextMatches)
			setCurrentIndex(nextCurrentIndex)
			applyHighlights(nextMatches, nextCurrentIndex)

			const positionedSearch = positionedSearchRef.current
			const shouldPositionInitialMatch =
				positionedSearch?.query !== normalizedQuery || positionedSearch.scope !== scope
			if (shouldPositionInitialMatch && nextMatches[0]) {
				// Position only once per query and rendered panel; observer refreshes must not undo user scroll.
				scrollMobileRecordingSearchRangeIntoView(nextMatches[0].range, scope, "auto")
				positionedSearchRef.current = { query: normalizedQuery, scope }
			}
		}

		/** Coalesces React and async markdown DOM updates into one range scan per frame. */
		function scheduleScan() {
			cancelAnimationFrame(frameId)
			frameId = requestAnimationFrame(scanRenderedContent)
		}

		// Observe child/text changes so mindmap text mode and async markdown updates are searchable.
		const scope = scopeRef.current
		if (scope && typeof MutationObserver !== "undefined") {
			observer = new MutationObserver(scheduleScan)
			observer.observe(scope, { childList: true, characterData: true, subtree: true })
		}
		scheduleScan()

		return () => {
			observer?.disconnect()
			cancelAnimationFrame(frameId)
			clearHighlights()
		}
	}, [applyHighlights, clearHighlights, contentKey, isSupported, normalizedQuery, scopeRef])

	useEffect(() => {
		applyHighlights(matches, currentIndex)
	}, [applyHighlights, currentIndex, matches])

	const moveTo = useCallback(
		(direction: -1 | 1) => {
			const currentMatches = matchesRef.current
			if (currentMatches.length === 0) return
			const nextIndex =
				(currentIndexRef.current + direction + currentMatches.length) %
				currentMatches.length
			currentIndexRef.current = nextIndex
			setCurrentIndex(nextIndex)
			const scope = scopeRef.current
			if (scope && currentMatches[nextIndex]) {
				// Keep navigation immediate so a pending smooth-scroll animation never blocks touch scrolling.
				scrollMobileRecordingSearchRangeIntoView(
					currentMatches[nextIndex].range,
					scope,
					"auto",
				)
			}
		},
		[scopeRef],
	)
	const goToPrevious = useCallback(() => moveTo(-1), [moveTo])
	const goToNext = useCallback(() => moveTo(1), [moveTo])

	return {
		currentIndex: matches.length > 0 ? currentIndex + 1 : 0,
		totalMatches: matches.length,
		isSupported,
		goToPrevious,
		goToNext,
	}
}
