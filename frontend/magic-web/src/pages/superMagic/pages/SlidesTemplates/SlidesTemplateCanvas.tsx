import {
	type MouseEvent,
	type PointerEvent,
	forwardRef,
	useCallback,
	useEffect,
	useImperativeHandle,
	useLayoutEffect,
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
	CANVAS_DRAG_START_THRESHOLD,
	CANVAS_END_PADDING,
	type CanvasDragState,
	type SlidesTemplateCanvasTile,
	type SlidesTemplatePreviewFocus,
	LOAD_MORE_INTERVAL_MS,
	getDirectionsFromVelocity,
	getEdgeVelocity,
	getLoadMoreThreshold,
	getTemplateKey,
	getTemplatePreviewUrls,
	isCanvasDragBlockedTarget,
	isSameCanvasPoint,
} from "./canvasInteraction"
import SlidesTemplateCanvasSurface from "./SlidesTemplateCanvasSurface"
import { useSlidesTemplateCanvasItems } from "./useSlidesTemplateCanvasItems"
import { useSlidesTemplateCanvasNavigation } from "./useSlidesTemplateCanvasNavigation"
import { useSlidesTemplateCanvasWheel } from "./useSlidesTemplateCanvasWheel"
import { useTemplateCanvasVisibleItems } from "./useTemplateCanvasVisibleItems"

interface SlidesTemplateCanvasProps {
	hasMore: boolean
	isLoading: boolean
	isLoadingMore: boolean
	isRefreshing: boolean
	onLoadMore: () => void
	onPreviewOpenChange?: (isOpen: boolean) => void
	onTemplateSelect: (template: OptionItem) => void
	resetKey: string
	selectedTemplate?: OptionItem | null
	templates: OptionItem[]
	viewportInsets?: Partial<TemplateCanvasInsets>
}

export interface SlidesTemplateCanvasHandle {
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
			onLoadMore,
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
		const viewportRef = useRef<HTMLDivElement | null>(null)
		const contentRef = useRef<HTMLDivElement | null>(null)
		const frameRef = useRef<number | null>(null)
		const offsetRef = useRef<TemplateCanvasPoint>({ x: 0, y: 0 })
		const viewportInsetsRef = useRef(viewportInsets)
		const scaleRef = useRef(1)
		const velocityRef = useRef<TemplateCanvasPoint>({ x: 0, y: 0 })
		const dragStateRef = useRef<CanvasDragState | null>(null)
		const lastLoadMoreAtRef = useRef(0)
		const lastAutoLoadTemplateCountRef = useRef(-1)
		const suppressClickRef = useRef(false)
		const suppressClickTimeoutRef = useRef<number | null>(null)
		const [isDragging, setIsDragging] = useState(false)
		const [isCanvasMoving, setIsCanvasMoving] = useState(false)
		const { canvasItems, contentBounds, templateBounds } = useSlidesTemplateCanvasItems({
			templates,
		})
		const { scheduleVisibleCanvasItemsUpdate, updateVisibleCanvasItems, visibleCanvasItems } =
			useTemplateCanvasVisibleItems({
				canvasItems,
				offsetRef,
				scaleRef,
				viewportRef,
			})
		const focusedAnchorTileId = previewFocus?.anchorTileId ?? ""
		const isPreviewOpen = previewFocus !== null
		const selectedTemplateValue = selectedTemplate ? getTemplateKey(selectedTemplate) : ""
		const isInitialLoading = isLoading && templates.length === 0
		viewportInsetsRef.current = viewportInsets
		const viewportInsetsKey = `${viewportInsets?.top ?? 0}:${viewportInsets?.right ?? 0}:${viewportInsets?.bottom ?? 0}:${viewportInsets?.left ?? 0}`

		useImperativeHandle(
			ref,
			() => ({
				openPreview(template) {
					if (getTemplatePreviewUrls(template).length === 0) return false

					const templateKey = getTemplateKey(template)
					const canvasItem = canvasItems.find(
						({ item }) => getTemplateKey(item.template) === templateKey,
					)
					if (!canvasItem) return false

					const { grid, item: tile } = canvasItem
					setPreviewFocus({
						anchorTileId: `${tile.id}:${grid.x}:${grid.y}`,
						tile,
					})
					return true
				},
			}),
			[canvasItems],
		)

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
			if (
				isPreviewOpen ||
				!hasMore ||
				isLoading ||
				isLoadingMore ||
				isRefreshing ||
				canvasItems.length === 0
			) {
				return
			}
			if (lastAutoLoadTemplateCountRef.current === canvasItems.length) return

