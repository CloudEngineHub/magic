import type { Canvas } from "../../core/Canvas"
import { ElementTypeEnum, type LayerElement } from "../../document/types"
import type { Rect } from "../../shared/ids"
import type { ImageResourceLoadPriority, ImageResourceVariant } from "../image/ImageResourceManager"
import {
	type ImagePresentationPhase,
	type ImagePresentationTarget,
} from "../image/CanvasImagePresentationScheduler"
import {
	decideImageDisplayViewingLevel,
	type MediaDisplayResourceVariant,
} from "./CanvasMediaViewingPolicy"
import { getViewportCanvasRect } from "../../shared/placement/elementUtils"
import { toCanonicalCanvasResourcePath } from "../../shared/path/canvasResourcePath"
import type { ResourceLoadFailureReason } from "../media-common/resourceLoadFailure"
import {
	CanvasRenderVisibilityController,
	type CanvasRenderVisibilityStrategy,
} from "./CanvasRenderVisibilityController"

type VisibilityState = "visible" | "near" | "far"
export type DecodedImageRetentionVisibilityState = Extract<VisibilityState, "visible" | "near">

export interface DecodedImageRetentionHint {
	elementId: string
	path: string
	visibilityState: DecodedImageRetentionVisibilityState
	requestedVariant?: ImageResourceVariant
	displayedVariant?: ImageResourceVariant
	screenLongEdge: number
	lastSeenAt: number
}

interface RegisteredImageElement {
	elementId: string
	path: string
}

interface RegisteredVideoElement {
	elementId: string
	path: string
}

interface LoadCandidateBase {
	elementId: string
	path: string
	priority: ImageResourceLoadPriority
	visibilityState: VisibilityState
	screenArea: number
	screenLongEdge: number
	distanceToViewportCenter: number
}

interface ImageLoadCandidate extends LoadCandidateBase {
	variant: ImageResourceVariant
	frameAdjustedBounds?: Rect
	frameVisibleBounds?: Rect
}

type VideoLoadTier = "url" | "poster"

interface VideoLoadCandidate extends LoadCandidateBase {
	tier: VideoLoadTier
	frameAdjustedBounds?: Rect
	frameVisibleBounds?: Rect
}

export interface CanvasVisibilitySnapshot {
	registeredImageCount: number
	registeredVideoCount: number
	registerDedupedCount: number
	videoRegisterDedupedCount: number
	lowFallbackPreviewCount: number
	visibleImageCount: number
	nearImageCount: number
	farImageCount: number
	visibleVideoCount: number
	nearVideoCount: number
	farVideoCount: number
	lastQueryDurationMs: number
	lastRequestedVisibleCount: number
	lastRequestedNearCount: number
	lastRequestedVisibleVideoCount: number
	lastRequestedNearVideoCount: number
	lowDetailVisibleVideoCount: number
	pendingLowDetailVisibleVideoLoadCandidateCount: number
	pendingImageLoadCandidateCount: number
	pendingVideoLoadCandidateCount: number
	drainScheduledCount: number
	drainRunCount: number
	lastViewportScale: number
	lastViewportWidth: number
	lastViewportHeight: number
	skippedViewportQueryCount: number
	queryCount: number
}

const NEAR_VIEWPORT_PADDING_RATIO = 2
const MIN_VISIBLE_SCREEN_LONG_EDGE_FOR_LOAD = 64
const MIN_NEAR_SCREEN_LONG_EDGE_FOR_LOAD = 96
const LOW_DETAIL_VISIBLE_FALLBACK_LIMIT = 48
const MAX_VISIBLE_LOAD_REQUESTS_PER_QUERY = 96
const MAX_NEAR_LOAD_REQUESTS_PER_QUERY = 48
const MAX_FULL_LOAD_REQUESTS_PER_REFRESH = 4
const MAX_FULL_LOADING_REQUESTS = 4
const BACKGROUND_IMAGE_LOAD_REQUESTS_PER_REFRESH = 12
const MIN_VISIBLE_VIDEO_SCREEN_LONG_EDGE_FOR_LOAD = 96
const MIN_NEAR_VIDEO_SCREEN_LONG_EDGE_FOR_LOAD = 160
const LOW_DETAIL_VISIBLE_VIDEO_FALLBACK_LIMIT = 4
const MAX_VISIBLE_VIDEO_LOAD_REQUESTS_PER_QUERY = 12
const MAX_NEAR_VIDEO_LOAD_REQUESTS_PER_QUERY = 6
const VISIBILITY_DRAIN_DELAY_MS = 80
const INITIAL_VISIBLE_CRITICAL_WINDOW_MS = 5000
const MAX_INITIAL_VISIBLE_CONTAINER_IMAGE_REQUESTS = 48
const VIEWPORT_MOVEMENT_SCALE_REFRESH_RATIO = 1.15
const IMAGE_VARIANT_SWITCH_COOLDOWN_MS = 450
const DECODED_IMAGE_RETENTION_GRACE_MS = 5000
const FAR_VISIBILITY_DRAIN_GRACE_MS = 3000
const CONTENT_LAYER_HIT_GRAPH_RESTORE_DELAY_MS = 160
const VIEWPORT_IDLE_MEDIA_DELAY_MS = 160
const VIEWPORT_IDLE_MEDIA_REFRESH_REASON = "viewport:idle-media"
const IMAGE_LOW_FALLBACK_REFRESH_REASON = "image:low-fallback"
// Current default: Konva-only far culling. Far elements stop participating in drawing / hit
// testing after the 3s drain, while image resources stay cached for fast return.
const FAR_KONVA_RENDER_VISIBILITY_STRATEGY: CanvasRenderVisibilityStrategy = "hidden"

interface RequestedImageLoadState {
	priority: ImageResourceLoadPriority
	variant: ImageResourceVariant
	requestedAt: number
}

interface RequestedVideoLoadState {
	priority: ImageResourceLoadPriority
	tier: VideoLoadTier
	requestedAt: number
}

interface ContainerRootCache {
	allContainerCount: number
	rootContainers: LayerElement[]
}

function now(): number {
	return typeof performance === "undefined" ? Date.now() : performance.now()
}

function expandRect(rect: Rect, padding: number): Rect {
	return {
		x: rect.x - padding,
		y: rect.y - padding,
		width: rect.width + padding * 2,
		height: rect.height + padding * 2,
	}
}

function getScaleBand(scale: number): number {
	if (scale < 0.05) return 0
	if (scale < 0.15) return 1
	if (scale < 0.5) return 2
	if (scale < 1) return 3
	return 4
}

function getRectCenter(rect: Rect): { x: number; y: number } {
	return {
		x: rect.x + rect.width / 2,
		y: rect.y + rect.height / 2,
	}
}

function getDistance(a: { x: number; y: number }, b: { x: number; y: number }): number {
	const dx = a.x - b.x
	const dy = a.y - b.y
	return Math.sqrt(dx * dx + dy * dy)
}

function getArea(rect: Rect): number {
	return Math.max(0, rect.width) * Math.max(0, rect.height)
}

function getImageVariantRank(variant: ImageResourceVariant): number {
	switch (variant) {
		case "full":
			return 2
		case "preview":
			return 1
		case "low":
		default:
			return 0
	}
}

function maxImageResourceVariant(
	variant: ImageResourceVariant,
	minVariant?: MediaDisplayResourceVariant,
): ImageResourceVariant {
	if (!minVariant) return variant
	return getImageVariantRank(minVariant) > getImageVariantRank(variant) ? minVariant : variant
}

function toMediaDisplayResourceVariant(variant: ImageResourceVariant): MediaDisplayResourceVariant {
	return variant === "low" ? "low" : "preview"
}

function getIntersectionRect(a: Rect, b: Rect): Rect | null {
	const x1 = Math.max(a.x, b.x)
	const y1 = Math.max(a.y, b.y)
	const x2 = Math.min(a.x + a.width, b.x + b.width)
	const y2 = Math.min(a.y + a.height, b.y + b.height)
	const width = x2 - x1
	const height = y2 - y1
	if (width <= 0 || height <= 0) return null
	return { x: x1, y: y1, width, height }
}

function sortCandidates(a: LoadCandidateBase, b: LoadCandidateBase): number {
	const priorityDiff = getPriorityRank(a.priority) - getPriorityRank(b.priority)
	if (priorityDiff !== 0) return priorityDiff
	const longEdgeDiff = b.screenLongEdge - a.screenLongEdge
	if (longEdgeDiff !== 0) return longEdgeDiff
	const areaDiff = b.screenArea - a.screenArea
	if (areaDiff !== 0) return areaDiff
	return a.distanceToViewportCenter - b.distanceToViewportCenter
}

function sortFullAdmissionCandidates(a: LoadCandidateBase, b: LoadCandidateBase): number {
	const priorityDiff = getPriorityRank(a.priority) - getPriorityRank(b.priority)
	if (priorityDiff !== 0) return priorityDiff
	const centerDiff = a.distanceToViewportCenter - b.distanceToViewportCenter
	if (centerDiff !== 0) return centerDiff
	const longEdgeDiff = b.screenLongEdge - a.screenLongEdge
	if (longEdgeDiff !== 0) return longEdgeDiff
	return b.screenArea - a.screenArea
}

function removeCandidatesByIds<T extends LoadCandidateBase>(
	candidates: T[],
	elementIds: Set<string>,
): void {
	for (let index = candidates.length - 1; index >= 0; index -= 1) {
		if (elementIds.has(candidates[index].elementId)) {
			candidates.splice(index, 1)
		}
	}
}

function getBackgroundImageLoadRequestBudget(reason: string): number | null {
	return reason === "visibility:drain" || reason === "visibility:variant-switch-cooldown"
		? BACKGROUND_IMAGE_LOAD_REQUESTS_PER_REFRESH
		: null
}

function getPriorityRank(priority: ImageResourceLoadPriority): number {
	switch (priority) {
		case "critical":
			return 0
		case "visible":
			return 1
		case "near":
			return 2
		case "background":
			return 3
		default:
			return 4
	}
}

function getVideoLoadTierRank(tier: VideoLoadTier): number {
	return tier === "poster" ? 0 : 1
}

function hasChildren(
	element: LayerElement,
): element is LayerElement & { children: LayerElement[] } {
	return "children" in element && Array.isArray((element as { children?: unknown }).children)
}

