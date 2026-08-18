/** Normalizes a search query without changing meaningful whitespace inside it. */
export function normalizeMobileRecordingSearchQuery(query: string): string {
	return query.trim()
}

/** Returns the literal, case-insensitive match ranges for one text node. */
export function findMobileRecordingTextNodeMatches(
	node: Text,
	query: string,
): Array<{ start: number; end: number }> {
	const normalizedQuery = normalizeMobileRecordingSearchQuery(query)
	if (!normalizedQuery) return []

	const text = node.data
	const comparableText = text.toLocaleLowerCase()
	const comparableQuery = normalizedQuery.toLocaleLowerCase()
	const matches: Array<{ start: number; end: number }> = []
	let cursor = 0

	while (cursor <= comparableText.length - comparableQuery.length) {
		const index = comparableText.indexOf(comparableQuery, cursor)
		if (index < 0) break
		matches.push({ start: index, end: index + comparableQuery.length })
		// Advance by the query length so overlapping hits are counted once.
		cursor = index + comparableQuery.length
	}

	return matches
}

/** Checks whether a text node belongs to controls that must stay outside the search scope. */
export function isExcludedMobileRecordingSearchNode(node: Text): boolean {
	const parent = node.parentElement
	if (!parent) return true
	if (parent.closest("[data-search-exclude='true']")) return true
	const tagName = parent.tagName.toLowerCase()
	return ["script", "style", "textarea", "input"].includes(tagName)
}

/**
 * Centers one search range inside the recording detail's dedicated scroll port.
 * Avoiding Element.scrollIntoView keeps fixed page ancestors out of the scroll chain,
 * which prevents mobile WebViews from trapping subsequent touch scrolling.
 */
export function scrollMobileRecordingSearchRangeIntoView(
	range: Range,
	scope: HTMLElement,
	behavior: ScrollBehavior,
): void {
	// Search scopes are rendered as direct children of the sole ScrollEdgeFade scroll port.
	const scrollPort = scope.parentElement
	const rangeParent = range.startContainer.parentElement
	if (!scrollPort || !rangeParent) return

	const rangeRect = range.getBoundingClientRect()
	const fallbackRect = rangeParent.getBoundingClientRect()
	const targetRect = rangeRect.width > 0 || rangeRect.height > 0 ? rangeRect : fallbackRect
	const scrollPortRect = scrollPort.getBoundingClientRect()
	const centeredTop =
		scrollPort.scrollTop +
		targetRect.top -
		scrollPortRect.top -
		Math.max(0, (scrollPort.clientHeight - targetRect.height) / 2)
	const maxScrollTop = Math.max(0, scrollPort.scrollHeight - scrollPort.clientHeight)
	const nextScrollTop = Math.min(maxScrollTop, Math.max(0, centeredTop))

	if (typeof scrollPort.scrollTo === "function") {
		scrollPort.scrollTo({ top: nextScrollTop, behavior })
		return
	}

	// Keep older embedded WebViews functional when Element.scrollTo is unavailable.
	scrollPort.scrollTop = nextScrollTop
}
