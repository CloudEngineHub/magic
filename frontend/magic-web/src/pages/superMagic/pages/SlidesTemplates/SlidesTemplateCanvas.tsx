import {
	forwardRef,
	useCallback,
	useEffect,
	useImperativeHandle,
	useLayoutEffect,
	useMemo,
	useRef,
	useState,
} from "react"
import type { OptionItem } from "@/pages/superMagic/components/MainInputContainer/panels/types"
import {
	constrainTemplateCanvasOffset,
	shouldRequestMoreTemplates,
	type TemplateCanvasDirection,
	type TemplateCanvasInsets,
	type TemplateCanvasPoint,
} from "./canvasLayout"
import {
	CANVAS_END_PADDING,
	type SlidesTemplateCanvasTile,
	type SlidesTemplatePreviewFocus,
	LOAD_MORE_INTERVAL_MS,
	getPriorityWeightedRandomIndex,
	getLoadMoreThreshold,
	getTemplateKey,
	getTemplatePreviewUrls,
} from "./canvasInteraction"
import SlidesTemplateCanvasSurface from "./SlidesTemplateCanvasSurface"
import { useSlidesTemplateCanvasItems } from "./useSlidesTemplateCanvasItems"
import { useSlidesTemplateCanvasMotion } from "./useSlidesTemplateCanvasMotion"
import { useSlidesTemplateCanvasNavigation } from "./useSlidesTemplateCanvasNavigation"
import { useSlidesTemplateCanvasPointer } from "./useSlidesTemplateCanvasPointer"
import { useSlidesTemplateCanvasWheel } from "./useSlidesTemplateCanvasWheel"
import { useTemplateCanvasVisibleItems } from "./useTemplateCanvasVisibleItems"

interface SlidesTemplateCanvasProps {
	hasMore: boolean
	isLoading: boolean
	isLoadingMore: boolean
	isRefreshing: boolean
	loadMoreSignal?: number | string
	onLoadMore: () => void
	onFindSimilarColors?: (template: OptionItem) => void
	onPreviewOpenChange?: (isOpen: boolean) => void
	onTemplateSelect: (template: OptionItem) => void
	resetKey: string
	selectedTemplate?: OptionItem | null
	templates: OptionItem[]
	viewportInsets?: Partial<TemplateCanvasInsets>
}

export interface SlidesTemplateCanvasHandle {
	focusRandomTemplate: () => boolean
	openPreview: (template: OptionItem) => boolean
}

const AUTO_LOAD_DIRECTIONS: TemplateCanvasDirection[] = ["left", "right", "up", "down"]