function isContainerElement(element: LayerElement): boolean {
	return element.type === ElementTypeEnum.Frame || element.type === ElementTypeEnum.Group
}

function isClippingContainer(element: LayerElement): boolean {
	return element.type === ElementTypeEnum.Frame
}

function isViewportMovementReason(reason: string): boolean {
	return reason === "viewport:pan" || reason === "viewport:scale"
}

function isViewportResourceBoundReason(reason: string): boolean {
	return reason.startsWith("viewport:")
}

export class CanvasVisibilityManager {
	private readonly canvas: Canvas
	private readonly registeredImages = new Map<string, RegisteredImageElement>()
	private readonly registeredVideos = new Map<string, RegisteredVideoElement>()
	private readonly lastVisibilityState = new Map<string, VisibilityState>()
	private readonly lastVideoVisibilityState = new Map<string, VisibilityState>()
	private readonly lastRequestedLoadState = new Map<string, RequestedImageLoadState>()
	private readonly lowFallbackPreviewPathByElementId = new Map<string, string>()
	private readonly lastRequestedVideoLoadState = new Map<string, RequestedVideoLoadState>()
	private readonly lastContainerDisplayVariant = new Map<string, MediaDisplayResourceVariant>()
	private readonly imageRetentionHints = new Map<string, DecodedImageRetentionHint>()
	private rafId: number | null = null
	private drainTimerId: ReturnType<typeof setTimeout> | null = null
	private farVisibilityDrainTimerId: ReturnType<typeof setTimeout> | null = null
	private contentLayerHitGraphRestoreTimerId: ReturnType<typeof setTimeout> | null = null
	private variantSwitchCooldownTimerId: ReturnType<typeof setTimeout> | null = null
	private viewportIdleMediaTimerId: ReturnType<typeof setTimeout> | null = null
	private scheduledForce = false
	private scheduledReason = "unknown"
	private lastQueryCoverRect: Rect | null = null
	private lastScaleBand: number | null = null
	private lastQueryViewportScale: number | null = null
	private containerRootCache: ContainerRootCache | null = null
	private destroyed = false
	private lastViewportMovementAt = now()
	private imagePresentationPhase: ImagePresentationPhase = "idle"
	/**
	 * 以媒体 path 为粒度共享取消信号。不能按每次 pan 全量 abort：同一资源在连续拖动中
	 * 往往仍位于 visible / near 区，应该复用其在飞请求。
	 */
	private viewportResourceAbortControllers = new Map<string, AbortController>()
	private contentLayerHitGraphSuppressed = false
	private contentLayerPreviousListening: boolean | null = null
	private readonly renderVisibilityController: CanvasRenderVisibilityController
	private initialVisibleCriticalUntil = now() + INITIAL_VISIBLE_CRITICAL_WINDOW_MS
	private statsSnapshot: CanvasVisibilitySnapshot = {
		registeredImageCount: 0,
		registeredVideoCount: 0,
		registerDedupedCount: 0,
		videoRegisterDedupedCount: 0,
		lowFallbackPreviewCount: 0,
		visibleImageCount: 0,
		nearImageCount: 0,
		farImageCount: 0,
		visibleVideoCount: 0,
		nearVideoCount: 0,
		farVideoCount: 0,
		lastQueryDurationMs: 0,
		lastRequestedVisibleCount: 0,
		lastRequestedNearCount: 0,
		lastRequestedVisibleVideoCount: 0,
		lastRequestedNearVideoCount: 0,
		lowDetailVisibleVideoCount: 0,
		pendingLowDetailVisibleVideoLoadCandidateCount: 0,
		pendingImageLoadCandidateCount: 0,
		pendingVideoLoadCandidateCount: 0,
		drainScheduledCount: 0,
		drainRunCount: 0,
		lastViewportScale: 1,
		lastViewportWidth: 0,
		lastViewportHeight: 0,
		skippedViewportQueryCount: 0,
		queryCount: 0,
	}

	private readonly handleViewportPan = (): void => {
		const currentTime = now()
		this.lastViewportMovementAt = currentTime
		this.markViewportMoving(currentTime)
		this.suppressContentLayerHitGraphDuringViewportMovement()
		this.scheduleRefresh("viewport:pan", false)
	}

	private readonly handleViewportScale = (): void => {
		const currentTime = now()
		this.lastViewportMovementAt = currentTime
		this.markViewportMoving(currentTime)
		this.suppressContentLayerHitGraphDuringViewportMovement()
		this.scheduleRefresh("viewport:scale", true)
	}

	private readonly handleViewportChanged = (event: {
		data: { phase: "start" | "move" | "end" }
	}): void => {
		if (event.data.phase !== "end") return
		this.markViewportIdle()
	}

	private readonly handleElementChange = (): void => {
		this.invalidateContainerRootCache()
		this.scheduleRefresh("element:change", true)
	}

	private readonly handleDocumentLoaded = (): void => {
		this.invalidateContainerRootCache()
		this.initialVisibleCriticalUntil = now() + INITIAL_VISIBLE_CRITICAL_WINDOW_MS
		this.scheduleRefresh("document:loaded", true)
	}

	private readonly handleImageResourceLoaded = (event: {
		data: { path: string; resource: { variant: ImageResourceVariant } }
	}): void => {
		if (event.data.resource.variant === "low") {
			this.lowFallbackPreviewPathByElementId.forEach((path, elementId) => {
				if (this.isSameResourcePath(path, event.data.path)) {
					this.lowFallbackPreviewPathByElementId.delete(elementId)
				}
			})
		}
	}

	private readonly handleVideoResourceLoadFailed = (event: { data: { path: string } }): void => {
		this.registeredVideos.forEach((registered, elementId) => {
			if (!this.isSameResourcePath(registered.path, event.data.path)) return
			this.lastRequestedVideoLoadState.delete(elementId)
		})
	}

	private readonly handleImageVariantLoadFailed = (event: {
		data: {
			path: string
			variant: ImageResourceVariant
			reason?: ResourceLoadFailureReason
		}
	}): void => {
		if (this.destroyed || event.data.variant !== "low") {
			return
		}

		let fallbackTargetChanged = false
		this.registeredImages.forEach((registered, elementId) => {
			if (!this.isSameResourcePath(registered.path, event.data.path)) return
			const visibilityState = this.lastVisibilityState.get(elementId)
			if (visibilityState !== "visible") return
			if (!this.canvas.elementManager.isElementVisibleInDataTree(elementId)) return
			if (this.lowFallbackPreviewPathByElementId.get(elementId) === registered.path) {
				return
			}
			this.lowFallbackPreviewPathByElementId.set(elementId, registered.path)
			this.statsSnapshot.lowFallbackPreviewCount += 1
			fallbackTargetChanged = true
		})
		if (fallbackTargetChanged && this.imagePresentationPhase === "idle") {
			this.scheduleRefresh(IMAGE_LOW_FALLBACK_REFRESH_REASON, true)
		}
	}

	constructor(options: { canvas: Canvas }) {
		this.canvas = options.canvas
		this.renderVisibilityController = new CanvasRenderVisibilityController({
			canvas: this.canvas,
			strategy: FAR_KONVA_RENDER_VISIBILITY_STRATEGY,
		})
		this.canvas.eventEmitter.on("viewport:pan", this.handleViewportPan)
		this.canvas.eventEmitter.on("viewport:scale", this.handleViewportScale)
		this.canvas.eventEmitter.on("viewport:changed", this.handleViewportChanged)
		this.canvas.eventEmitter.on("element:change", this.handleElementChange)
		this.canvas.eventEmitter.on("document:loaded", this.handleDocumentLoaded)
		this.canvas.eventEmitter.on("resource:image:loaded", this.handleImageResourceLoaded)
		this.canvas.eventEmitter.on(
			"resource:video:load-failed",
			this.handleVideoResourceLoadFailed,
		)
		this.canvas.eventEmitter.on(
			"resource:image:variant-load-failed",
			this.handleImageVariantLoadFailed,
		)
	}

	public registerImageElement(elementId: string, path: string): void {
		if (this.destroyed) return
		const current = this.registeredImages.get(elementId)
		if (current && this.isSameResourcePath(current.path, path)) {
			this.statsSnapshot.registerDedupedCount += 1
			return
		}
		this.registeredImages.set(elementId, { elementId, path })
		if (current) {
			this.cancelViewportResourceSignalIfUnused("image", current.path, this.registeredImages)
			this.canvas.imagePresentationScheduler.removeTarget(elementId)
		}
		this.lastVisibilityState.delete(elementId)
		this.lastRequestedLoadState.delete(elementId)
		this.lowFallbackPreviewPathByElementId.delete(elementId)
		this.imageRetentionHints.delete(elementId)
		this.scheduleRefresh("image:register", true)
	}

	public unregisterImageElement(elementId: string): void {
		const registered = this.registeredImages.get(elementId)
		if (!registered) return
		this.registeredImages.delete(elementId)
		this.cancelViewportResourceSignalIfUnused("image", registered.path, this.registeredImages)
		this.lastVisibilityState.delete(elementId)
		this.lastRequestedLoadState.delete(elementId)
		this.lowFallbackPreviewPathByElementId.delete(elementId)
		this.imageRetentionHints.delete(elementId)
		this.canvas.imagePresentationScheduler.removeTarget(elementId)
		this.scheduleRefresh("image:unregister", true)
	}

	public updateImageElement(elementId: string, path: string | null | undefined): void {
		if (!path) {
			this.unregisterImageElement(elementId)
			return
		}

		const current = this.registeredImages.get(elementId)
		if (current?.path === path) return
		this.registerImageElement(elementId, path)
	}

	public registerVideoElement(elementId: string, path: string): void {
		if (this.destroyed) return
		const current = this.registeredVideos.get(elementId)
		if (current && this.isSameResourcePath(current.path, path)) {
			this.statsSnapshot.videoRegisterDedupedCount += 1
			return
		}
		this.registeredVideos.set(elementId, { elementId, path })
		this.lastVideoVisibilityState.delete(elementId)
		this.lastRequestedVideoLoadState.delete(elementId)
		this.scheduleRefresh("video:register", true)
	}

