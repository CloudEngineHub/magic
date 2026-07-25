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
	type TemplateCanvasItem,
	type TemplateCanvasInsets,
	type TemplateCanvasPoint,
} from "./canvasLayout"
import {
	type SlidesTemplateCanvasTile,
	type SlidesTemplatePreviewFocus,
	getPriorityWeightedRandomIndex,
	getTemplateKey,
	getTemplatePreviewUrls,
	isSlidesTemplateCanvasFiller,
} from "./canvasInteraction"
import { getNearestLoopedSlidesTemplateCanvasItem } from "./canvasLoop"
import SlidesTemplateCanvasSurface from "./SlidesTemplateCanvasSurface"
import { useSlidesTemplateCanvasItems } from "./useSlidesTemplateCanvasItems"
import { useSlidesTemplateCanvasLoadMore } from "./useSlidesTemplateCanvasLoadMore"
import { useSlidesTemplateCanvasMotion } from "./useSlidesTemplateCanvasMotion"
import { useSlidesTemplateCanvasNavigation } from "./useSlidesTemplateCanvasNavigation"
import { useSlidesTemplateCanvasPointer } from "./useSlidesTemplateCanvasPointer"
import { useSlidesTemplateCanvasWheel } from "./useSlidesTemplateCanvasWheel"
import { SLIDES_TEMPLATE_CANVAS_DEFAULT_SCALE } from "./canvasZoom"
import { useSlidesTemplateCanvasActiveTemplates } from "./useSlidesTemplateCanvasActiveTemplates"
import { useSlidesTemplateCanvasAutoExplore } from "./useSlidesTemplateCanvasAutoExplore"
import {
	useSlidesTemplateCanvasInitialAlignment,
	type SlidesTemplateCanvasInitialAlignment,
} from "./useSlidesTemplateCanvasInitialAlignment"
import { useTemplateCanvasVisibleItems } from "./useTemplateCanvasVisibleItems"

interface SlidesTemplateCanvasProps {
	enableInfiniteLoop?: boolean
	hasMore: boolean
	initialAlignment?: SlidesTemplateCanvasInitialAlignment
	isLoading: boolean
	isLoadingMore: boolean
	isRefreshFailed?: boolean
	isRefreshing: boolean
	loadMoreSignal?: number | string
	onLoadMore: () => void
	onFindSimilarColors?: (template: OptionItem) => void
	onPreviewOpenChange?: (isOpen: boolean) => void
	onRetryRefresh?: () => void
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
			enableInfiniteLoop = true,
			hasMore,
			initialAlignment = "center",
			isLoading,
			isLoadingMore,
			isRefreshFailed = false,
			isRefreshing,
			loadMoreSignal,
			onLoadMore,
			onFindSimilarColors,
			onPreviewOpenChange,
			onRetryRefresh,
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
		const pendingRandomFocusRef = useRef(false)
		const viewportRef = useRef<HTMLDivElement | null>(null)
		const contentRef = useRef<HTMLDivElement | null>(null)
		const offsetRef = useRef<TemplateCanvasPoint>({ x: 0, y: 0 })
		const viewportInsetsRef = useRef(viewportInsets)
		const scaleRef = useRef(SLIDES_TEMPLATE_CANVAS_DEFAULT_SCALE)
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
		const {
			canvasItems,
			contentBounds,
			loopItemQuery,
			loopMetrics,
			resetKey: layoutResetKey,
			templateBounds,
		} = useSlidesTemplateCanvasItems({
			enableInfiniteLoop,
			resetKey,
			templates: activeTemplates,
		})
		const priorityCanvasItems = useMemo(
			() =>
				// 后端默认按 sort 降序返回，这里再次显式排序，保证本地分组数据也遵循同一优先级。
				[...canvasItems]
					.filter(({ item }) => !isSlidesTemplateCanvasFiller(item))
					.sort((left, right) => {
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
				resetKey: layoutResetKey,
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

		const { maybeRequestMore, setCanvasOffset } = useSlidesTemplateCanvasLoadMore({
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
			resetKey: layoutResetKey,
			scaleRef,
			scheduleVisibleCanvasItemsUpdate,
			smallContentVerticalAlignment: initialAlignment === "top" ? "start" : "center",
			templateBounds,
			viewportInsetsKey,
			viewportInsetsRef,
			viewportRef,
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
			resetKey: layoutResetKey,
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
			scaleRef,
			setCanvasOffset,
			stopAnimation,
			viewportInsetsRef,
			viewportRef,
		})
		const focusRandomTemplate = useCallback(() => {
			if (priorityCanvasItems.length === 0 || !viewportRef.current) return false

			const candidates =
				priorityCanvasItems.length > 1 && randomFocusedTemplateKey
					? priorityCanvasItems.filter(({ item }) => {
							return getTemplateKey(item.template) !== randomFocusedTemplateKey
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
		}, [handleFocusPoint, loopMetrics, priorityCanvasItems, randomFocusedTemplateKey])
		const requestRandomTemplateFocus = useCallback(() => {
			const didFocus = focusRandomTemplate()
			pendingRandomFocusRef.current = !didFocus
			return didFocus
		}, [focusRandomTemplate])

		useEffect(() => {
			if (!pendingRandomFocusRef.current) return

			const frameId = requestAnimationFrame(() => {
				if (focusRandomTemplate()) pendingRandomFocusRef.current = false
			})
			return () => cancelAnimationFrame(frameId)
		}, [focusRandomTemplate])

		useImperativeHandle(
			ref,
			() => ({
				focusRandomTemplate: requestRandomTemplateFocus,
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
				requestRandomTemplateFocus,
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
			setPreviewFocus(null)
			setRandomFocusedCanvasItem(null)
			setCanvasOffset({ x: 0, y: 0 })
		}, [resetKey, setCanvasOffset, stopAnimation])

		useSlidesTemplateCanvasInitialAlignment({
			canvasItems,
			contentBounds,
			initialAlignment,
			resetKey: layoutResetKey,
			scaleRef,
			setCanvasOffset,
			viewportInsetsRef,
			viewportRef,
			templates: activeTemplates,
		})

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
				enableIdleLoops={enableInfiniteLoop}
				isIdleAnimationActive={isCanvasIdle && !isCanvasIdleExploring && canvasScale >= 0.8}
				isInitialLoading={isInitialLoading}
				isLoading={isLoading}
				isLoadingMore={isLoadingMore}
				isRefreshFailed={isRefreshFailed}
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
				onRetryRefresh={onRetryRefresh}
				onControlMove={handleControlMove}
			/>
		)
	},
)

SlidesTemplateCanvas.displayName = "SlidesTemplateCanvas"

export default SlidesTemplateCanvas