const SlidesTemplateCanvas = forwardRef<SlidesTemplateCanvasHandle, SlidesTemplateCanvasProps>(
	function SlidesTemplateCanvas(
		{
			hasMore,
			isLoading,
			isLoadingMore,
			isRefreshing,
			loadMoreSignal,
			onLoadMore,
			onFindSimilarColors,
			onPreviewOpenChange,
			onTemplateSelect,
			resetKey,
			selectedTemplate,
			templates,
			viewportInsets,
		}: SlidesTemplateCanvasProps,
		ref,
	) {
		const [previewFocus, setPreviewFocus] = useState<SlidesTemplatePreviewFocus | null>(null)
		const [randomFocusedAnchorTileId, setRandomFocusedAnchorTileId] = useState("")
		const viewportRef = useRef<HTMLDivElement | null>(null)
		const contentRef = useRef<HTMLDivElement | null>(null)
		const offsetRef = useRef<TemplateCanvasPoint>({ x: 0, y: 0 })
		const viewportInsetsRef = useRef(viewportInsets)
		const scaleRef = useRef(1)
		const lastLoadMoreAtRef = useRef(0)
		const lastAutoLoadSignalRef = useRef<number | string | null>(null)
		const { canvasItems, contentBounds, templateBounds } = useSlidesTemplateCanvasItems({
			templates,
		})
		const priorityCanvasItems = useMemo(
			() =>
				// 后端默认按 sort 降序返回，这里再次显式排序，保证本地分组数据也遵循同一优先级。
				[...canvasItems].sort((left, right) => {
					const leftSort = left.item.template.sort
					const rightSort = right.item.template.sort
					if (leftSort != null && rightSort != null && leftSort !== rightSort) {
						return rightSort - leftSort
					}
					if (leftSort != null) return -1
					if (rightSort != null) return 1
					return left.index - right.index
				}),
			[canvasItems],
		)
		const { scheduleVisibleCanvasItemsUpdate, updateVisibleCanvasItems, visibleCanvasItems } =
			useTemplateCanvasVisibleItems({
				canvasItems,
				offsetRef,
				scaleRef,
				viewportRef,
			})
		const focusedAnchorTileId = previewFocus?.anchorTileId ?? randomFocusedAnchorTileId
		const renderedCanvasItems = useMemo(() => {
			if (!focusedAnchorTileId) return visibleCanvasItems

			const focusedCanvasItem = canvasItems.find(
				({ item }) => item.id === focusedAnchorTileId,
			)
			if (!focusedCanvasItem || visibleCanvasItems.includes(focusedCanvasItem)) {
				return visibleCanvasItems
			}

			// 聚焦移动期间目标可能尚未进入虚拟化窗口；提前渲染一张卡片可避免到达后短暂空白。
			return [focusedCanvasItem, ...visibleCanvasItems]
		}, [canvasItems, focusedAnchorTileId, visibleCanvasItems])
		const isPreviewOpen = previewFocus !== null
		const selectedTemplateValue = selectedTemplate ? getTemplateKey(selectedTemplate) : ""
		const isInitialLoading = isLoading && templates.length === 0
		viewportInsetsRef.current = viewportInsets
		const viewportInsetsKey = `${viewportInsets?.top ?? 0}:${viewportInsets?.right ?? 0}:${viewportInsets?.bottom ?? 0}:${viewportInsets?.left ?? 0}`
		const autoLoadSignal = loadMoreSignal ?? canvasItems.length

		const stateRef = useRef({
			hasMore,
			isLoading,
			isLoadingMore,
			isRefreshing,
			contentBounds,
			templateBounds,
			onLoadMore,
		})

		useLayoutEffect(() => {
			stateRef.current = {
				hasMore,
				isLoading,
				isLoadingMore,
				isRefreshing,
				contentBounds,
				templateBounds,
				onLoadMore,
			}
		}, [
			hasMore,
			isLoading,
			isLoadingMore,
			isRefreshing,
			onLoadMore,
			contentBounds,
			templateBounds,
		])

		const applyTransform = useCallback(() => {
			const content = contentRef.current
			if (!content) return
			const { x, y } = offsetRef.current
			const scale = scaleRef.current
			content.style.transform = `translate3d(${x}px, ${y}px, 0) scale(${scale})`
			content.style.setProperty(
				"--slides-template-canvas-action-scale",
				String(scale > 0 ? 1 / scale : 1),
			)
		}, [])

		const getConstrainedOffset = useCallback((nextOffset: TemplateCanvasPoint) => {
			const viewport = viewportRef.current
			if (!viewport) return nextOffset

			const { width, height } = viewport.getBoundingClientRect()
			if (width <= 0 || height <= 0) return nextOffset

			const state = stateRef.current
			return constrainTemplateCanvasOffset({
				bounds: state.contentBounds,
				insets: viewportInsetsRef.current,
				offset: nextOffset,
				padding: state.hasMore ? CANVAS_END_PADDING : 0,
				scale: scaleRef.current,
				viewportHeight: height,
				viewportWidth: width,
			})
		}, [])

		const setCanvasOffset = useCallback(
			(nextOffset: TemplateCanvasPoint) => {
				const constrainedOffset = getConstrainedOffset(nextOffset)
				offsetRef.current = constrainedOffset
				applyTransform()
				scheduleVisibleCanvasItemsUpdate()
				return constrainedOffset
			},
			[applyTransform, getConstrainedOffset, scheduleVisibleCanvasItemsUpdate],
		)

		const maybeRequestMore = useCallback(
			(
				directions: TemplateCanvasDirection[],
				{ bypassThrottle = false }: { bypassThrottle?: boolean } = {},
			) => {
				if (isPreviewOpen) return false

				const viewport = viewportRef.current
				if (!viewport || directions.length === 0) return false

				const now = Date.now()
				if (!bypassThrottle && now - lastLoadMoreAtRef.current < LOAD_MORE_INTERVAL_MS) {
					return false
				}

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
				lastLoadMoreAtRef.current = now
				state.onLoadMore()
				return true
			},
			[isPreviewOpen],
		)

		useEffect(() => {
			if (isPreviewOpen || !hasMore || isLoading || isLoadingMore || isRefreshing) {
				return
			}
			if (lastAutoLoadSignalRef.current === autoLoadSignal) return

			const frameId = requestAnimationFrame(() => {
				if (maybeRequestMore(AUTO_LOAD_DIRECTIONS, { bypassThrottle: true })) {
					lastAutoLoadSignalRef.current = autoLoadSignal
				}
			})

			return () => cancelAnimationFrame(frameId)
		}, [
			autoLoadSignal,
			hasMore,
			isPreviewOpen,
			isLoading,
			isLoadingMore,
			isRefreshing,
			maybeRequestMore,
			templateBounds,
		])

		useEffect(() => {
			if (hasMore || isLoading || isLoadingMore || isRefreshing) return
			setCanvasOffset(offsetRef.current)
		}, [contentBounds, hasMore, isLoading, isLoadingMore, isRefreshing, setCanvasOffset])

		const { animateToOffset, isCanvasMoving, scheduleEdgeMovement, stopAnimation } =
			useSlidesTemplateCanvasMotion({
				getConstrainedOffset,
				maybeRequestMore,
				offsetRef,
				setCanvasOffset,
			})
		const {
			handleCanvasClickCapture,
			handlePointerDown,
			handlePointerLeave,
			handlePointerMove,
			handlePointerRelease,
			isDragging,
		} = useSlidesTemplateCanvasPointer({
			isPreviewOpen,
			maybeRequestMore,
			offsetRef,
			onPointerDownStart: () => setRandomFocusedAnchorTileId(""),
			resetKey,
			scheduleEdgeMovement,
			setCanvasOffset,
			stopAnimation,
			viewportRef,
		})

		const setViewportNode = useCallback(
			(node: HTMLDivElement | null) => {
				viewportRef.current = node
				updateVisibleCanvasItems()
			},
			[updateVisibleCanvasItems],
		)

		const {
			canvasScale,
			canZoomIn,
			canZoomOut,
			handleControlMove,
			handleFocusPoint,
			handleResetView,
			handleZoomIn,
			handleZoomOut,
			setCanvasScale,
		} = useSlidesTemplateCanvasNavigation({
			animateToOffset,
			canvasItemsLength: canvasItems.length,
			contentBounds,
			maybeRequestMore,
			offsetRef,
			resetKey,
			scaleRef,
			setCanvasOffset,
			stopAnimation,
			viewportInsetsRef,
			viewportRef,
		})

		useImperativeHandle(
			ref,
			() => ({
				focusRandomTemplate() {
					if (priorityCanvasItems.length === 0) return false

					const candidates =
						priorityCanvasItems.length > 1 && randomFocusedAnchorTileId
							? priorityCanvasItems.filter(({ item }) => {
									return item.id !== randomFocusedAnchorTileId
								})
							: priorityCanvasItems
					const randomIndex = getPriorityWeightedRandomIndex(candidates.length)
					const canvasItem = candidates[randomIndex]
					if (!canvasItem || !handleFocusPoint(canvasItem.position)) return false

					const { item: tile } = canvasItem
					setRandomFocusedAnchorTileId(tile.id)
					return true
				},
				openPreview(template) {
					if (getTemplatePreviewUrls(template).length === 0) return false

					const templateKey = getTemplateKey(template)
					const canvasItem = canvasItems.find(
						({ item }) => getTemplateKey(item.template) === templateKey,
					)
					if (!canvasItem) return false

					const { item: tile } = canvasItem
					setRandomFocusedAnchorTileId("")
					setPreviewFocus({
						anchorTileId: tile.id,
						tile,
					})
					return true
				},
			}),
			[canvasItems, handleFocusPoint, priorityCanvasItems, randomFocusedAnchorTileId],
		)

		useSlidesTemplateCanvasWheel({
			enabled: !isPreviewOpen,
			maybeRequestMore,
			onScaleChange: setCanvasScale,
			offsetRef,
			scaleRef,
			setCanvasOffset,
			stopAnimation,
			viewportRef,
		})

		useLayoutEffect(() => {
			stopAnimation()
			lastLoadMoreAtRef.current = 0
			lastAutoLoadSignalRef.current = null
			setPreviewFocus(null)
			setRandomFocusedAnchorTileId("")
			setCanvasOffset({ x: 0, y: 0 })
		}, [resetKey, setCanvasOffset, stopAnimation])

		useLayoutEffect(() => {
			setCanvasOffset(offsetRef.current)
		}, [setCanvasOffset, viewportInsetsKey])

		useEffect(() => {
			onPreviewOpenChange?.(previewFocus !== null)
		}, [onPreviewOpenChange, previewFocus])

		function handlePreviewToggle(anchorTileId: string, tile: SlidesTemplateCanvasTile) {
			setRandomFocusedAnchorTileId("")
			setPreviewFocus((currentFocus) =>
				currentFocus?.anchorTileId === anchorTileId && currentFocus.tile.id === tile.id
					? null
					: { anchorTileId, tile },
			)
		}

		return (
			<SlidesTemplateCanvasSurface
				setViewportNode={setViewportNode}
				canvasItems={canvasItems}
				contentRef={contentRef}
				visibleCanvasItems={renderedCanvasItems}
				focusedAnchorTileId={focusedAnchorTileId}
				selectedTemplateValue={selectedTemplateValue}
				selectedTemplate={selectedTemplate}
				previewFocus={previewFocus}
				canvasScale={canvasScale}
				bottomEdgeInset={viewportInsets?.bottom}
				canZoomIn={canZoomIn}
				canZoomOut={canZoomOut}
				isDragging={isDragging}
				isCanvasMoving={isCanvasMoving}
				isInitialLoading={isInitialLoading}
				isLoading={isLoading}
				isLoadingMore={isLoadingMore}
				isRefreshing={isRefreshing}
				templateCount={templates.length}
				onPointerDown={handlePointerDown}
				onPointerMove={handlePointerMove}
				onPointerUp={handlePointerRelease}
				onPointerCancel={handlePointerRelease}
				onPointerLeave={handlePointerLeave}
				onCanvasClickCapture={handleCanvasClickCapture}
				onFindSimilarColors={onFindSimilarColors}
				onTemplateSelect={onTemplateSelect}
				onPreviewToggle={handlePreviewToggle}
				onPreviewClose={() => setPreviewFocus(null)}
				onZoomIn={handleZoomIn}
				onZoomOut={handleZoomOut}
				onResetView={handleResetView}
				onControlMove={handleControlMove}
			/>
		)
	},
)

SlidesTemplateCanvas.displayName = "SlidesTemplateCanvas"

export default SlidesTemplateCanvas