	public unregisterVideoElement(elementId: string): void {
		const registered = this.registeredVideos.get(elementId)
		if (!registered) return
		this.registeredVideos.delete(elementId)
		this.cancelViewportResourceSignalIfUnused("video", registered.path, this.registeredVideos)
		this.lastVideoVisibilityState.delete(elementId)
		this.lastRequestedVideoLoadState.delete(elementId)
		this.scheduleRefresh("video:unregister", true)
	}

	public updateVideoElement(elementId: string, path: string | null | undefined): void {
		if (!path) {
			this.unregisterVideoElement(elementId)
			return
		}

		const current = this.registeredVideos.get(elementId)
		if (current?.path === path) return
		this.registerVideoElement(elementId, path)
	}

	public requestImmediateImageLoad(
		elementId: string,
		options?: { reason?: string; priority?: ImageResourceLoadPriority },
	): void {
		const registered = this.registeredImages.get(elementId)
		if (!registered) {
			return
		}
		const priority = options?.priority ?? "critical"
		this.requestImageLoad(
			{
				elementId,
				path: registered.path,
				priority,
				variant: "preview",
				visibilityState: "visible",
				screenArea: 0,
				screenLongEdge: 0,
				distanceToViewportCenter: 0,
			},
			options?.reason ?? "immediate",
			true,
		)
	}

	public requestImmediateMediaLoadForElements(
		elementIds: string[],
		options?: {
			reason?: string
			priority?: ImageResourceLoadPriority
			includeDirectImages?: boolean
			maxImageCount?: number
		},
	): void {
		if (this.destroyed || elementIds.length === 0) return

		const reason = options?.reason ?? "immediate-elements"
		const priority = options?.priority ?? "critical"
		const includeDirectImages = options?.includeDirectImages ?? true
		const maxImageCount = options?.maxImageCount ?? 48
		const imageIds: string[] = []
		const visited = new Set<string>()
		const queued = new Set<string>()

		const visit = (elementId: string, isRoot: boolean): void => {
			if (imageIds.length >= maxImageCount) {
				return
			}
			if (visited.has(elementId)) {
				return
			}
			visited.add(elementId)

			if (!this.canvas.elementManager.isElementVisibleInDataTree(elementId)) {
				return
			}

			const element = this.canvas.elementManager.getElementData(elementId)
			if (!element) {
				return
			}

			if (element.type === ElementTypeEnum.Image) {
				if (!isRoot || includeDirectImages) {
					this.queueImmediateImageElement(element, imageIds, queued, maxImageCount)
				}
				return
			}

			if (
				(element.type === ElementTypeEnum.Frame ||
					element.type === ElementTypeEnum.Group) &&
				Array.isArray(element.children)
			) {
				element.children.forEach((child) => visit(child.id, false))
			}
		}

		elementIds.forEach((elementId) => visit(elementId, true))
		imageIds.forEach((imageId) => {
			this.requestImmediateImageLoad(imageId, { reason, priority })
		})
	}

	public invalidateImageLoadRequest(
		path: string,
		variant?: ImageResourceVariant,
		reason = "resource-invalidated",
		options?: { scheduleRefresh?: boolean },
	): void {
		if (this.destroyed) return

		let matched = false
		this.registeredImages.forEach((registered, elementId) => {
			if (!this.isSameResourcePath(registered.path, path)) return

			const previousState = this.lastRequestedLoadState.get(elementId)
			if (variant) {
				if (!previousState || previousState.variant !== variant) return
			}

			matched = true
			if (previousState) {
				this.lastRequestedLoadState.delete(elementId)
			}
		})

		if (matched && options?.scheduleRefresh !== false) {
			this.scheduleRefresh(`image:load-request-invalidated:${reason}`, true)
		}
	}

	public getSnapshot(): CanvasVisibilitySnapshot {
		return { ...this.statsSnapshot }
	}

	public destroy(): void {
		this.destroyed = true
		if (this.rafId !== null && typeof cancelAnimationFrame !== "undefined") {
			cancelAnimationFrame(this.rafId)
		}
		if (this.drainTimerId !== null) {
			clearTimeout(this.drainTimerId)
		}
		if (this.farVisibilityDrainTimerId !== null) {
			clearTimeout(this.farVisibilityDrainTimerId)
		}
		if (this.contentLayerHitGraphRestoreTimerId !== null) {
			clearTimeout(this.contentLayerHitGraphRestoreTimerId)
		}
		if (this.variantSwitchCooldownTimerId !== null) {
			clearTimeout(this.variantSwitchCooldownTimerId)
		}
		if (this.viewportIdleMediaTimerId !== null) {
			clearTimeout(this.viewportIdleMediaTimerId)
		}
		this.rafId = null
		this.drainTimerId = null
		this.farVisibilityDrainTimerId = null
		this.contentLayerHitGraphRestoreTimerId = null
		this.variantSwitchCooldownTimerId = null
		this.viewportIdleMediaTimerId = null
		this.restoreContentLayerHitGraph()
		this.registeredImages.clear()
		this.registeredVideos.clear()
		this.lastVisibilityState.clear()
		this.lastVideoVisibilityState.clear()
		this.lastRequestedLoadState.clear()
		this.lowFallbackPreviewPathByElementId.clear()
		this.lastRequestedVideoLoadState.clear()
		this.lastContainerDisplayVariant.clear()
		this.imageRetentionHints.clear()
		const controllers = this.getViewportResourceAbortControllers()
		controllers.forEach((controller) => controller.abort())
		controllers.clear()
		this.renderVisibilityController.restoreAll()
		this.canvas.eventEmitter.off("viewport:pan", this.handleViewportPan)
		this.canvas.eventEmitter.off("viewport:scale", this.handleViewportScale)
		this.canvas.eventEmitter.off("viewport:changed", this.handleViewportChanged)
		this.canvas.eventEmitter.off("element:change", this.handleElementChange)
		this.canvas.eventEmitter.off("document:loaded", this.handleDocumentLoaded)
		this.canvas.eventEmitter.off("resource:image:loaded", this.handleImageResourceLoaded)
		this.canvas.eventEmitter.off(
			"resource:video:load-failed",
			this.handleVideoResourceLoadFailed,
		)
		this.canvas.eventEmitter.off(
			"resource:image:variant-load-failed",
			this.handleImageVariantLoadFailed,
		)
	}

	private isSameResourcePath(left: string, right: string): boolean {
		const resolveAbsolutePath =
			this.canvas.magicConfigManager.config?.methods?.resolveAbsolutePath
		return (
			toCanonicalCanvasResourcePath(left, resolveAbsolutePath) ===
			toCanonicalCanvasResourcePath(right, resolveAbsolutePath)
		)
	}

	private getViewportResourceSignal(mediaType: "image" | "video", path: string): AbortSignal {
		const key = this.getViewportResourceAbortKey(mediaType, path)
		const controllers = this.getViewportResourceAbortControllers()
		let controller = controllers.get(key)
		if (!controller || controller.signal.aborted) {
			controller = new AbortController()
			controllers.set(key, controller)
		}
		return controller.signal
	}

	private getViewportResourceAbortKey(mediaType: "image" | "video", path: string): string {
		const resolveAbsolutePath =
			this.canvas.magicConfigManager?.config?.methods?.resolveAbsolutePath
		return `${mediaType}\0${toCanonicalCanvasResourcePath(path, resolveAbsolutePath)}`
	}

	private cancelFarViewportResourceSignals(activeKeys: Set<string>): void {
		const controllers = this.getViewportResourceAbortControllers()
		const cancelledKeys = new Set<string>()
		controllers.forEach((controller, key) => {
			if (activeKeys.has(key)) return
			controller.abort()
			controllers.delete(key)
			cancelledKeys.add(key)
		})
		this.clearViewportResourceLoadRequestStates(cancelledKeys)
	}

	private clearViewportResourceLoadRequestStates(resourceKeys: ReadonlySet<string>): void {
		if (resourceKeys.size === 0) return
		const clearMatchingStates = <T extends RegisteredImageElement | RegisteredVideoElement>(
			registered: Map<string, T>,
			requestedStates: Map<string, unknown>,
			mediaType: "image" | "video",
		): void => {
			registered.forEach((resource, elementId) => {
				if (!resourceKeys.has(this.getViewportResourceAbortKey(mediaType, resource.path))) {
					return
				}
				requestedStates.delete(elementId)
			})
		}

		clearMatchingStates(this.registeredImages, this.lastRequestedLoadState, "image")
		clearMatchingStates(this.registeredVideos, this.lastRequestedVideoLoadState, "video")
	}

	private cancelViewportResourceSignalIfUnused(
		mediaType: "image" | "video",
		path: string,
		registered: Map<string, RegisteredImageElement | RegisteredVideoElement>,
	): void {
		const key = this.getViewportResourceAbortKey(mediaType, path)
		const stillRegistered = Array.from(registered.values()).some(
			(resource) => this.getViewportResourceAbortKey(mediaType, resource.path) === key,
		)
		if (stillRegistered) return
		const controllers = this.getViewportResourceAbortControllers()
		const controller = controllers.get(key)
		controller?.abort()
		controllers.delete(key)
	}

	private getViewportResourceAbortControllers(): Map<string, AbortController> {
		if (!(this.viewportResourceAbortControllers instanceof Map)) {
			this.viewportResourceAbortControllers = new Map()
		}
		return this.viewportResourceAbortControllers
	}

	private queueImmediateImageElement(
		element: LayerElement,
		imageIds: string[],
		queued: Set<string>,
		maxImageCount: number,
	): void {
		if (imageIds.length >= maxImageCount) return
		if (element.type !== ElementTypeEnum.Image || !element.src) {
			return
		}
		if (!this.registeredImages.has(element.id)) {
			return
		}
		if (queued.has(element.id)) {
			return
		}

		queued.add(element.id)
		imageIds.push(element.id)
	}

	private scheduleRefresh(reason: string, force: boolean): void {
		if (this.destroyed) return
		if (reason === "visibility:drain") {
			this.statsSnapshot.drainRunCount += 1
		}
		this.scheduledForce = this.scheduledForce || force
		this.scheduledReason = reason
		if (this.rafId !== null) return

		const schedule =
			typeof requestAnimationFrame === "function"
				? requestAnimationFrame
				: (callback: FrameRequestCallback) => window.setTimeout(callback, 16)

		this.rafId = schedule(() => {
			this.rafId = null
			const shouldForce = this.scheduledForce
			const scheduledReason = this.scheduledReason
			this.scheduledForce = false
			this.refreshVisibility(scheduledReason, shouldForce)
		})
	}

