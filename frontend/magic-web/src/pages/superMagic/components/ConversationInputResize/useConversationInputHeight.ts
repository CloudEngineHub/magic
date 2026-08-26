import {
	useCallback,
	useEffect,
	useLayoutEffect,
	useMemo,
	useRef,
	useState,
	type RefObject,
} from "react"
import { interfaceStore } from "@/stores/interface"
import type {
	ChatInputHeightMode,
	ConversationInputHeightController,
	ChatInputHeightPreference,
} from "./types"

const DEFAULT_MIN_HEIGHT = 200
const DEFAULT_MAX_RATIO = 0.5
const ACCESSORY_SELECTOR = "[data-conversation-input-accessory]"

interface UseConversationInputHeightOptions {
	scope: string
	/** Identifies the employee/mode layout whose current height should be preserved. */
	layoutKey?: string
	enabled: boolean
	containerRef: RefObject<HTMLDivElement | null>
	availableRef: RefObject<HTMLDivElement | null>
	minHeight?: number
	maxRatio?: number
	manualMaxRatio?: number
	manualMinAvailableHeight?: number
}

/** Keep numeric resize values safe before they are applied to a controlled layout. */
function isValidHeight(value: unknown): value is number {
	return typeof value === "number" && Number.isFinite(value) && value > 0
}

/** Clamp a requested height to the current conversation layout bounds. */
function clampHeight(value: number, minHeight: number, maxHeight: number) {
	const safeValue = isValidHeight(value) ? value : minHeight
	const safeMaxHeight = Math.max(minHeight, maxHeight)
	return Math.min(Math.max(safeValue, minHeight), safeMaxHeight)
}

/** Calculate a height ceiling from both a proportional limit and reserved content space. */
function getMaxHeight(
	availableHeight: number,
	minHeight: number,
	ratio: number,
	reservedHeight = 0,
) {
	const ratioLimit = availableHeight * ratio || minHeight
	const reservedSpaceLimit = availableHeight - reservedHeight
	return Math.max(minHeight, Math.min(ratioLimit, reservedSpaceLimit))
}

/** Estimate content height when an inner editor is already scrolling inside a fixed outer panel. */
function measureNaturalHeight(container: HTMLDivElement) {
	const baseHeight = Math.max(container.offsetHeight, container.scrollHeight)
	const scrollableDescendants = Array.from(container.querySelectorAll<HTMLElement>("*"))
	let overflowHeight = 0

	for (const element of scrollableDescendants) {
		const styles = window.getComputedStyle(element)
		if (!/(auto|scroll)/.test(styles.overflowY)) continue
		if (element.scrollHeight <= element.clientHeight) continue
		overflowHeight = Math.max(overflowHeight, element.scrollHeight - element.clientHeight)
	}

	return baseHeight + overflowHeight
}

/** Measure only fixed task/queue chrome so manual editor height remains user-controlled. */
function measureAccessoryHeight(container: HTMLDivElement) {
	return Array.from(container.querySelectorAll<HTMLElement>(ACCESSORY_SELECTOR)).reduce(
		(total, element) => total + Math.ceil(element.getBoundingClientRect().height),
		0,
	)
}

