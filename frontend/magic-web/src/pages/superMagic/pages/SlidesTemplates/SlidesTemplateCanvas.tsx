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
	shouldRequestMoreTemplates,
	type TemplateCanvasItem,
	type TemplateCanvasDirection,
	type TemplateCanvasInsets,
	type TemplateCanvasPoint,
} from "./canvasLayout"
import {
	type SlidesTemplateCanvasTile,
	type SlidesTemplatePreviewFocus,
	LOAD_MORE_INTERVAL_MS,
	getPriorityWeightedRandomIndex,
	getLoadMoreThreshold,
	getTemplateKey,
	getTemplatePreviewUrls,
} from "./canvasInteraction"
import {
	getNearestLoopedSlidesTemplateCanvasItem,
	getSlidesTemplateCanvasLoopCycle,
} from "./canvasLoop"
import SlidesTemplateCanvasSurface from "./SlidesTemplateCanvasSurface"
import { useSlidesTemplateCanvasItems } from "./useSlidesTemplateCanvasItems"
import { useSlidesTemplateCanvasAutoLoad } from "./useSlidesTemplateCanvasAutoLoad"
import { useSlidesTemplateCanvasMotion } from "./useSlidesTemplateCanvasMotion"
import { useSlidesTemplateCanvasNavigation } from "./useSlidesTemplateCanvasNavigation"
import { useSlidesTemplateCanvasPointer } from "./useSlidesTemplateCanvasPointer"
import { useSlidesTemplateCanvasWheel } from "./useSlidesTemplateCanvasWheel"
import { useSlidesTemplateCanvasActiveTemplates } from "./useSlidesTemplateCanvasActiveTemplates"
import { useSlidesTemplateCanvasAutoExplore } from "./useSlidesTemplateCanvasAutoExplore"
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
	onTemplateDetailLoad?: (template: OptionItem) => Promise<OptionItem | null>
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
			onTemplateDetailLoad,
			onTemplateSelect,
			resetKey,
			selectedTemplate,
			templates,
			viewportInsets,
		}: SlidesTemplateCanvasProps,
		ref,
	) {
		const [previewFocus, setPreviewFocus] = useState<SlidesTemplatePreviewFocus | null>(null)
		const [isDragging, setIsDragging] = useState(false)
		const [randomFocusedCanvasItem, setRandomFocusedCanvasItem] =
			useState<TemplateCanvasItem<SlidesTemplateCanvasTile> | null>(null)
		const viewportRef = useRef<HTMLDivElement | null>(null)
		const contentRef = useRef<HTMLDivElement | null>(null)
		const offsetRef = useRef<TemplateCanvasPoint>({ x: 0, y: 0 })
		const viewportInsetsRef = useRef(viewportInsets)
		const scaleRef = useRef(1)
		const lastLoadMoreAtRef = useRef(0)
		const lastLoadMoreLoopKeyRef = useRef("")
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
		const activeTemplates = useSlidesTemplateCanvasActiveTemplates({
			isDragging,
			resetKey,
			templates,
		})
		const { canvasItems, contentBounds, loopItemQuery, loopMetrics, templateBounds } =
			useSlidesTemplateCanvasItems({ templates: activeTemplates })
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
				loopItemQuery,
				loopMetrics,
				onOffsetRebase: applyTransform,
				offsetRef,
				scaleRef,
				viewportRef,
			})
		const randomFocusedAnchorTileId = randomFocusedCanvasItem?.item.id ?? ""
		const randomFocusedTemplateKey = randomFocusedCanvasItem
			? getTemplateKey(randomFocusedCanvasItem.item.template)
			: ""
		const focusedAnchorTileId = previewFocus?.anchorTileId ?? randomFocusedAnchorTileId
		const renderedCanvasItems = useMemo(() => {
			if (!focusedAnchorTileId) return visibleCanvasItems

			const focusedCanvasItem =
				visibleCanvasItems.find(({ item }) => item.id === focusedAnchorTileId) ??
				randomFocusedCanvasItem ??
				canvasItems.find(({ item }) => item.id === focusedAnchorTileId)
			if (!focusedCanvasItem || visibleCanvasItems.includes(focusedCanvasItem)) {
				return visibleCanvasItems
			}

			// 聚焦移动期间目标可能尚未进入虚拟化窗口；提前渲染一张卡片可避免到达后短暂空白。
			return [
				{
					...focusedCanvasItem,
					renderKey: `focus:${focusedCanvasItem.item.id}`,
				},
				...visibleCanvasItems,
			]
		}, [canvasItems, focusedAnchorTileId, randomFocusedCanvasItem, visibleCanvasItems])
		const isPreviewOpen = previewFocus !== null
		const hasDeferredTemplateUpdate = isDragging && activeTemplates !== templates
		const selectedTemplateValue = selectedTemplate ? getTemplateKey(selectedTemplate) : ""
		const isInitialLoading = isLoading && templates.length === 0
		viewportInsetsRef.current = viewportInsets
		const viewportInsetsKey = `${viewportInsets?.top ?? 0}:${viewportInsets?.right ?? 0}:${viewportInsets?.bottom ?? 0}:${viewportInsets?.left ?? 0}`
		const autoLoadSignal = loadMoreSignal ?? canvasItems.length
		const loadTemplateDetail = useCallback(
			(template: OptionItem) => {
				if (!onTemplateDetailLoad) return Promise.resolve(template)
				return Promise.resolve(onTemplateDetailLoad(template)).then(
					(detail) => detail ?? template,
				)
			},
			[onTemplateDetailLoad],
		)
		const handlePreviewIntent = useCallback(
			(template: OptionItem) => {
				if (!onTemplateDetailLoad) return
				void loadTemplateDetail(template).catch((error) => {
					console.error("Failed to preload slides template detail", error)
				})
			},
			[loadTemplateDetail, onTemplateDetailLoad],
		)
		const hydratePreviewFocus = useCallback(
			(anchorTileId: string, tile: SlidesTemplateCanvasTile) => {
				if (!onTemplateDetailLoad) return
				void loadTemplateDetail(tile.template)
					.then((detail) => {
						setPreviewFocus((currentFocus) => {
							if (
								currentFocus?.anchorTileId !== anchorTileId ||
								currentFocus.tile.id !== tile.id
							) {
								return currentFocus
							}

							return {
								...currentFocus,
								tile: { ...currentFocus.tile, template: detail },
							}
						})
					})
					.catch((error) => {
						console.error("Failed to fetch slides template detail for preview", error)
					})
			},
			[loadTemplateDetail, onTemplateDetailLoad],
		)

		const stateRef = useRef({
			hasMore,
			isLoading,
			isLoadingMore,
			isRefreshing,
			templateBounds,
			onLoadMore,
		})

		useLayoutEffect(() => {
			stateRef.current = {
				hasMore,
				isLoading,
				isLoadingMore,
				isRefreshing,
				templateBounds,
				onLoadMore,
			}
		}, [hasMore, isLoading, isLoadingMore, isRefreshing, onLoadMore, templateBounds])

		const setCanvasOffset = useCallback(
			(nextOffset: TemplateCanvasPoint) => {
				offsetRef.current = nextOffset
				applyTransform()
				scheduleVisibleCanvasItemsUpdate()
				return nextOffset
			},
			[applyTransform, scheduleVisibleCanvasItemsUpdate],
		)

		const maybeRequestMore = useCallback(
			(directions: TemplateCanvasDirection[]) => {
				if (isPreviewOpen) return false

				const viewport = viewportRef.current
				if (!viewport || directions.length === 0) return false

				const now = Date.now()
				if (now - lastLoadMoreAtRef.current < LOAD_MORE_INTERVAL_MS) {
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
				const loopCycle = getSlidesTemplateCanvasLoopCycle({
					loopMetrics,
					offset: offsetRef.current,
					scale: scaleRef.current,
				})
				const loopKey = `${loadDirection}:${loopCycle.x}:${loopCycle.y}`
				if (lastLoadMoreLoopKeyRef.current === loopKey) return false
				lastLoadMoreAtRef.current = now
				state.onLoadMore()
				lastLoadMoreLoopKeyRef.current = loopKey
				return true
			},
			[isPreviewOpen, loopMetrics],
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

		const {
			animateToOffset,
			isCanvasFocusSettling,
			isCanvasIdleExploring,
			isCanvasMoving,
			scheduleEdgeMovement,
			startIdleExploration,
			stopAnimation,
		} = useSlidesTemplateCanvasMotion({
			maybeRequestMore,
			offsetRef,
			setCanvasOffset,
		})
		const {
			handleCanvasActivity,
			isIdle: isCanvasIdle,
			markCanvasInactive,
		} = useSlidesTemplateCanvasAutoExplore({
			disabled:
				isDragging ||
				isPreviewOpen ||
				Boolean(selectedTemplate) ||
				Boolean(focusedAnchorTileId) ||
				isInitialLoading ||
				isRefreshing,
			startIdleExploration,
			stopAnimation,
		})
		const handlePointerDownStart = useCallback(() => {
			setRandomFocusedCanvasItem(null)
		}, [])
		const {
			handleCanvasClickCapture,
			handlePointerDown,
			handlePointerLeave,
			handlePointerMove,
			handlePointerRelease,
		} = useSlidesTemplateCanvasPointer({
			isPreviewOpen,
			maybeRequestMore,
			offsetRef,
			onPointerDownStart: handlePointerDownStart,
			resetKey,
			scheduleEdgeMovement,
			setCanvasOffset,
			setIsDragging,
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
			centerContent: loopMetrics.width <= 0 || loopMetrics.height <= 0,
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
						priorityCanvasItems.length > 1 && randomFocusedTemplateKey
							? priorityCanvasItems.filter(({ item }) => {
									return (
										getTemplateKey(item.template) !== randomFocusedTemplateKey
									)
								})
							: priorityCanvasItems
					const randomIndex = getPriorityWeightedRandomIndex(candidates.length)
					const canvasItem = candidates[randomIndex]
					if (!canvasItem) return false
					const focusedCanvasItem = getNearestLoopedSlidesTemplateCanvasItem({
						item: canvasItem,
						loopMetrics,
						offset: offsetRef.current,
						scale: scaleRef.current,
					})
					if (!handleFocusPoint(focusedCanvasItem.position)) return false

					setRandomFocusedCanvasItem(focusedCanvasItem)
					return true
				},
				openPreview(template) {
					if (getTemplatePreviewUrls(template).length === 0) return false

					const templateKey = getTemplateKey(template)
					const canvasItem = canvasItems.find(
						({ item }) => getTemplateKey(item.template) === templateKey,
					)
					if (!canvasItem) return false

					const focusedCanvasItem = getNearestLoopedSlidesTemplateCanvasItem({
						item: canvasItem,
						loopMetrics,
						offset: offsetRef.current,
						scale: scaleRef.current,
					})
					const { item: tile } = focusedCanvasItem
					if (!handleFocusPoint(focusedCanvasItem.position)) return false
					setRandomFocusedCanvasItem(focusedCanvasItem)
					setPreviewFocus({
						anchorTileId: tile.id,
						tile,
					})
					hydratePreviewFocus(tile.id, tile)
					return true
				},
			}),
			[
				canvasItems,
				handleFocusPoint,
				hydratePreviewFocus,
				loopMetrics,
				priorityCanvasItems,
				randomFocusedTemplateKey,
			],
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
			lastLoadMoreLoopKeyRef.current = ""
			setPreviewFocus(null)
			setRandomFocusedCanvasItem(null)
			setCanvasOffset({ x: 0, y: 0 })
		}, [resetKey, setCanvasOffset, stopAnimation])

		useLayoutEffect(() => {
			setCanvasOffset(offsetRef.current)
		}, [setCanvasOffset, viewportInsetsKey])

		useEffect(() => {
			onPreviewOpenChange?.(previewFocus !== null)
		}, [onPreviewOpenChange, previewFocus])

		const handlePreviewToggle = useCallback(
			(anchorTileId: string, tile: SlidesTemplateCanvasTile) => {
				setRandomFocusedCanvasItem(null)
				if (
					previewFocus?.anchorTileId === anchorTileId &&
					previewFocus.tile.id === tile.id
				) {
					setPreviewFocus(null)
					return
				}

				setPreviewFocus({ anchorTileId, tile })
				hydratePreviewFocus(anchorTileId, tile)
			},
			[hydratePreviewFocus, previewFocus],
		)
		const handlePreviewClose = useCallback(() => {
			setPreviewFocus(null)
			setRandomFocusedCanvasItem(null)
		}, [])

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
				canZoomIn={canZoomIn}
				canZoomOut={canZoomOut}
				isDragging={isDragging}
				isCanvasFocusSettling={isCanvasFocusSettling}
				isCanvasMoving={isCanvasMoving}
				isIdleAnimationActive={isCanvasIdle && !isCanvasIdleExploring && canvasScale >= 0.8}
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
				onCanvasActivity={handleCanvasActivity}
				onCanvasPointerLeave={markCanvasInactive}
				onCanvasClickCapture={handleCanvasClickCapture}
				onFindSimilarColors={onFindSimilarColors}
				onTemplateSelect={onTemplateSelect}
				onPreviewIntent={handlePreviewIntent}
				onPreviewToggle={handlePreviewToggle}
				onPreviewClose={handlePreviewClose}
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