	private scheduleVariantSwitchCooldownRefresh(delayMs: number): void {
		if (this.destroyed || this.variantSwitchCooldownTimerId !== null) return

		this.variantSwitchCooldownTimerId = setTimeout(
			() => {
				this.variantSwitchCooldownTimerId = null
				this.scheduleRefresh("visibility:variant-switch-cooldown", true)
			},
			Math.max(0, delayMs),
		)
	}

	private markViewportMoving(currentTime = now()): void {
		this.imagePresentationPhase = "moving"
		this.lastViewportMovementAt = currentTime
		if (this.viewportIdleMediaTimerId !== null) {
			clearTimeout(this.viewportIdleMediaTimerId)
		}
		this.viewportIdleMediaTimerId = setTimeout(() => {
			this.viewportIdleMediaTimerId = null
			if (this.destroyed) return
			this.markViewportIdle()
		}, VIEWPORT_IDLE_MEDIA_DELAY_MS)
	}

	private markViewportIdle(): void {
		if (this.viewportIdleMediaTimerId !== null) {
			clearTimeout(this.viewportIdleMediaTimerId)
			this.viewportIdleMediaTimerId = null
		}
		if (this.imagePresentationPhase === "idle") return
		this.imagePresentationPhase = "idle"
		this.scheduleRefresh(VIEWPORT_IDLE_MEDIA_REFRESH_REASON, true)
	}

	private resolveImageCandidateForPresentationPhase(
		candidate: ImageLoadCandidate,
	): ImageLoadCandidate {
		if (this.imagePresentationPhase === "idle") {
			// Some formats cannot produce the low derivative. Keep the fallback declarative so
			// moving still stays low-only and idle can promote the same active target to preview.
			const fallbackPath = this.lowFallbackPreviewPathByElementId.get(candidate.elementId)
			if (
				candidate.variant === "low" &&
				fallbackPath &&
				this.isSameResourcePath(fallbackPath, candidate.path)
			) {
				return { ...candidate, variant: "preview" }
			}
			return candidate
		}
		return {
			...candidate,
			variant: this.getDisplayedImageVariant(candidate.elementId) ?? "low",
		}
	}

	private shouldSkipViewportMovementQuery(options: {
		reason: string
		force: boolean
		viewportRect: Rect
		viewportScale: number
		scaleBand: number
	}): boolean {
		const { reason, force, viewportRect, viewportScale, scaleBand } = options
		if (
			isViewportMovementReason(reason) &&
			this.renderVisibilityController.getCulledCount() > 0
		) {
			return false
		}
		if (!this.lastQueryCoverRect || this.lastScaleBand !== scaleBand) return false
		if (!this.canvas.geometryCacheManager.containsRect(this.lastQueryCoverRect, viewportRect)) {
			return false
		}
		if (!force) {
			return true
		}
		if (reason !== "viewport:pan" && reason !== "viewport:scale") return false
		if (!this.lastQueryViewportScale || this.lastQueryViewportScale <= 0) return false

		const scaleRatio = viewportScale / this.lastQueryViewportScale
		return (
			scaleRatio >= 1 / VIEWPORT_MOVEMENT_SCALE_REFRESH_RATIO &&
			scaleRatio <= VIEWPORT_MOVEMENT_SCALE_REFRESH_RATIO
		)
	}

	private invalidateContainerRootCache(): void {
		this.containerRootCache = null
	}

	private getContainerRootCache(): ContainerRootCache {
		if (this.containerRootCache) return this.containerRootCache

		const allElements = this.canvas.elementManager.getAllElements()
		const nestedElementIds = new Set<string>()
		let allContainerCount = 0
		allElements.forEach((element) => {
			if (isContainerElement(element)) {
				allContainerCount += 1
			}
			if (!hasChildren(element)) return
			element.children.forEach((child) => nestedElementIds.add(child.id))
		})
		const rootContainers = allElements.filter(
			(element) => isContainerElement(element) && !nestedElementIds.has(element.id),
		)

		this.containerRootCache = {
			allContainerCount,
			rootContainers,
		}
		return this.containerRootCache
	}

	private getPreviousImageDisplayVariant(elementId: string): ImageResourceVariant | undefined {
		const previousVariant = this.lastRequestedLoadState.get(elementId)?.variant
		return previousVariant === "low" ||
			previousVariant === "preview" ||
			previousVariant === "full"
			? previousVariant
			: undefined
	}

	private getDisplayedImageVariant(elementId: string): ImageResourceVariant | undefined {
		const elementInstance = this.canvas.elementManager.getElementInstance(elementId)
		const getDisplayResourceVariant = (
			elementInstance as
				| {
						getDisplayResourceVariant?: () => ImageResourceVariant | undefined
				  }
				| undefined
		)?.getDisplayResourceVariant
		if (typeof getDisplayResourceVariant !== "function") return undefined
		return getDisplayResourceVariant.call(elementInstance)
	}

	private replaceImagePresentationTargets(candidates: ImageLoadCandidate[]): void {
		const targets: ImagePresentationTarget[] = candidates.map((candidate) => ({
			elementId: candidate.elementId,
			path: candidate.path,
			variant: candidate.variant,
			priority: candidate.priority,
			distanceToViewportCenter: candidate.distanceToViewportCenter,
		}))
		this.canvas.imagePresentationScheduler.replaceTargets(targets, this.imagePresentationPhase)
	}

	private updateImageRetentionHints(candidates: ImageLoadCandidate[], lastSeenAt: number): void {
		candidates.forEach((candidate) => {
			if (candidate.visibilityState !== "visible" && candidate.visibilityState !== "near") {
				return
			}
			const registered = this.registeredImages.get(candidate.elementId)
			if (!registered) return
			this.imageRetentionHints.set(candidate.elementId, {
				elementId: candidate.elementId,
				path: registered.path,
				visibilityState: candidate.visibilityState,
				requestedVariant: candidate.variant,
				displayedVariant: this.getDisplayedImageVariant(candidate.elementId),
				screenLongEdge: candidate.screenLongEdge,
				lastSeenAt,
			})
		})
	}

	private pruneExpiredImageRetentionHints(currentTime = now()): void {
		this.imageRetentionHints.forEach((hint, elementId) => {
			if (currentTime - hint.lastSeenAt > DECODED_IMAGE_RETENTION_GRACE_MS) {
				this.imageRetentionHints.delete(elementId)
			}
		})
	}

	public getDecodedImageRetentionSnapshot(): DecodedImageRetentionHint[] {
		this.pruneExpiredImageRetentionHints()
		return Array.from(this.imageRetentionHints.values(), (hint) => ({ ...hint }))
	}

