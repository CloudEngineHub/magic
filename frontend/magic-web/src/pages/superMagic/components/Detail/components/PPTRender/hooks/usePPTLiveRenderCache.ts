import { useCallback, useLayoutEffect, useMemo, useRef, useState } from "react"
import type { SlideItem } from "../PPTSidebar/types"

export interface LiveRenderSlide {
	slide: SlideItem
	index: number
	key: string
	revision: string
}

interface ReconcileResidentSlideKeysOptions {
	previousKeys: string[]
	availableKeys: Set<string>
	activeKey: string | null
	presentedKey: string | null
	neighborKeys: string[]
	pinnedKeys: string[]
	recentKeys: string[]
	capacity: number
}

interface UsePPTLiveRenderCacheOptions {
	slides: SlideItem[]
	activeIndex: number
	capacity: number
	neighborRadius: number
	scopeKey?: string
	pinnedKeys?: string[]
}

interface UsePPTLiveRenderCacheResult {
	residentSlides: LiveRenderSlide[]
	presentedKey: string | null
	pendingKey: string | null
	warmSlideIndices: number[]
	onSlideReadyChange: (key: string, revision: string, ready: boolean) => void
}

function appendUnique(target: string[], values: Array<string | null | undefined>): void {
	values.forEach((value) => {
		if (value && !target.includes(value)) target.push(value)
	})
}

export function getLiveRenderSlideKey(slide: SlideItem): string {
	return `${slide.path || "missing-path"}::${slide.id || "missing-id"}`
}

/**
 * A revision change means the existing iframe no longer represents the current slide content.
 * lastLoadedAt is updated by every load/refresh/save path; the remaining fields cover terminal
 * loading-state changes and test/legacy slide objects without a timestamp.
 */
export function getLiveRenderSlideRevision(slide: SlideItem): string {
	return [
		slide.path,
		slide.loadingState || "idle",
		slide.lastLoadedAt || 0,
		slide.rawContent?.length || 0,
		slide.content?.length || 0,
	].join(":")
}

/**
 * Reconcile a bounded resident set while preserving the DOM order of retained iframe nodes.
 * During a cold transition the old presented page is pinned until the target is ready, so the
 * result may temporarily exceed the configured capacity by one entry.
 */
export function reconcileResidentSlideKeys({
	previousKeys,
	availableKeys,
	activeKey,
	presentedKey,
	neighborKeys,
	pinnedKeys,
	recentKeys,
	capacity,
}: ReconcileResidentSlideKeysOptions): string[] {
	const protectedKeys: string[] = []
	appendUnique(protectedKeys, [presentedKey, activeKey, ...pinnedKeys])
	const validProtectedKeys = protectedKeys.filter((key) => availableKeys.has(key))
	const isColdTransition = Boolean(presentedKey && activeKey && presentedKey !== activeKey)
	const targetCapacity = Math.max(
		1,
		Math.floor(capacity) + (isColdTransition ? 1 : 0),
		validProtectedKeys.length,
	)

	const prioritizedKeys = [...validProtectedKeys]
	appendUnique(prioritizedKeys, neighborKeys)
	appendUnique(prioritizedKeys, recentKeys)
	appendUnique(prioritizedKeys, previousKeys)

	const selectedKeys = prioritizedKeys
		.filter((key) => availableKeys.has(key))
		.slice(0, targetCapacity)
	const selectedKeySet = new Set(selectedKeys)

	// Keeping retained keys in their existing order prevents React from moving live iframe DOM nodes.
	const nextKeys = previousKeys.filter((key) => selectedKeySet.has(key))
	appendUnique(nextKeys, selectedKeys)
	return nextKeys
}

function arraysEqual(left: string[], right: string[]): boolean {
	return left.length === right.length && left.every((value, index) => value === right[index])
}

/**
 * Keeps a small, keyed set of real slide renderers mounted. Cached slides preserve their iframe
 * browsing context; cold targets render hidden and replace the previous page only after ready.
 */
