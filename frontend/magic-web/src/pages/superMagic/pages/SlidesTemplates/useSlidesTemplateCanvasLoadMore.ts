import { useCallback, useLayoutEffect, useRef, type MutableRefObject, type RefObject } from "react"
import {
	constrainTemplateCanvasOffset,
	shouldRequestMoreTemplates,
	type TemplateCanvasBounds,
	type TemplateCanvasDirection,
	type TemplateCanvasInsets,
	type TemplateCanvasPoint,
} from "./canvasLayout"
import {
	CANVAS_END_PADDING,
	LOAD_MORE_INTERVAL_MS,
	getLoadMoreThreshold,
} from "./canvasInteraction"
import {
	getSlidesTemplateCanvasLoopCycle,
	type SlidesTemplateCanvasLoopMetrics,
} from "./canvasLoop"
import { useSlidesTemplateCanvasAutoLoad } from "./useSlidesTemplateCanvasAutoLoad"

interface UseSlidesTemplateCanvasLoadMoreInput {
	applyTransform: () => void
	autoLoadSignal: number | string
	contentBounds: TemplateCanvasBounds
	hasDeferredTemplateUpdate: boolean
	hasMore: boolean
	isLoading: boolean
	isLoadingMore: boolean
	isPreviewOpen: boolean
	isRefreshing: boolean
	loopMetrics: SlidesTemplateCanvasLoopMetrics
	onLoadMore: () => void
	offsetRef: MutableRefObject<TemplateCanvasPoint>
	resetKey: string
	scaleRef: MutableRefObject<number>
	scheduleVisibleCanvasItemsUpdate: () => void
	smallContentVerticalAlignment?: "center" | "start"
	templateBounds: TemplateCanvasBounds
	viewportInsetsKey: string
	viewportInsetsRef: MutableRefObject<Partial<TemplateCanvasInsets> | undefined>
	viewportRef: RefObject<HTMLDivElement | null>
}

export function useSlidesTemplateCanvasLoadMore({
	applyTransform,
	autoLoadSignal,
	contentBounds,
	hasDeferredTemplateUpdate,
	hasMore,
	isLoading,
	isLoadingMore,
	isPreviewOpen,
	isRefreshing,
	loopMetrics,
	onLoadMore,
	offsetRef,
	resetKey,
	scaleRef,
	scheduleVisibleCanvasItemsUpdate,
	smallContentVerticalAlignment,
	templateBounds,
	viewportInsetsKey,
	viewportInsetsRef,
	viewportRef,
}: UseSlidesTemplateCanvasLoadMoreInput) {
	const lastLoadMoreAtRef = useRef(0)
	const lastLoadMoreLoopKeyRef = useRef("")
	const stateRef = useRef({
		contentBounds,
		hasMore,
		isLoading,
		isLoadingMore,
		isRefreshing,
		loopMetrics,
		onLoadMore,
		templateBounds,
	})

	useLayoutEffect(() => {
		stateRef.current = {
			contentBounds,
			hasMore,
			isLoading,
			isLoadingMore,
			isRefreshing,
			loopMetrics,
			onLoadMore,
			templateBounds,
		}
	}, [
		contentBounds,
		hasMore,
		isLoading,
		isLoadingMore,
		isRefreshing,
		loopMetrics,
		onLoadMore,
		templateBounds,
	])

	const getConstrainedOffset = useCallback(
		(nextOffset: TemplateCanvasPoint) => {
			const viewport = viewportRef.current
			if (!viewport) return nextOffset

			const state = stateRef.current
			const canRenderLoop = state.loopMetrics.width > 0 && state.loopMetrics.height > 0
			if (canRenderLoop) return nextOffset

			const { width, height } = viewport.getBoundingClientRect()
			if (width <= 0 || height <= 0) return nextOffset

			return constrainTemplateCanvasOffset({
				bounds: state.contentBounds,
				insets: viewportInsetsRef.current,
				offset: nextOffset,
				padding: state.hasMore ? CANVAS_END_PADDING : 0,
				scale: scaleRef.current,
				smallContentVerticalAlignment,
				viewportHeight: height,
				viewportWidth: width,
			})
		},
		[scaleRef, smallContentVerticalAlignment, viewportInsetsRef, viewportRef],
	)

	const setCanvasOffset = useCallback(
		(nextOffset: TemplateCanvasPoint) => {
			const constrainedOffset = getConstrainedOffset(nextOffset)
			offsetRef.current = constrainedOffset
			applyTransform()
			scheduleVisibleCanvasItemsUpdate()
			return constrainedOffset
		},
		[applyTransform, getConstrainedOffset, offsetRef, scheduleVisibleCanvasItemsUpdate],
	)

	const maybeRequestMore = useCallback(
		(directions: TemplateCanvasDirection[]) => {
			if (isPreviewOpen) return false

			const viewport = viewportRef.current
			if (!viewport || directions.length === 0) return false

			const now = Date.now()
			if (now - lastLoadMoreAtRef.current < LOAD_MORE_INTERVAL_MS) return false

			const { width, height } = viewport.getBoundingClientRect()
			if (width <= 0 || height <= 0) return false

			const state = stateRef.current
			const loadDirection = directions.find((direction) =>
				shouldRequestMoreTemplates({
					bounds: state.templateBounds,
					direction,
					hasMore: state.hasMore,
					isLoading: state.isLoading,
					isLoadingMore: state.isLoadingMore,
					isRefreshing: state.isRefreshing,
					offset: offsetRef.current,
					scale: scaleRef.current,
					threshold: getLoadMoreThreshold(width, height),
					viewportHeight: height,
					viewportWidth: width,
				}),
			)
			if (!loadDirection) return false

			const loopCycle = getSlidesTemplateCanvasLoopCycle({
				loopMetrics: state.loopMetrics,
				offset: offsetRef.current,
				scale: scaleRef.current,
			})
			const loopKey = `${loopCycle.x}:${loopCycle.y}`
			if (lastLoadMoreLoopKeyRef.current === loopKey) return false

			lastLoadMoreAtRef.current = now
			lastLoadMoreLoopKeyRef.current = loopKey
			state.onLoadMore()
			return true
		},
		[isPreviewOpen, offsetRef, scaleRef, viewportRef],
	)

	useSlidesTemplateCanvasAutoLoad({
		autoLoadSignal,
		enabled:
			!hasDeferredTemplateUpdate &&
			!isPreviewOpen &&
			hasMore &&
			!isLoading &&
			!isLoadingMore &&
			!isRefreshing,
		loopMetrics,
		maybeRequestMore,
		offsetRef,
		resetKey,
		scaleRef,
	})

	useLayoutEffect(() => {
		lastLoadMoreAtRef.current = 0
		lastLoadMoreLoopKeyRef.current = ""
	}, [resetKey])

	useLayoutEffect(() => {
		setCanvasOffset(offsetRef.current)
	}, [offsetRef, setCanvasOffset, viewportInsetsKey])

	useLayoutEffect(() => {
		if (hasMore || (loopMetrics.width > 0 && loopMetrics.height > 0)) return
		setCanvasOffset(offsetRef.current)
	}, [contentBounds, hasMore, loopMetrics, offsetRef, setCanvasOffset])

	return { maybeRequestMore, setCanvasOffset }
}