	private refreshVisibility(reason: string, force: boolean): void {
		if (
			this.destroyed ||
			(this.registeredImages.size === 0 && this.registeredVideos.size === 0)
		) {
			return
		}

		const startedAt = now()
		const viewportRect = getViewportCanvasRect(this.canvas)
		const viewportScale = this.canvas.stage.scaleX() || 1
		const scaleBand = getScaleBand(viewportScale)
		const nearPadding =
			Math.max(viewportRect.width, viewportRect.height) * NEAR_VIEWPORT_PADDING_RATIO
		const queryCoverRect = expandRect(viewportRect, nearPadding)
		const farDrainReady =
			reason === "visibility:drain" &&
			startedAt - this.lastViewportMovementAt >= FAR_VISIBILITY_DRAIN_GRACE_MS

		if (
			this.shouldSkipViewportMovementQuery({
				reason,
				force,
				viewportRect,
				viewportScale,
				scaleBand,
			})
		) {
			this.refreshVisibleOnlyForSkippedViewportMovement({
				reason,
				startedAt,
				viewportRect,
				viewportScale,
			})
			this.statsSnapshot.skippedViewportQueryCount += 1
			return
		}

		this.lastQueryCoverRect = queryCoverRect
		this.lastScaleBand = scaleBand
		this.lastQueryViewportScale = viewportScale
		const rootElementIds = this.canvas.elementManager
			.getAllElements()
			.map((element) => element.id)
		const renderActiveRootIds = new Set(
			this.canvas.geometryCacheManager.queryElementIdsByExpandedRect(
				viewportRect,
				nearPadding,
				{ elementIds: rootElementIds },
			),
		)

		const registeredImageIds: string[] = []
		this.registeredImages.forEach((_, elementId) => {
			registeredImageIds.push(elementId)
		})
		const registeredVideoIds: string[] = []
		this.registeredVideos.forEach((_, elementId) => {
			registeredVideoIds.push(elementId)
		})
		const visibleIds = new Set(
			this.canvas.geometryCacheManager.queryElementIdsByExpandedRect(viewportRect, 0, {
				elementIds: registeredImageIds,
			}),
		)
		const nearIds = new Set(
			this.canvas.geometryCacheManager.queryElementIdsByExpandedRect(
				viewportRect,
				nearPadding,
				{ elementIds: registeredImageIds },
			),
		)
		visibleIds.forEach((elementId) => nearIds.delete(elementId))

		const visibleVideoIds = new Set(
			this.canvas.geometryCacheManager.queryElementIdsByExpandedRect(viewportRect, 0, {
				elementIds: registeredVideoIds,
			}),
		)
		const nearVideoIds = new Set(
			this.canvas.geometryCacheManager.queryElementIdsByExpandedRect(
				viewportRect,
				nearPadding,
				{ elementIds: registeredVideoIds },
			),
		)
		visibleVideoIds.forEach((elementId) => nearVideoIds.delete(elementId))

		const viewportCenter = getRectCenter(viewportRect)
		const promoteInitialVisibleLoads = this.shouldPromoteInitialVisibleLoads(reason)
		const visibleCandidates: ImageLoadCandidate[] = []
		const lowDetailVisibleCandidates: ImageLoadCandidate[] = []
		const nearCandidates: ImageLoadCandidate[] = []
		const visibleVideoCandidates: VideoLoadCandidate[] = []
		const lowDetailVisibleVideoCandidates: VideoLoadCandidate[] = []
		const nearVideoCandidates: VideoLoadCandidate[] = []

		visibleIds.forEach((elementId) => {
			const candidate = this.createCandidate(
				elementId,
				"visible",
				viewportScale,
				viewportCenter,
				promoteInitialVisibleLoads ? "critical" : undefined,
				viewportRect,
			)
			if (!candidate) return
			const displayCandidate = this.resolveImageCandidateForPresentationPhase(candidate)
			if (displayCandidate.screenLongEdge >= MIN_VISIBLE_SCREEN_LONG_EDGE_FOR_LOAD) {
				visibleCandidates.push(displayCandidate)
			} else {
				lowDetailVisibleCandidates.push(displayCandidate)
			}
		})

		nearIds.forEach((elementId) => {
			const candidate = this.createCandidate(
				elementId,
				"near",
				viewportScale,
				viewportCenter,
				undefined,
				viewportRect,
			)
			if (!candidate) return
			if (candidate.screenLongEdge >= MIN_NEAR_SCREEN_LONG_EDGE_FOR_LOAD) {
				nearCandidates.push(candidate)
			}
		})

		if (this.shouldScanVisibleContainerMedia(reason)) {
			const visibleContainerMediaCandidates = this.collectVisibleContainerMediaCandidates({
				reason,
				viewportRect,
				viewportScale,
				viewportCenter,
			})
			if (visibleContainerMediaCandidates.imageCandidates.length > 0) {
				const imageCandidates = visibleContainerMediaCandidates.imageCandidates.map(
					(candidate) => this.resolveImageCandidateForPresentationPhase(candidate),
				)
				const frameAdjustedImageIds = new Set(
					imageCandidates.map((candidate) => candidate.elementId),
				)
				removeCandidatesByIds(visibleCandidates, frameAdjustedImageIds)
				removeCandidatesByIds(lowDetailVisibleCandidates, frameAdjustedImageIds)
				removeCandidatesByIds(nearCandidates, frameAdjustedImageIds)
				visibleCandidates.push(...imageCandidates)
			}
			if (visibleContainerMediaCandidates.videoCandidates.length > 0) {
				const frameAdjustedVideoIds = new Set(
					visibleContainerMediaCandidates.videoCandidates.map(
						(candidate) => candidate.elementId,
					),
				)
				removeCandidatesByIds(visibleVideoCandidates, frameAdjustedVideoIds)
				removeCandidatesByIds(lowDetailVisibleVideoCandidates, frameAdjustedVideoIds)
				removeCandidatesByIds(nearVideoCandidates, frameAdjustedVideoIds)
				visibleVideoCandidates.push(...visibleContainerMediaCandidates.videoCandidates)
			}
		}

		const presentationCandidates =
			this.imagePresentationPhase === "moving"
				? [...visibleCandidates, ...lowDetailVisibleCandidates]
				: [...visibleCandidates, ...lowDetailVisibleCandidates, ...nearCandidates]
		this.replaceImagePresentationTargets(presentationCandidates)
		this.updateImageRetentionHints(presentationCandidates, startedAt)

		visibleVideoIds.forEach((elementId) => {
			const candidate = this.createVideoCandidate(
				elementId,
				"visible",
				viewportScale,
				viewportCenter,
				"poster",
			)
			if (!candidate) return
			if (candidate.screenLongEdge >= MIN_VISIBLE_VIDEO_SCREEN_LONG_EDGE_FOR_LOAD) {
				visibleVideoCandidates.push(candidate)
			} else {
				lowDetailVisibleVideoCandidates.push(candidate)
			}
		})

		nearVideoIds.forEach((elementId) => {
			const candidate = this.createVideoCandidate(
				elementId,
				"near",
				viewportScale,
				viewportCenter,
				"url",
			)
			if (!candidate) return
			if (candidate.screenLongEdge >= MIN_NEAR_VIDEO_SCREEN_LONG_EDGE_FOR_LOAD) {
				nearVideoCandidates.push(candidate)
			}
		})
		const pendingVisibleCandidates = visibleCandidates.filter((candidate) =>
			this.shouldRequestImageCandidate(candidate, { reason }),
		)
		const pendingLowDetailVisibleCandidates = lowDetailVisibleCandidates.filter((candidate) =>
			this.shouldRequestImageCandidate(candidate, { reason }),
		)
		const pendingNearCandidates = nearCandidates.filter((candidate) =>
			this.shouldRequestImageCandidate(candidate, { reason }),
		)
		const pendingVisibleVideoCandidates = visibleVideoCandidates.filter((candidate) =>
			this.shouldRequestVideoCandidate(candidate),
		)
		const pendingLowDetailVisibleVideoCandidates = lowDetailVisibleVideoCandidates.filter(
			(candidate) => this.shouldRequestVideoCandidate(candidate),
		)
		const pendingNearVideoCandidates = nearVideoCandidates.filter((candidate) =>
			this.shouldRequestVideoCandidate(candidate),
		)
		const shouldDeferNearLoads =
			this.imagePresentationPhase === "moving" || isViewportMovementReason(reason)

		const selectedImageLoads = this.selectImageCandidatesToLoad({
			pendingLowDetailVisibleCandidates,
			pendingNearCandidates,
			pendingVisibleCandidates,
			reason,
			shouldDeferNearLoads,
		})
		const admittedImageLoads = this.admitOrDowngradeFullCandidates([
			...selectedImageLoads.visibleToLoad,
			...selectedImageLoads.nearToLoad,
		])
		const visibleToLoad = admittedImageLoads.slice(0, selectedImageLoads.visibleToLoad.length)
		const nearToLoad = admittedImageLoads.slice(selectedImageLoads.visibleToLoad.length)
		const visibleVideosToLoad =
			pendingVisibleVideoCandidates.length > 0
				? pendingVisibleVideoCandidates
						.sort(sortCandidates)
						.slice(0, MAX_VISIBLE_VIDEO_LOAD_REQUESTS_PER_QUERY)
				: pendingLowDetailVisibleVideoCandidates
						.sort(sortCandidates)
						.slice(0, LOW_DETAIL_VISIBLE_VIDEO_FALLBACK_LIMIT)
		const nearVideosToLoad = shouldDeferNearLoads
			? []
			: pendingNearVideoCandidates
					.sort(sortCandidates)
					.slice(0, MAX_NEAR_VIDEO_LOAD_REQUESTS_PER_QUERY)

		visibleToLoad.forEach((candidate) => this.requestImageLoad(candidate, reason))
		nearToLoad.forEach((candidate) => this.requestImageLoad(candidate, reason))
		visibleVideosToLoad.forEach((candidate) => this.requestVideoLoad(candidate, reason))
		nearVideosToLoad.forEach((candidate) => this.requestVideoLoad(candidate, reason))

		const pendingImageLoadCandidateCount =
			pendingVisibleCandidates.length +
			pendingLowDetailVisibleCandidates.length +
			pendingNearCandidates.length
		const pendingVideoLoadCandidateCount =
			pendingVisibleVideoCandidates.length +
			pendingLowDetailVisibleVideoCandidates.length +
			pendingNearVideoCandidates.length
		const requestedImageLoadCount = visibleToLoad.length + nearToLoad.length
		const requestedVideoLoadCount = visibleVideosToLoad.length + nearVideosToLoad.length
		this.scheduleDrainIfNeeded({
			pendingImageLoadCandidateCount,
			pendingVideoLoadCandidateCount,
			requestedImageLoadCount,
			requestedVideoLoadCount,
		})

		if (isViewportMovementReason(reason)) {
			this.scheduleFarVisibilityDrain()
		}
		this.renderVisibilityController.sync({
			activeElementIds: renderActiveRootIds,
			allElementIds: rootElementIds,
			allowCullFar: farDrainReady,
		})
		let farCount = 0
		this.registeredImages.forEach((_, elementId) => {
			const state: VisibilityState = visibleIds.has(elementId)
				? "visible"
				: nearIds.has(elementId)
					? "near"
					: "far"
			this.lastVisibilityState.set(elementId, state)
			if (state === "far") farCount += 1
		})
		let farVideoCount = 0
		this.registeredVideos.forEach((_, elementId) => {
			const state: VisibilityState = visibleVideoIds.has(elementId)
				? "visible"
				: nearVideoIds.has(elementId)
					? "near"
					: "far"
			this.lastVideoVisibilityState.set(elementId, state)
			if (state === "far") farVideoCount += 1
		})
		const activeViewportResourceKeys = new Set<string>()
		const retainRegisteredResources = (
			registered: Map<string, RegisteredImageElement | RegisteredVideoElement>,
			elementIds: Set<string>,
			mediaType: "image" | "video",
		) => {
			elementIds.forEach((elementId) => {
				if (!this.canvas.elementManager.isElementVisibleInDataTree(elementId)) return
				const resource = registered.get(elementId)
				if (!resource) return
				activeViewportResourceKeys.add(
					this.getViewportResourceAbortKey(mediaType, resource.path),
				)
			})
		}
		const activeImageIds = new Set([...visibleIds, ...nearIds])
		const activeVideoIds = new Set([...visibleVideoIds, ...nearVideoIds])
		retainRegisteredResources(this.registeredImages, activeImageIds, "image")
		retainRegisteredResources(this.registeredVideos, activeVideoIds, "video")
		this.cancelFarViewportResourceSignals(activeViewportResourceKeys)
		if (farDrainReady) {
			const retainedVideoPaths = new Set<string>()
			activeVideoIds.forEach((elementId) => {
				const registered = this.registeredVideos.get(elementId)
				if (registered) retainedVideoPaths.add(registered.path)
			})
			this.canvas.videoResourceManager?.enforcePosterBudget?.(retainedVideoPaths)
		}

		const durationMs = now() - startedAt
		const previousSnapshot = this.statsSnapshot
		this.statsSnapshot = {
			registeredImageCount: this.registeredImages.size,
			registeredVideoCount: this.registeredVideos.size,
			registerDedupedCount: previousSnapshot.registerDedupedCount,
			videoRegisterDedupedCount: previousSnapshot.videoRegisterDedupedCount,
			lowFallbackPreviewCount: previousSnapshot.lowFallbackPreviewCount,
			visibleImageCount: visibleIds.size,
			nearImageCount: nearIds.size,
			farImageCount: farCount,
			visibleVideoCount: visibleVideoIds.size,
			nearVideoCount: nearVideoIds.size,
			farVideoCount,
			lastQueryDurationMs: durationMs,
			lastRequestedVisibleCount: visibleToLoad.length,
			lastRequestedNearCount: nearToLoad.length,
			lastRequestedVisibleVideoCount: visibleVideosToLoad.length,
			lastRequestedNearVideoCount: nearVideosToLoad.length,
			lowDetailVisibleVideoCount: lowDetailVisibleVideoCandidates.length,
			pendingLowDetailVisibleVideoLoadCandidateCount:
				pendingLowDetailVisibleVideoCandidates.length,
			pendingImageLoadCandidateCount,
			pendingVideoLoadCandidateCount,
			drainScheduledCount: previousSnapshot.drainScheduledCount,
			drainRunCount: previousSnapshot.drainRunCount,
			lastViewportScale: viewportScale,
			lastViewportWidth: viewportRect.width,
			lastViewportHeight: viewportRect.height,
			skippedViewportQueryCount: previousSnapshot.skippedViewportQueryCount,
			queryCount: previousSnapshot.queryCount + 1,
		}
	}