			const frameId = requestAnimationFrame(() => {
				if (maybeRequestMore(AUTO_LOAD_DIRECTIONS, { bypassThrottle: true })) {
					lastAutoLoadTemplateCountRef.current = canvasItems.length
				}
			})

			return () => cancelAnimationFrame(frameId)
		}, [
			canvasItems.length,
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

		const stopAnimation = useCallback(() => {
			if (frameRef.current != null) {
				cancelAnimationFrame(frameRef.current)
				frameRef.current = null
			}
			velocityRef.current = { x: 0, y: 0 }
			setIsCanvasMoving(false)
		}, [])

		const tick = useCallback(() => {
			const velocity = velocityRef.current
			if (Math.abs(velocity.x) < 0.2 && Math.abs(velocity.y) < 0.2) {
				stopAnimation()
				return
			}

			const previousOffset = offsetRef.current
			const nextOffset = setCanvasOffset({
				x: previousOffset.x + velocity.x,
				y: previousOffset.y + velocity.y,
			})
			const appliedDelta = {
				x: nextOffset.x - previousOffset.x,
				y: nextOffset.y - previousOffset.y,
			}
			if (isSameCanvasPoint(previousOffset, nextOffset)) {
				stopAnimation()
				return
			}

			maybeRequestMore(getDirectionsFromVelocity(appliedDelta))
			frameRef.current = requestAnimationFrame(tick)
		}, [maybeRequestMore, setCanvasOffset, stopAnimation])

		const startAnimation = useCallback(() => {
			if (frameRef.current != null) return
			setIsCanvasMoving(true)
			frameRef.current = requestAnimationFrame(tick)
		}, [tick])

		const setViewportNode = useCallback(
			(node: HTMLDivElement | null) => {
				viewportRef.current = node
				updateVisibleCanvasItems()
			},
			[updateVisibleCanvasItems],
		)

		const handlePointerMove = useCallback(
			(event: PointerEvent<HTMLDivElement>) => {
				if (isPreviewOpen) return

				const dragState = dragStateRef.current
				if (dragState) {
					if (event.pointerId !== dragState.pointerId) return

					const dragDistanceX = event.clientX - dragState.startClientX
					const dragDistanceY = event.clientY - dragState.startClientY
					if (
						!dragState.hasMoved &&
						Math.hypot(dragDistanceX, dragDistanceY) < CANVAS_DRAG_START_THRESHOLD
					) {
						return
					}

					if (!dragState.hasMoved) {
						dragState.hasMoved = true
						setIsDragging(true)
						viewportRef.current?.setPointerCapture(event.pointerId)
					}

					event.preventDefault()
					const previousOffset = offsetRef.current
					const nextOffset = setCanvasOffset({
						x: dragState.startOffset.x + dragDistanceX,
						y: dragState.startOffset.y + dragDistanceY,
					})
					const appliedDelta = {
						x: nextOffset.x - previousOffset.x,
						y: nextOffset.y - previousOffset.y,
					}
					dragState.lastClientX = event.clientX
					dragState.lastClientY = event.clientY
					maybeRequestMore(getDirectionsFromVelocity(appliedDelta))
					return
				}

				if (isCanvasDragBlockedTarget(event.target)) {
					stopAnimation()
					return
				}

				const viewport = viewportRef.current
				if (!viewport) return

				const velocity = getEdgeVelocity(viewport.getBoundingClientRect(), event)
				velocityRef.current = velocity
				if (Math.abs(velocity.x) < 0.2 && Math.abs(velocity.y) < 0.2) {
					stopAnimation()
					return
				}
				startAnimation()
			},
			[isPreviewOpen, maybeRequestMore, setCanvasOffset, startAnimation, stopAnimation],
		)

		const handlePointerDown = useCallback(
			(event: PointerEvent<HTMLDivElement>) => {
				if (isPreviewOpen) return

				const viewport = viewportRef.current
				if (
					!viewport ||
					event.button > 0 ||
					event.isPrimary === false ||
					isCanvasDragBlockedTarget(event.target)
				) {
					return
				}

				stopAnimation()
				dragStateRef.current = {
					hasMoved: false,
					lastClientX: event.clientX,
					lastClientY: event.clientY,
					pointerId: event.pointerId,
					startClientX: event.clientX,
					startClientY: event.clientY,
					startOffset: offsetRef.current,
				}
			},
			[isPreviewOpen, stopAnimation],
		)

		const handlePointerLeave = useCallback(() => {
			stopAnimation()
			if (dragStateRef.current?.hasMoved) return
			dragStateRef.current = null
			setIsDragging(false)
		}, [stopAnimation])

		const handlePointerRelease = useCallback(
			(event: PointerEvent<HTMLDivElement>) => {
				if (isPreviewOpen) return

				const viewport = viewportRef.current
				const dragState = dragStateRef.current
				if (!dragState || dragState.pointerId !== event.pointerId) return

				if (dragState.hasMoved) {
					suppressClickRef.current = true
					if (suppressClickTimeoutRef.current != null) {
						window.clearTimeout(suppressClickTimeoutRef.current)
					}
					suppressClickTimeoutRef.current = window.setTimeout(() => {
						suppressClickRef.current = false
						suppressClickTimeoutRef.current = null
					}, 0)
				}

				dragStateRef.current = null
				setIsDragging(false)
				if (viewport?.hasPointerCapture(event.pointerId)) {
					viewport.releasePointerCapture(event.pointerId)
				}
			},
			[isPreviewOpen],
		)

		const handleCanvasClickCapture = useCallback(
			(event: MouseEvent<HTMLDivElement>) => {
				if (isPreviewOpen) return

				if (!suppressClickRef.current) return

				suppressClickRef.current = false
				if (suppressClickTimeoutRef.current != null) {
					window.clearTimeout(suppressClickTimeoutRef.current)
					suppressClickTimeoutRef.current = null
				}
				event.preventDefault()
				event.stopPropagation()
			},
			[isPreviewOpen],
		)

		const {
			canvasScale,
			canZoomIn,
			canZoomOut,
			handleControlMove,
			handleResetView,
			handleZoomIn,
			handleZoomOut,
			setCanvasScale,
		} = useSlidesTemplateCanvasNavigation({
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

		useEffect(() => {
			if (!isPreviewOpen) return

			const viewport = viewportRef.current
			const activePointerId = dragStateRef.current?.pointerId
			stopAnimation()
			dragStateRef.current = null
			setIsDragging(false)
			if (activePointerId != null && viewport?.hasPointerCapture(activePointerId)) {
				viewport.releasePointerCapture(activePointerId)
			}
		}, [isPreviewOpen, stopAnimation])

		useLayoutEffect(() => {
			velocityRef.current = { x: 0, y: 0 }
			lastLoadMoreAtRef.current = 0
			lastAutoLoadTemplateCountRef.current = -1
			dragStateRef.current = null
			suppressClickRef.current = false
			setIsDragging(false)
			setPreviewFocus(null)
			setCanvasOffset({ x: 0, y: 0 })
		}, [resetKey, setCanvasOffset])

		useLayoutEffect(() => {
			setCanvasOffset(offsetRef.current)
		}, [setCanvasOffset, viewportInsetsKey])

		useEffect(() => {
			onPreviewOpenChange?.(previewFocus !== null)
		}, [onPreviewOpenChange, previewFocus])

		useEffect(() => {
			return () => {
				dragStateRef.current = null
				if (suppressClickTimeoutRef.current != null) {
					window.clearTimeout(suppressClickTimeoutRef.current)
					suppressClickTimeoutRef.current = null
				}
				stopAnimation()
			}
		}, [stopAnimation])

		function handlePreviewToggle(anchorTileId: string, tile: SlidesTemplateCanvasTile) {
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
				visibleCanvasItems={visibleCanvasItems}
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