/** Manage automatic growth, manual override, and scoped persistence for a conversation input. */
export function useConversationInputHeight({
	scope,
	layoutKey,
	enabled,
	containerRef,
	availableRef,
	minHeight = DEFAULT_MIN_HEIGHT,
	maxRatio = DEFAULT_MAX_RATIO,
	manualMaxRatio = maxRatio,
	manualMinAvailableHeight = 0,
}: UseConversationInputHeightOptions): ConversationInputHeightController {
	const initialPreference = useMemo<ChatInputHeightPreference>(
		() => interfaceStore.getChatInputHeightPreference(scope),
		[scope],
	)
	const [heightMode, setHeightMode] = useState<ChatInputHeightMode>(initialPreference.mode)
	const [manualHeight, setManualHeight] = useState(initialPreference.height)
	const [autoHeight, setAutoHeight] = useState(initialPreference.height)
	const [availableHeight, setAvailableHeight] = useState(0)
	const [accessoryHeight, setAccessoryHeight] = useState(0)
	const manualHeightRef = useRef(initialPreference.height)
	const previousLayoutKeyRef = useRef(layoutKey)
	const pointerStartHeightRef = useRef(initialPreference.height)
	const measureFrameRef = useRef<number | null>(null)

	const effectiveMinHeight = minHeight + accessoryHeight
	const autoMaxHeight = getMaxHeight(availableHeight, effectiveMinHeight, maxRatio)
	const manualMaxHeight = getMaxHeight(
		availableHeight,
		effectiveMinHeight,
		manualMaxRatio,
		manualMinAvailableHeight,
	)
	const safeAutoHeight = clampHeight(
		autoHeight + accessoryHeight,
		effectiveMinHeight,
		autoMaxHeight,
	)
	const safeManualHeight = clampHeight(
		manualHeight + accessoryHeight,
		effectiveMinHeight,
		manualMaxHeight,
	)
	const effectiveHeight = heightMode === "manual" ? safeManualHeight : safeAutoHeight
	// Once the available panel has been measured, let automatic layouts fill their controlled panel.
	// This avoids measuring a fill-height container and toggling the layout in a feedback loop.
	const fillHeight =
		enabled && (heightMode === "manual" || (heightMode === "auto" && availableHeight > 0))

	// Persist only the editor portion so temporary task chrome is measured again when it changes.
	const persistPreference = useCallback(
		(mode: ChatInputHeightMode, height: number) => {
			interfaceStore.setChatInputHeightPreference(scope, {
				mode,
				height: clampHeight(
					height,
					minHeight,
					Math.max(minHeight, manualMaxHeight - accessoryHeight),
				),
			})
		},
		[accessoryHeight, manualMaxHeight, minHeight, scope],
	)

	useEffect(() => {
		if (!enabled || previousLayoutKeyRef.current === layoutKey) return

		previousLayoutKeyRef.current = layoutKey
		if (effectiveHeight <= effectiveMinHeight) return

		// Freeze a larger user-visible height during employee/mode switches so new content measurements do not shrink it.
		const preservedHeight = clampHeight(effectiveHeight, effectiveMinHeight, manualMaxHeight)
		const preservedEditorHeight = clampHeight(
			preservedHeight - accessoryHeight,
			minHeight,
			Math.max(minHeight, manualMaxHeight - accessoryHeight),
		)
		setHeightMode("manual")
		manualHeightRef.current = preservedEditorHeight
		setManualHeight(preservedEditorHeight)
		persistPreference("manual", preservedEditorHeight)
	}, [
		accessoryHeight,
		effectiveHeight,
		effectiveMinHeight,
		enabled,
		layoutKey,
		manualMaxHeight,
		minHeight,
		persistPreference,
	])

	// Recalculate available space and accessory chrome before updating automatic editor height.
	const measure = useCallback(() => {
		if (!enabled) return

		const container = containerRef.current
		const available = availableRef.current
		if (!container || !available) return

		const nextAvailableHeight = available.getBoundingClientRect().height
		const nextAccessoryHeight = measureAccessoryHeight(container)
		const nextMinHeight = minHeight + nextAccessoryHeight
		const nextMaxHeight = getMaxHeight(nextAvailableHeight, nextMinHeight, maxRatio)
		const naturalHeight = measureNaturalHeight(container)
		const nextAutoHeight = clampHeight(
			naturalHeight - nextAccessoryHeight,
			minHeight,
			Math.max(minHeight, nextMaxHeight - nextAccessoryHeight),
		)

		setAvailableHeight((previous) =>
			Math.abs(previous - nextAvailableHeight) < 1 ? previous : nextAvailableHeight,
		)
		setAccessoryHeight((previous) =>
			Math.abs(previous - nextAccessoryHeight) < 1 ? previous : nextAccessoryHeight,
		)
		if (heightMode === "manual") return

		setAutoHeight((previous) =>
			Math.abs(previous - nextAutoHeight) < 1 ? previous : nextAutoHeight,
		)
	}, [availableRef, containerRef, enabled, heightMode, maxRatio, minHeight])

	const scheduleMeasure = useCallback(() => {
		if (measureFrameRef.current !== null) {
			window.cancelAnimationFrame(measureFrameRef.current)
		}

		measureFrameRef.current = window.requestAnimationFrame(() => {
			measureFrameRef.current = null
			measure()
		})
	}, [measure])

	useLayoutEffect(() => {
		if (!enabled) return
		scheduleMeasure()

		const container = containerRef.current
		const available = availableRef.current
		if (!container || !available || typeof ResizeObserver === "undefined") return

		const resizeObserver = new ResizeObserver((entries) => {
			if (heightMode === "manual" && entries.every((entry) => entry.target !== available)) {
				return
			}
			scheduleMeasure()
		})
		resizeObserver.observe(available)
		if (heightMode === "auto") resizeObserver.observe(container)
		container.querySelectorAll<HTMLElement>(ACCESSORY_SELECTOR).forEach((element) => {
			resizeObserver.observe(element)
		})

		const mutationObserver = new MutationObserver(() => {
			container.querySelectorAll<HTMLElement>(ACCESSORY_SELECTOR).forEach((element) => {
				resizeObserver.observe(element)
			})
			scheduleMeasure()
		})
		mutationObserver.observe(container, {
			childList: true,
			characterData: true,
			subtree: true,
		})
		if (heightMode === "auto") container.addEventListener("input", scheduleMeasure)

		return () => {
			resizeObserver.disconnect()
			mutationObserver?.disconnect()
			if (heightMode === "auto") container.removeEventListener("input", scheduleMeasure)
			if (measureFrameRef.current !== null) {
				window.cancelAnimationFrame(measureFrameRef.current)
				measureFrameRef.current = null
			}
		}
	}, [availableRef, containerRef, enabled, heightMode, scheduleMeasure])

	useEffect(() => {
		if (enabled) return
		// Read the live persisted preference so collapsing then reopening the panel
		// restores the latest manual height instead of a stale mount-time snapshot.
		const currentPreference = interfaceStore.getChatInputHeightPreference(scope)
		setHeightMode(currentPreference.mode)
		manualHeightRef.current = currentPreference.height
		setManualHeight(currentPreference.height)
		setAutoHeight(currentPreference.height)
	}, [enabled, scope])

	const updateManualHeight = useCallback(
		(nextHeight: number) => {
			const safeHeight = clampHeight(
				nextHeight - accessoryHeight,
				minHeight,
				Math.max(minHeight, manualMaxHeight - accessoryHeight),
			)
			setHeightMode("manual")
			manualHeightRef.current = safeHeight
			setManualHeight(safeHeight)
		},
		[accessoryHeight, manualMaxHeight, minHeight],
	)

	const startPointerResize = useCallback(() => {
		if (!enabled) return
		pointerStartHeightRef.current = effectiveHeight
		updateManualHeight(effectiveHeight)
	}, [effectiveHeight, enabled, updateManualHeight])

	const resizeByPointerDelta = useCallback(
		(deltaY: number) => {
			if (!enabled) return
			updateManualHeight(pointerStartHeightRef.current - deltaY)
		},
		[enabled, updateManualHeight],
	)

	const finishPointerResize = useCallback(() => {
		if (!enabled) return
		persistPreference("manual", manualHeightRef.current)
	}, [enabled, persistPreference])

	const getSplitterHeight = useCallback((sizes: number[]) => sizes[1], [])

	const onSplitterResizeStart = useCallback(
		(sizes: number[]) => {
			if (!enabled) return
			const nextHeight = getSplitterHeight(sizes)
			if (!isValidHeight(nextHeight)) return
			pointerStartHeightRef.current = nextHeight
			updateManualHeight(nextHeight)
		},
		[enabled, getSplitterHeight, updateManualHeight],
	)

	const onSplitterResize = useCallback(
		(sizes: number[]) => {
			if (!enabled) return
			const nextHeight = getSplitterHeight(sizes)
			if (!isValidHeight(nextHeight)) return
			updateManualHeight(nextHeight)
		},
		[enabled, getSplitterHeight, updateManualHeight],
	)

	const onSplitterResizeEnd = useCallback(
		(sizes: number[]) => {
			if (!enabled) return
			const nextHeight = getSplitterHeight(sizes)
			if (isValidHeight(nextHeight)) {
				updateManualHeight(nextHeight)
				persistPreference("manual", manualHeightRef.current)
				return
			}
			persistPreference("manual", manualHeightRef.current)
		},
		[enabled, getSplitterHeight, persistPreference, updateManualHeight],
	)

	const restoreAutoHeight = useCallback(() => {
		if (!enabled) return
		setHeightMode("auto")
		persistPreference("auto", manualHeightRef.current)
		scheduleMeasure()
	}, [enabled, persistPreference, scheduleMeasure])

	return {
		enabled,
		effectiveHeight,
		minHeight: effectiveMinHeight,
		maxHeight: manualMaxHeight,
		fillHeight,
		startPointerResize,
		resizeByPointerDelta,
		finishPointerResize,
		onSplitterResizeStart,
		onSplitterResize,
		onSplitterResizeEnd,
		restoreAutoHeight,
	}
}