	private refreshVisibleOnlyForSkippedViewportMovement(options: {
		reason: string
		startedAt: number
		viewportRect: Rect
		viewportScale: number
	}): void {
		const { reason, startedAt, viewportRect, viewportScale } = options
		if (!isViewportMovementReason(reason)) return

		const registeredImageIds: string[] = []
		this.registeredImages.forEach((_, elementId) => {
			registeredImageIds.push(elementId)
		})
		const registeredVideoIds: string[] = []
		this.registeredVideos.forEach((_, elementId) => {
			registeredVideoIds.push(elementId)
		})

		const visibleIds = new Set(
			registeredImageIds.length > 0
				? this.canvas.geometryCacheManager.queryElementIdsByExpandedRect(viewportRect, 0, {
						elementIds: registeredImageIds,
					})
				: [],
		)
		const visibleVideoIds = new Set(
			registeredVideoIds.length > 0
				? this.canvas.geometryCacheManager.queryElementIdsByExpandedRect(viewportRect, 0, {
						elementIds: registeredVideoIds,
					})
				: [],
		)

		const viewportCenter = getRectCenter(viewportRect)
		const promoteInitialVisibleLoads = this.shouldPromoteInitialVisibleLoads(reason)
		const visibleCandidates: ImageLoadCandidate[] = []
		const lowDetailVisibleCandidates: ImageLoadCandidate[] = []
		const visibleVideoCandidates: VideoLoadCandidate[] = []
		const lowDetailVisibleVideoCandidates: VideoLoadCandidate[] = []

		visibleIds.forEach((elementId) => {
			const candidate = this.createCandidate(
				elementId,
				"visible",
				viewportScale,
				viewportCenter,
				promoteInitialVisibleLoads ? "critical" : undefined,
				viewportRect,
			)
			if (!candidate) return
			const displayCandidate = this.resolveImageCandidateForPresentationPhase(candidate)
			if (displayCandidate.screenLongEdge >= MIN_VISIBLE_SCREEN_LONG_EDGE_FOR_LOAD) {
				visibleCandidates.push(displayCandidate)
			} else {
				lowDetailVisibleCandidates.push(displayCandidate)
			}
		})

		visibleVideoIds.forEach((elementId) => {
			const candidate = this.createVideoCandidate(
				elementId,
				"visible",
				viewportScale,
				viewportCenter,
				"poster",
			)
			if (!candidate) return
			if (candidate.screenLongEdge >= MIN_VISIBLE_VIDEO_SCREEN_LONG_EDGE_FOR_LOAD) {
				visibleVideoCandidates.push(candidate)
			} else {
				lowDetailVisibleVideoCandidates.push(candidate)
			}
		})
		const presentationCandidates = [...visibleCandidates, ...lowDetailVisibleCandidates]
		this.replaceImagePresentationTargets(presentationCandidates)
		this.updateImageRetentionHints(presentationCandidates, startedAt)
		const pendingVisibleCandidates = visibleCandidates.filter((candidate) =>
			this.shouldRequestImageCandidate(candidate, { reason }),
		)
		const pendingLowDetailVisibleCandidates = lowDetailVisibleCandidates.filter((candidate) =>
			this.shouldRequestImageCandidate(candidate, { reason }),
		)
		const pendingVisibleVideoCandidates = visibleVideoCandidates.filter((candidate) =>
			this.shouldRequestVideoCandidate(candidate),
		)
		const pendingLowDetailVisibleVideoCandidates = lowDetailVisibleVideoCandidates.filter(
			(candidate) => this.shouldRequestVideoCandidate(candidate),
		)

		const selectedVisibleToLoad =
			pendingVisibleCandidates.length > 0
				? pendingVisibleCandidates
						.sort(sortCandidates)
						.slice(0, MAX_VISIBLE_LOAD_REQUESTS_PER_QUERY)
				: pendingLowDetailVisibleCandidates
						.sort(sortCandidates)
						.slice(0, LOW_DETAIL_VISIBLE_FALLBACK_LIMIT)
		const visibleToLoad = this.admitOrDowngradeFullCandidates(selectedVisibleToLoad)
		const visibleVideosToLoad =
			pendingVisibleVideoCandidates.length > 0
				? pendingVisibleVideoCandidates
						.sort(sortCandidates)
						.slice(0, MAX_VISIBLE_VIDEO_LOAD_REQUESTS_PER_QUERY)
				: pendingLowDetailVisibleVideoCandidates
						.sort(sortCandidates)
						.slice(0, LOW_DETAIL_VISIBLE_VIDEO_FALLBACK_LIMIT)

		visibleToLoad.forEach((candidate) => this.requestImageLoad(candidate, reason))
		visibleVideosToLoad.forEach((candidate) => this.requestVideoLoad(candidate, reason))

		const pendingImageLoadCandidateCount =
			pendingVisibleCandidates.length + pendingLowDetailVisibleCandidates.length
		const pendingVideoLoadCandidateCount =
			pendingVisibleVideoCandidates.length + pendingLowDetailVisibleVideoCandidates.length
		const requestedImageLoadCount = visibleToLoad.length
		const requestedVideoLoadCount = visibleVideosToLoad.length
		this.scheduleDrainIfNeeded({
			pendingImageLoadCandidateCount,
			pendingVideoLoadCandidateCount,
			requestedImageLoadCount,
			requestedVideoLoadCount,
		})
		this.scheduleFarVisibilityDrain()

		visibleIds.forEach((elementId) => {
			this.lastVisibilityState.set(elementId, "visible")
		})
		visibleVideoIds.forEach((elementId) => {
			this.lastVideoVisibilityState.set(elementId, "visible")
		})

		const durationMs = now() - startedAt
		const previousSnapshot = this.statsSnapshot
		this.statsSnapshot = {
			...previousSnapshot,
			visibleImageCount: visibleIds.size,
			visibleVideoCount: visibleVideoIds.size,
			lastQueryDurationMs: durationMs,
			lastRequestedVisibleCount: visibleToLoad.length,
			lastRequestedVisibleVideoCount: visibleVideosToLoad.length,
			pendingImageLoadCandidateCount,
			pendingVideoLoadCandidateCount,
			queryCount: previousSnapshot.queryCount + 1,
		}
	}

	private shouldRequestImageCandidate(
		candidate: ImageLoadCandidate,
		options?: { reason?: string },
	): boolean {
		const previousState = this.lastRequestedLoadState.get(candidate.elementId)
		if (!previousState) return true
		if (
			this.imagePresentationPhase === "moving" &&
			candidate.variant === "low" &&
			!this.getDisplayedImageVariant(candidate.elementId) &&
			previousState.variant !== "low"
		) {
			return true
		}
		const priorityImproved =
			getPriorityRank(previousState.priority) > getPriorityRank(candidate.priority)
		const elapsedSinceLastRequest = now() - previousState.requestedAt
		if (
			previousState.variant !== candidate.variant &&
			elapsedSinceLastRequest < IMAGE_VARIANT_SWITCH_COOLDOWN_MS
		) {
			if (
				(options?.reason === VIEWPORT_IDLE_MEDIA_REFRESH_REASON ||
					options?.reason === IMAGE_LOW_FALLBACK_REFRESH_REASON) &&
				getImageVariantRank(candidate.variant) > getImageVariantRank(previousState.variant)
			) {
				return true
			}
			if (!(priorityImproved && candidate.priority === "critical")) {
				this.scheduleVariantSwitchCooldownRefresh(
					IMAGE_VARIANT_SWITCH_COOLDOWN_MS - elapsedSinceLastRequest,
				)
			}
			return priorityImproved && candidate.priority === "critical"
		}
		return previousState.variant !== candidate.variant || priorityImproved
	}

	private shouldRequestVideoCandidate(candidate: VideoLoadCandidate): boolean {
		const previousState = this.lastRequestedVideoLoadState.get(candidate.elementId)
		if (!previousState) return true
		const tierImproved =
			getVideoLoadTierRank(previousState.tier) > getVideoLoadTierRank(candidate.tier)
		if (tierImproved) return true
		if (previousState.tier !== candidate.tier) return false
		return getPriorityRank(previousState.priority) > getPriorityRank(candidate.priority)
	}

	private selectImageCandidatesToLoad(options: {
		pendingVisibleCandidates: ImageLoadCandidate[]
		pendingLowDetailVisibleCandidates: ImageLoadCandidate[]
		pendingNearCandidates: ImageLoadCandidate[]
		reason: string
		shouldDeferNearLoads: boolean
	}): {
		visibleToLoad: ImageLoadCandidate[]
		nearToLoad: ImageLoadCandidate[]
		imageLoadRequestBudget: number | null
	} {
		const {
			pendingLowDetailVisibleCandidates,
			pendingNearCandidates,
			pendingVisibleCandidates,
			reason,
			shouldDeferNearLoads,
		} = options
		const imageLoadRequestBudget = getBackgroundImageLoadRequestBudget(reason)
		const visibleRequestLimit = imageLoadRequestBudget ?? MAX_VISIBLE_LOAD_REQUESTS_PER_QUERY
		const visibleToLoad =
			pendingVisibleCandidates.length > 0
				? pendingVisibleCandidates
						.sort(sortCandidates)
						.slice(
							0,
							Math.min(MAX_VISIBLE_LOAD_REQUESTS_PER_QUERY, visibleRequestLimit),
						)
				: pendingLowDetailVisibleCandidates
						.sort(sortCandidates)
						.slice(0, Math.min(LOW_DETAIL_VISIBLE_FALLBACK_LIMIT, visibleRequestLimit))
		const remainingImageRequestBudget =
			imageLoadRequestBudget === null
				? MAX_NEAR_LOAD_REQUESTS_PER_QUERY
				: Math.max(0, imageLoadRequestBudget - visibleToLoad.length)
		const nearToLoad =
			shouldDeferNearLoads || remainingImageRequestBudget <= 0
				? []
				: pendingNearCandidates
						.sort(sortCandidates)
						.slice(
							0,
							Math.min(MAX_NEAR_LOAD_REQUESTS_PER_QUERY, remainingImageRequestBudget),
						)

		return { imageLoadRequestBudget, nearToLoad, visibleToLoad }
	}