export function usePPTLiveRenderCache({
	slides,
	activeIndex,
	capacity,
	neighborRadius,
	scopeKey = "default",
	pinnedKeys = [],
}: UsePPTLiveRenderCacheOptions): UsePPTLiveRenderCacheResult {
	const getScopedKey = (slide: SlideItem) => `${scopeKey}::${getLiveRenderSlideKey(slide)}`
	const entriesSignature = slides
		.map((slide) => `${getScopedKey(slide)}@${getLiveRenderSlideRevision(slide)}`)
		.join("|")
	const entriesCacheRef = useRef<{ signature: string; entries: LiveRenderSlide[] } | null>(null)
	if (!entriesCacheRef.current || entriesCacheRef.current.signature !== entriesSignature) {
		entriesCacheRef.current = {
			signature: entriesSignature,
			entries: slides.map<LiveRenderSlide>((slide, index) => ({
				slide,
				index,
				key: getScopedKey(slide),
				revision: getLiveRenderSlideRevision(slide),
			})),
		}
	} else {
		entriesCacheRef.current.entries.forEach((entry, index) => {
			entry.slide = slides[index]
			entry.index = index
		})
	}
	const entries = entriesCacheRef.current.entries
	const entriesByKey = useMemo(
		() => new Map(entries.map((entry) => [entry.key, entry])),
		[entries],
	)
	const activeEntry = entries[activeIndex]
	const activeKey = activeEntry?.key || null
	const neighborEntries = useMemo(() => {
		const result: LiveRenderSlide[] = []
		for (let distance = 1; distance <= neighborRadius; distance++) {
			const nextEntry = entries[activeIndex + distance]
			const previousEntry = entries[activeIndex - distance]
			if (nextEntry) result.push(nextEntry)
			if (previousEntry) result.push(previousEntry)
		}
		return result
	}, [activeIndex, entries, neighborRadius])
	const neighborKeys = useMemo(() => neighborEntries.map((entry) => entry.key), [neighborEntries])
	const warmSlideIndices = useMemo(
		() => neighborEntries.map((entry) => entry.index),
		[neighborEntries],
	)
	const [residentKeys, setResidentKeys] = useState<string[]>([])
	const [presentedKey, setPresentedKey] = useState<string | null>(null)
	const readyRevisionByKeyRef = useRef(new Map<string, string>())
	const recentKeysRef = useRef<string[]>([])
	const entriesByKeyRef = useRef(entriesByKey)
	const residentKeysRef = useRef(residentKeys)
	const activeKeyRef = useRef(activeKey)

	entriesByKeyRef.current = entriesByKey
	residentKeysRef.current = residentKeys
	activeKeyRef.current = activeKey

	useLayoutEffect(() => {
		const availableKeys = new Set(entriesByKey.keys())

		readyRevisionByKeyRef.current.forEach((revision, key) => {
			const entry = entriesByKey.get(key)
			if (!entry || entry.revision !== revision) {
				readyRevisionByKeyRef.current.delete(key)
			}
		})

		if (activeKey) {
			recentKeysRef.current = [
				activeKey,
				...recentKeysRef.current.filter(
					(key) => key !== activeKey && availableKeys.has(key),
				),
			]
		}

		let nextPresentedKey = presentedKey
		if (!nextPresentedKey || !availableKeys.has(nextPresentedKey)) {
			nextPresentedKey = activeKey
		} else if (
			activeEntry &&
			residentKeys.includes(activeEntry.key) &&
			readyRevisionByKeyRef.current.get(activeEntry.key) === activeEntry.revision
		) {
			nextPresentedKey = activeEntry.key
		}

		const nextResidentKeys = reconcileResidentSlideKeys({
			previousKeys: residentKeys,
			availableKeys,
			activeKey,
			presentedKey: nextPresentedKey,
			neighborKeys,
			pinnedKeys: pinnedKeys.map((key) => `${scopeKey}::${key}`),
			recentKeys: recentKeysRef.current,
			capacity,
		})
		const nextResidentKeySet = new Set(nextResidentKeys)
		readyRevisionByKeyRef.current.forEach((_revision, key) => {
			if (!nextResidentKeySet.has(key)) readyRevisionByKeyRef.current.delete(key)
		})

		if (nextPresentedKey !== presentedKey) setPresentedKey(nextPresentedKey)
		if (!arraysEqual(nextResidentKeys, residentKeys)) setResidentKeys(nextResidentKeys)
	}, [
		activeEntry,
		activeKey,
		capacity,
		entriesByKey,
		neighborKeys,
		pinnedKeys,
		presentedKey,
		residentKeys,
		scopeKey,
	])

	const onSlideReadyChange = useCallback((key: string, revision: string, ready: boolean) => {
		const currentEntry = entriesByKeyRef.current.get(key)
		if (
			!currentEntry ||
			currentEntry.revision !== revision ||
			!residentKeysRef.current.includes(key)
		) {
			return
		}

		if (!ready) {
			readyRevisionByKeyRef.current.delete(key)
			return
		}

		readyRevisionByKeyRef.current.set(key, revision)
		if (activeKeyRef.current === key) setPresentedKey(key)
	}, [])

	return {
		residentSlides: residentKeys
			.map((key) => entriesByKey.get(key))
			.filter((entry): entry is LiveRenderSlide => Boolean(entry)),
		presentedKey,
		pendingKey: activeKey && activeKey !== presentedKey ? activeKey : null,
		warmSlideIndices,
		onSlideReadyChange,
	}
}