	private admitOrDowngradeFullCandidates(candidates: ImageLoadCandidate[]): ImageLoadCandidate[] {
		if (!candidates.some((candidate) => candidate.variant === "full")) return candidates

		const imageResourceManager = this.canvas.imageResourceManager as
			| {
					getFullAdmissionSnapshot?: () => {
						fullDecodedBytes: number
						fullLoadingCount: number
						fullBudgetBytes: number
					}
			  }
			| undefined
		const snapshot = imageResourceManager?.getFullAdmissionSnapshot?.()
		const fullLoadingCount = snapshot?.fullLoadingCount ?? 0
		const fullBudgetReached = snapshot
			? snapshot.fullDecodedBytes >= snapshot.fullBudgetBytes
			: false
		const refreshLimit = fullBudgetReached ? 1 : MAX_FULL_LOAD_REQUESTS_PER_REFRESH
		let remainingFullAdmissions = Math.max(
			0,
			Math.min(refreshLimit, MAX_FULL_LOADING_REQUESTS - fullLoadingCount),
		)
		const admittedFullCandidates = new Set(
			candidates
				.map((candidate, index) => ({ candidate, index }))
				.filter(({ candidate }) => candidate.variant === "full")
				.sort((left, right) => {
					const diff = sortFullAdmissionCandidates(left.candidate, right.candidate)
					return diff !== 0 ? diff : left.index - right.index
				})
				.slice(0, remainingFullAdmissions)
				.map(({ candidate }) => candidate),
		)
		remainingFullAdmissions = admittedFullCandidates.size

		return candidates.map((candidate) => {
			if (candidate.variant !== "full") return candidate
			if (admittedFullCandidates.has(candidate) && remainingFullAdmissions > 0) {
				remainingFullAdmissions -= 1
				return candidate
			}
			return {
				...candidate,
				variant: "preview",
			}
		})
	}

	private scheduleDrainIfNeeded(options: {
		pendingImageLoadCandidateCount: number
		pendingVideoLoadCandidateCount: number
		requestedImageLoadCount: number
		requestedVideoLoadCount: number
	}): void {
		if (this.destroyed || this.drainTimerId !== null) return
		const hasMoreImages =
			options.pendingImageLoadCandidateCount > options.requestedImageLoadCount
		const hasMoreVideos =
			options.pendingVideoLoadCandidateCount > options.requestedVideoLoadCount
		if (!hasMoreImages && !hasMoreVideos) return

		this.statsSnapshot.drainScheduledCount += 1
		this.drainTimerId = setTimeout(() => {
			this.drainTimerId = null
			this.scheduleRefresh("visibility:drain", true)
		}, VISIBILITY_DRAIN_DELAY_MS)
	}

	private scheduleFarVisibilityDrain(): void {
		if (this.destroyed) return
		if (this.farVisibilityDrainTimerId !== null) {
			clearTimeout(this.farVisibilityDrainTimerId)
		}
		this.farVisibilityDrainTimerId = setTimeout(() => {
			this.farVisibilityDrainTimerId = null
			this.scheduleRefresh("visibility:drain", true)
		}, FAR_VISIBILITY_DRAIN_GRACE_MS)
	}

	private suppressContentLayerHitGraphDuringViewportMovement(): void {
		if (this.destroyed) return
		const layer = this.canvas.contentLayer
		if (!this.contentLayerHitGraphSuppressed) {
			this.contentLayerHitGraphSuppressed = true
			this.contentLayerPreviousListening = layer.listening()
			if (this.contentLayerPreviousListening) {
				// Konva keeps a hit graph for event detection. During continuous pan/scale we
				// do not need content-node picking, so disabling it avoids hit-canvas work.
				layer.listening(false)
			}
		}

		if (this.contentLayerHitGraphRestoreTimerId !== null) {
			clearTimeout(this.contentLayerHitGraphRestoreTimerId)
		}
		this.contentLayerHitGraphRestoreTimerId = setTimeout(() => {
			this.contentLayerHitGraphRestoreTimerId = null
			this.restoreContentLayerHitGraph()
		}, CONTENT_LAYER_HIT_GRAPH_RESTORE_DELAY_MS)
	}

	private restoreContentLayerHitGraph(): void {
		if (!this.contentLayerHitGraphSuppressed) return
		const shouldRestoreListening = this.contentLayerPreviousListening === true
		this.contentLayerHitGraphSuppressed = false
		this.contentLayerPreviousListening = null
		if (!shouldRestoreListening) return

		this.canvas.contentLayer.listening(true)
		this.canvas.contentLayer.batchDraw()
	}

	private shouldPromoteInitialVisibleLoads(reason: string): boolean {
		if (now() > this.initialVisibleCriticalUntil) return false
		return (
			reason === "document:loaded" ||
			reason === "image:register" ||
			reason === "viewport:pan" ||
			reason === "viewport:scale" ||
			reason === "visibility:drain"
		)
	}

	private shouldScanVisibleContainerMedia(reason: string): boolean {
		return (
			reason === "document:loaded" ||
			reason === "image:register" ||
			reason === "viewport:pan" ||
			reason === "viewport:scale" ||
			reason === "visibility:drain"
		)
	}

	private createCandidate(
		elementId: string,
		visibilityState: "visible" | "near",
		viewportScale: number,
		viewportCenter: { x: number; y: number },
		priorityOverride?: ImageResourceLoadPriority,
		viewportRect?: Rect,
	): ImageLoadCandidate | null {
		const registered = this.registeredImages.get(elementId)
		if (!registered) return null
		if (!this.canvas.elementManager.isElementVisibleInDataTree(elementId)) return null

		const bounds = this.canvas.geometryCacheManager.getElementBounds(elementId)
		if (!bounds) return null
		const screenWidth = Math.max(0, bounds.width * viewportScale)
		const screenHeight = Math.max(0, bounds.height * viewportScale)
		const screenLongEdge = Math.max(screenWidth, screenHeight)
		const screenArea = screenWidth * screenHeight
		const priority: ImageResourceLoadPriority =
			priorityOverride ?? (visibilityState === "visible" ? "visible" : "near")
		const frameDisplayVariant =
			visibilityState === "visible" && viewportRect
				? this.getVisibleClippingContainerDisplayVariant({
						elementId,
						viewportRect,
						viewportScale,
					})
				: undefined
		const viewingDecision = decideImageDisplayViewingLevel({
			visibilityState,
			screenArea,
			screenLongEdge,
			previousVariant: this.getPreviousImageDisplayVariant(elementId),
		})
		const variant = maxImageResourceVariant(viewingDecision.variant, frameDisplayVariant)

		return {
			elementId,
			path: registered.path,
			priority,
			variant,
			visibilityState,
			screenArea,
			screenLongEdge,
			distanceToViewportCenter: getDistance(getRectCenter(bounds), viewportCenter),
		}
	}

	private getVisibleClippingContainerDisplayVariant(options: {
		elementId: string
		viewportRect: Rect
		viewportScale: number
	}): MediaDisplayResourceVariant | undefined {
		let parentId = this.canvas.elementManager.findParentIdForElement(options.elementId)

		while (parentId) {
			const parentElement = this.canvas.elementManager.getElementData(parentId)
			if (!parentElement) return undefined

			if (isClippingContainer(parentElement)) {
				const parentBounds = this.canvas.geometryCacheManager.getElementBounds(parentId)
				if (!parentBounds) return undefined
				return this.resolveFrameDisplayVariant({
					containerId: parentId,
					clipBounds: parentBounds,
					viewportRect: options.viewportRect,
					viewportScale: options.viewportScale,
				})
			}

			parentId = this.canvas.elementManager.findParentIdForElement(parentId)
		}

		return undefined
	}

	private resolveFrameDisplayVariant(options: {
		containerId: string
		clipBounds: Rect
		viewportRect: Rect
		viewportScale: number
	}): MediaDisplayResourceVariant | undefined {
		return this.decideContainerDisplayVariant({
			containerId: options.containerId,
			containerVisibleBounds: getIntersectionRect(options.clipBounds, options.viewportRect),
			viewportScale: options.viewportScale,
		})
	}

	private collectVisibleContainerMediaCandidates(options: {
		reason: string
		viewportRect: Rect
		viewportScale: number
		viewportCenter: { x: number; y: number }
	}): {
		imageCandidates: ImageLoadCandidate[]
		videoCandidates: VideoLoadCandidate[]
	} {
		const { rootContainers } = this.getContainerRootCache()
		if (rootContainers.length === 0) {
			return { imageCandidates: [], videoCandidates: [] }
		}

		const visibleContainerIds = this.canvas.geometryCacheManager.queryElementIdsByExpandedRect(
			options.viewportRect,
			0,
			{ elementIds: rootContainers.map((element) => element.id) },
		)
		if (visibleContainerIds.length === 0) {
			return { imageCandidates: [], videoCandidates: [] }
		}

		const imageCandidates: ImageLoadCandidate[] = []
		const videoCandidates: VideoLoadCandidate[] = []
		const queuedMediaIds = new Set<string>()

		const visit = (
			element: LayerElement,
			parentTransform: {
				bounds: Rect
				scaleX: number
				scaleY: number
				clipBounds: Rect
				frameDisplayVariant?: MediaDisplayResourceVariant
			},
		): void => {
			if (
				imageCandidates.length + videoCandidates.length >=
				MAX_INITIAL_VISIBLE_CONTAINER_IMAGE_REQUESTS
			) {
				return
			}
			if (!this.canvas.elementManager.isElementVisibleInDataTree(element.id)) {
				return
			}

			if (element.type === ElementTypeEnum.Image) {
				if (queuedMediaIds.has(element.id)) {
					return
				}
				const registered = this.registeredImages.get(element.id)
				const path = registered?.path ?? element.src
				if (!path) {
					return
				}

				const elementBounds = this.getElementDataBoundsInCanvas(element, parentTransform)
				if (!elementBounds) {
					return
				}
				const clippedBounds = getIntersectionRect(elementBounds, parentTransform.clipBounds)
				if (!clippedBounds) {
					return
				}
				const visibleBounds = getIntersectionRect(clippedBounds, options.viewportRect)
				if (!visibleBounds) {
					return
				}
				const screenArea = getArea(visibleBounds) * options.viewportScale ** 2
				const screenLongEdge =
					Math.max(visibleBounds.width, visibleBounds.height) * options.viewportScale
				if (screenArea <= 0) {
					return
				}
				const viewingDecision = decideImageDisplayViewingLevel({
					visibilityState: "visible",
					screenArea,
					screenLongEdge,
					previousVariant: this.getPreviousImageDisplayVariant(element.id),
				})
				const variant = maxImageResourceVariant(
					viewingDecision.variant,
					parentTransform.frameDisplayVariant,
				)
				queuedMediaIds.add(element.id)
				imageCandidates.push({
					elementId: element.id,
					path,
					priority: "critical",
					variant,
					visibilityState: "visible",
					screenArea,
					screenLongEdge,
					distanceToViewportCenter: getDistance(
						getRectCenter(visibleBounds),
						options.viewportCenter,
					),
					frameAdjustedBounds: elementBounds,
					frameVisibleBounds: visibleBounds,
				})
				return
			}

			if (element.type === ElementTypeEnum.Video) {
				if (queuedMediaIds.has(element.id)) {
					return
				}
				const registered = this.registeredVideos.get(element.id)
				const path = registered?.path ?? element.src
				if (!path) {
					return
				}

				const elementBounds = this.getElementDataBoundsInCanvas(element, parentTransform)
				if (!elementBounds) {
					return
				}
				const clippedBounds = getIntersectionRect(elementBounds, parentTransform.clipBounds)
				if (!clippedBounds) {
					return
				}
				const visibleBounds = getIntersectionRect(clippedBounds, options.viewportRect)
				if (!visibleBounds) {
					return
				}
				const screenArea = getArea(visibleBounds) * options.viewportScale ** 2
				const screenLongEdge =
					Math.max(visibleBounds.width, visibleBounds.height) * options.viewportScale
				if (screenArea <= 0) {
					return
				}

				queuedMediaIds.add(element.id)
				videoCandidates.push({
					elementId: element.id,
					path,
					priority: "critical",
					tier: "poster",
					visibilityState: "visible",
					screenArea,
					screenLongEdge,
					distanceToViewportCenter: getDistance(
						getRectCenter(visibleBounds),
						options.viewportCenter,
					),
					frameAdjustedBounds: elementBounds,
					frameVisibleBounds: visibleBounds,
				})
				return
			}

			if (hasChildren(element)) {
				const elementBounds = this.getElementDataBoundsInCanvas(element, parentTransform)
				if (!elementBounds) {
					return
				}
				const clipBounds = isClippingContainer(element)
					? (getIntersectionRect(parentTransform.clipBounds, elementBounds) ?? {
							x: 0,
							y: 0,
							width: 0,
							height: 0,
						})
					: parentTransform.clipBounds
				const frameDisplayVariant = isClippingContainer(element)
					? this.resolveFrameDisplayVariant({
							containerId: element.id,
							clipBounds,
							viewportRect: options.viewportRect,
							viewportScale: options.viewportScale,
						})
					: parentTransform.frameDisplayVariant
				const scaleX = parentTransform.scaleX * (element.scaleX ?? 1)
				const scaleY = parentTransform.scaleY * (element.scaleY ?? 1)
				element.children.forEach((child) =>
					visit(child, {
						bounds: elementBounds,
						scaleX,
						scaleY,
						clipBounds,
						frameDisplayVariant,
					}),
				)
			}
		}

		visibleContainerIds.forEach((containerId) => {
			const container = this.canvas.elementManager.getElementData(containerId)
			if (!container || !hasChildren(container)) {
				return
			}
			const containerBounds = this.canvas.geometryCacheManager.getElementBounds(containerId)
			if (!containerBounds) {
				return
			}
			const width = container.width ?? containerBounds.width
			const height = container.height ?? containerBounds.height
			const scaleX = width > 0 ? containerBounds.width / width : 1
			const scaleY = height > 0 ? containerBounds.height / height : 1
			const clipBounds = isClippingContainer(container)
				? containerBounds
				: (getIntersectionRect(containerBounds, options.viewportRect) ?? containerBounds)
			const frameDisplayVariant = isClippingContainer(container)
				? this.resolveFrameDisplayVariant({
						containerId: container.id,
						clipBounds,
						viewportRect: options.viewportRect,
						viewportScale: options.viewportScale,
					})
				: undefined
			container.children.forEach((child) =>
				visit(child, {
					bounds: containerBounds,
					scaleX,
					scaleY,
					clipBounds,
					frameDisplayVariant,
				}),
			)
		})

		return { imageCandidates, videoCandidates }
	}

	private decideContainerDisplayVariant(options: {
		containerId: string
		containerVisibleBounds: Rect | null
		viewportScale: number
	}): MediaDisplayResourceVariant | undefined {
		const { containerId, containerVisibleBounds, viewportScale } = options
		if (!containerVisibleBounds) return undefined
		const screenArea = getArea(containerVisibleBounds) * viewportScale ** 2
		if (screenArea <= 0) return undefined
		const screenLongEdge =
			Math.max(containerVisibleBounds.width, containerVisibleBounds.height) * viewportScale
		const decision = decideImageDisplayViewingLevel({
			visibilityState: "visible",
			screenArea,
			screenLongEdge,
			previousVariant: this.lastContainerDisplayVariant.get(containerId),
		})
		const displayVariant = toMediaDisplayResourceVariant(decision.variant)
		this.lastContainerDisplayVariant.set(containerId, displayVariant)
		return displayVariant
	}

	private getElementDataBoundsInCanvas(
		element: LayerElement,
		parentTransform: {
			bounds: Rect
			scaleX: number
			scaleY: number
			clipBounds: Rect
		},
	): Rect | null {
		const width = element.width ?? 0
		const height = element.height ?? 0
		if (width <= 0 || height <= 0) return null
		const scaleX = parentTransform.scaleX * (element.scaleX ?? 1)
		const scaleY = parentTransform.scaleY * (element.scaleY ?? 1)
		return {
			x: parentTransform.bounds.x + (element.x ?? 0) * parentTransform.scaleX,
			y: parentTransform.bounds.y + (element.y ?? 0) * parentTransform.scaleY,
			width: width * scaleX,
			height: height * scaleY,
		}
	}

	private createVideoCandidate(
		elementId: string,
		visibilityState: "visible" | "near",
		viewportScale: number,
		viewportCenter: { x: number; y: number },
		tier: VideoLoadTier,
	): VideoLoadCandidate | null {
		const registered = this.registeredVideos.get(elementId)
		if (!registered) return null
		if (!this.canvas.elementManager.isElementVisibleInDataTree(elementId)) return null

		const bounds = this.canvas.geometryCacheManager.getElementBounds(elementId)
		if (!bounds) return null
		const screenWidth = Math.max(0, bounds.width * viewportScale)
		const screenHeight = Math.max(0, bounds.height * viewportScale)
		const screenLongEdge = Math.max(screenWidth, screenHeight)
		const screenArea = screenWidth * screenHeight
		const priority: ImageResourceLoadPriority =
			visibilityState === "visible" ? "visible" : "near"

		return {
			elementId,
			path: registered.path,
			priority,
			tier,
			visibilityState,
			screenArea,
			screenLongEdge,
			distanceToViewportCenter: getDistance(getRectCenter(bounds), viewportCenter),
		}
	}

	private requestImageLoad(candidate: ImageLoadCandidate, reason: string, force = false): void {
		const signal = isViewportResourceBoundReason(reason)
			? this.getViewportResourceSignal("image", candidate.path)
			: undefined
		const previousState = this.lastRequestedLoadState.get(candidate.elementId)
		if (
			!force &&
			previousState &&
			previousState.variant === candidate.variant &&
			getPriorityRank(previousState.priority) <= getPriorityRank(candidate.priority)
		) {
			return
		}

		this.lastRequestedLoadState.set(candidate.elementId, {
			priority: candidate.priority,
			variant: candidate.variant,
			requestedAt: now(),
		})
		const loadOptions = {
			variant: candidate.variant,
			priority: candidate.priority,
			displayTargetElementId: candidate.elementId,
			displayTargetReason: reason,
			...(signal
				? {
						signal,
					}
				: {}),
		}
		void this.canvas.imageResourceManager.loadResource(candidate.path, loadOptions)
	}

	private requestVideoLoad(candidate: VideoLoadCandidate, reason: string, force = false): void {
		const signal = isViewportResourceBoundReason(reason)
			? this.getViewportResourceSignal("video", candidate.path)
			: undefined
		const previousState = this.lastRequestedVideoLoadState.get(candidate.elementId)
		if (
			!force &&
			previousState &&
			previousState.tier === candidate.tier &&
			getPriorityRank(previousState.priority) <= getPriorityRank(candidate.priority)
		) {
			return
		}

		if (candidate.tier === "url") {
			this.lastRequestedVideoLoadState.set(candidate.elementId, {
				priority: candidate.priority,
				tier: candidate.tier,
				requestedAt: now(),
			})
			void this.canvas.videoResourceManager.ensureFreshOssInfo(candidate.path, {
				allowCachedFallback: true,
				priority: candidate.priority,
				...(signal ? { signal } : {}),
			})
			return
		}

		const element = this.canvas.elementManager.getElementInstance(candidate.elementId) as
			| {
					requestPreviewLoad?: (options?: {
						force?: boolean
						priority?: ImageResourceLoadPriority
						signal?: AbortSignal
					}) => void
			  }
			| undefined
		if (!element?.requestPreviewLoad) return

		this.lastRequestedVideoLoadState.set(candidate.elementId, {
			priority: candidate.priority,
			tier: candidate.tier,
			requestedAt: now(),
		})
		element.requestPreviewLoad({
			force,
			...(signal
				? {
						priority: candidate.priority,
						signal,
					}
				: {}),
		})
	}
}
