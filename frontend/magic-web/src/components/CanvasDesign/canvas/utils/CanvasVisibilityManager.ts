import type { Canvas } from "../Canvas"
import { ElementTypeEnum, type LayerElement } from "../types"
import type { Rect } from "./utils"
import type {
	AcquiredImageResource,
	ImageResourceLoadPriority,
	ImageResourceVariant,
	LoadedResource,
} from "./ImageResourceManager"
import {
	computeElementViewportMetrics,
	decideImageDisplayViewingLevel,
	decideMediaDetailLevel,
	type MediaDisplayResourceVariant,
} from "./CanvasMediaViewingPolicy"
import { getViewportCanvasRect } from "./elementUtils"
import { resolveCanonicalResourcePath } from "./pathUtils"
import type { ResourceLoadFailureReason } from "./resourceLoadFailure"
import {
	CanvasRenderVisibilityController,
	type CanvasRenderVisibilityStrategy,
} from "./CanvasRenderVisibilityController"

type VisibilityState = "visible" | "near" | "far"

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

interface DetailFullCandidate extends ImageLoadCandidate {
	screenLongEdge: number
	previewLongEdge: number
	detailZoomRatio: number
	visibleAreaRatio: number
	visibleElementAreaRatio: number
	fullDecodedBytes: number
	fullNativeBytes: number
}

interface ActiveDetailFullDisplay {
	elementId: string
	path: string
	generation: number
	status: "loading" | "applied"
	release?: () => void
}

interface DetailFullImageElement {
	getDisplayResourceVariant?: () => ImageResourceVariant | undefined
	applyDetailFullDisplayResource?: () => Promise<Pick<AcquiredImageResource, "release"> | null>
	downgradeDetailFullDisplayResource?: () => void
}

export interface CanvasVisibilitySnapshot {
	registeredImageCount: number
	registeredVideoCount: number
	registerDedupedCount: number
	videoRegisterDedupedCount: number
	releaseClearedRequestCount: number
	overviewFallbackPreviewCount: number
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
	tinyVisibleVideoCount: number
	pendingTinyVisibleVideoLoadCandidateCount: number
	pendingImageLoadCandidateCount: number
	pendingVideoLoadCandidateCount: number
	detailFullActiveCount: number
	detailFullCandidateCount: number
	detailFullSkippedCount: number
	detailFullScheduledCount: number
	detailFullAppliedCount: number
	detailFullReleasedCount: number
	detailFullLastSkipReason: string | null
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
const MIN_VISIBLE_VIDEO_SCREEN_LONG_EDGE_FOR_LOAD = 96
const MIN_NEAR_VIDEO_SCREEN_LONG_EDGE_FOR_LOAD = 160
const LOW_DETAIL_VISIBLE_VIDEO_FALLBACK_LIMIT = 4
const MAX_VISIBLE_VIDEO_LOAD_REQUESTS_PER_QUERY = 12
const MAX_NEAR_VIDEO_LOAD_REQUESTS_PER_QUERY = 6
const VISIBILITY_DRAIN_DELAY_MS = 80
const DETAIL_FULL_STABLE_DELAY_MS = 200
const DETAIL_FULL_MIN_ZOOM_RATIO = 0.15
const DETAIL_FULL_EXIT_ZOOM_RATIO = 0.1
const DETAIL_FULL_MAX_DECODED_BYTES = 256 * 1024 * 1024
const DETAIL_FULL_MAX_NATIVE_BYTES = 512 * 1024 * 1024
const DETAIL_FULL_NATIVE_ESTIMATE_FACTOR = 2.15
const INITIAL_VISIBLE_CRITICAL_WINDOW_MS = 5000
const MAX_INITIAL_VISIBLE_CONTAINER_IMAGE_REQUESTS = 48
const VIEWPORT_MOVEMENT_SCALE_REFRESH_RATIO = 1.15
const IMAGE_VARIANT_SWITCH_COOLDOWN_MS = 450
const FAR_DISPLAY_RELEASE_GRACE_MS = 3000
const CONTENT_LAYER_HIT_GRAPH_RESTORE_DELAY_MS = 160
// Current default: Konva-only far culling. Far elements stop participating in drawing / hit
// testing after the 3s drain, but their decoded image resources stay cached for fast return.
const FAR_KONVA_RENDER_VISIBILITY_STRATEGY: CanvasRenderVisibilityStrategy = "hidden"
// Resource reclaim is intentionally separate from Konva node culling. Keep disabled while tuning
// smooth panning; set to "visibility-drain" only when we want far culling to also release decoded
// small / overview / preview resources, which may cause reloads when panning back.
const FAR_RESOURCE_RECLAIM_STRATEGY: "disabled" | "visibility-drain" = "disabled"

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

export class CanvasVisibilityManager {
	private readonly canvas: Canvas
	private readonly registeredImages = new Map<string, RegisteredImageElement>()
	private readonly registeredVideos = new Map<string, RegisteredVideoElement>()
	private readonly lastVisibilityState = new Map<string, VisibilityState>()
	private readonly lastVideoVisibilityState = new Map<string, VisibilityState>()
	private readonly lastRequestedLoadState = new Map<string, RequestedImageLoadState>()
	private readonly lastRequestedVideoLoadState = new Map<string, RequestedVideoLoadState>()
	private readonly lastContainerDisplayVariant = new Map<string, MediaDisplayResourceVariant>()
	private readonly displayProtectionUntil = new Map<string, number>()
	private rafId: number | null = null
	private drainTimerId: ReturnType<typeof setTimeout> | null = null
	private farDisplayReleaseTimerId: ReturnType<typeof setTimeout> | null = null
	private contentLayerHitGraphRestoreTimerId: ReturnType<typeof setTimeout> | null = null
	private variantSwitchCooldownTimerId: ReturnType<typeof setTimeout> | null = null
	private scheduledForce = false
	private scheduledReason = "unknown"
	private lastQueryCoverRect: Rect | null = null
	private lastScaleBand: number | null = null
	private lastQueryViewportScale: number | null = null
	private containerRootCache: ContainerRootCache | null = null
	private destroyed = false
	private detailFullTimerId: ReturnType<typeof setTimeout> | null = null
	private activeDetailFull: ActiveDetailFullDisplay | null = null
	private detailFullGeneration = 0
	private lastViewportMovementAt = now()
	private contentLayerHitGraphSuppressed = false
	private contentLayerPreviousListening: boolean | null = null
	private readonly renderVisibilityController: CanvasRenderVisibilityController
	private initialVisibleCriticalUntil = now() + INITIAL_VISIBLE_CRITICAL_WINDOW_MS
	private statsSnapshot: CanvasVisibilitySnapshot = {
		registeredImageCount: 0,
		registeredVideoCount: 0,
		registerDedupedCount: 0,
		videoRegisterDedupedCount: 0,
		releaseClearedRequestCount: 0,
		overviewFallbackPreviewCount: 0,
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
		tinyVisibleVideoCount: 0,
		pendingTinyVisibleVideoLoadCandidateCount: 0,
		pendingImageLoadCandidateCount: 0,
		pendingVideoLoadCandidateCount: 0,
		detailFullActiveCount: 0,
		detailFullCandidateCount: 0,
		detailFullSkippedCount: 0,
		detailFullScheduledCount: 0,
		detailFullAppliedCount: 0,
		detailFullReleasedCount: 0,
		detailFullLastSkipReason: null,
		drainScheduledCount: 0,
		drainRunCount: 0,
		lastViewportScale: 1,
		lastViewportWidth: 0,
		lastViewportHeight: 0,
		skippedViewportQueryCount: 0,
		queryCount: 0,
	}

	private readonly handleViewportPan = (): void => {
		this.lastViewportMovementAt = now()
		this.suppressContentLayerHitGraphDuringViewportMovement()
		this.scheduleRefresh("viewport:pan", false)
		this.scheduleDetailFullRecheck("viewport:pan")
	}

	private readonly handleViewportScale = (): void => {
		this.lastViewportMovementAt = now()
		this.suppressContentLayerHitGraphDuringViewportMovement()
		this.scheduleRefresh("viewport:scale", true)
		this.scheduleDetailFullRecheck("viewport:scale")
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

	private readonly handleImageResourceReleased = (event: {
		data: {
			path: string
			variant?: ImageResourceVariant
			reason?: string
			releasedBytes?: number
		}
	}): void => {
		this.registeredImages.forEach((registered, elementId) => {
			if (!this.isSameResourcePath(registered.path, event.data.path)) return
			this.lastRequestedLoadState.delete(elementId)
			this.statsSnapshot.releaseClearedRequestCount += 1
		})
	}

	private readonly handleImageResourceLoaded = (event: {
		data: { path: string; resource: LoadedResource }
	}): void => {
		if (event.data.resource.variant !== "preview") return
		let shouldRecheckDetailFull = false
		this.registeredImages.forEach((registered) => {
			if (shouldRecheckDetailFull) return
			if (!this.isSameResourcePath(registered.path, event.data.path)) return
			shouldRecheckDetailFull = true
		})
		if (shouldRecheckDetailFull) {
			this.scheduleDetailFullRecheck("preview-loaded")
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
		if (
			this.destroyed ||
			(event.data.variant !== "small" && event.data.variant !== "overview")
		) {
			return
		}

		const viewportRect = getViewportCanvasRect(this.canvas)
		const viewportScale = this.canvas.stage.scaleX() || 1
		const viewportCenter = getRectCenter(viewportRect)
		const fallbackVariant: ImageResourceVariant =
			event.data.variant === "small" ? "overview" : "preview"

		this.registeredImages.forEach((registered, elementId) => {
			if (!this.isSameResourcePath(registered.path, event.data.path)) return
			const visibilityState = this.lastVisibilityState.get(elementId)
			if (visibilityState !== "visible") return
			if (!this.canvas.elementManager.isElementVisibleInDataTree(elementId)) return

			const bounds = this.canvas.geometryCacheManager.getElementBounds(elementId)
			if (!bounds) return

			const screenWidth = Math.max(0, bounds.width * viewportScale)
			const screenHeight = Math.max(0, bounds.height * viewportScale)
			const screenLongEdge = Math.max(screenWidth, screenHeight)
			const candidate: ImageLoadCandidate = {
				elementId,
				path: registered.path,
				priority: "visible",
				variant: fallbackVariant,
				visibilityState,
				screenArea: screenWidth * screenHeight,
				screenLongEdge,
				distanceToViewportCenter: getDistance(getRectCenter(bounds), viewportCenter),
			}

			if (event.data.variant === "overview") {
				this.statsSnapshot.overviewFallbackPreviewCount += 1
			}
			this.requestImageLoad(
				candidate,
				`${event.data.variant}-failed:${event.data.reason ?? "load-error"}`,
			)
		})
	}

	constructor(options: { canvas: Canvas }) {
		this.canvas = options.canvas
		this.renderVisibilityController = new CanvasRenderVisibilityController({
			canvas: this.canvas,
			strategy: FAR_KONVA_RENDER_VISIBILITY_STRATEGY,
		})
		this.canvas.eventEmitter.on("viewport:pan", this.handleViewportPan)
		this.canvas.eventEmitter.on("viewport:scale", this.handleViewportScale)
		this.canvas.eventEmitter.on("element:change", this.handleElementChange)
		this.canvas.eventEmitter.on("document:loaded", this.handleDocumentLoaded)
		this.canvas.eventEmitter.on("resource:image:loaded", this.handleImageResourceLoaded)
		this.canvas.eventEmitter.on("resource:image:released", this.handleImageResourceReleased)
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
		if (this.activeDetailFull?.elementId === elementId) {
			this.releaseActiveDetailFull("image:path-changed")
		}
		this.registeredImages.set(elementId, { elementId, path })
		this.lastVisibilityState.delete(elementId)
		this.lastRequestedLoadState.delete(elementId)
		this.scheduleRefresh("image:register", true)
	}

	public unregisterImageElement(elementId: string): void {
		const registered = this.registeredImages.get(elementId)
		if (!registered) return
		if (this.activeDetailFull?.elementId === elementId) {
			this.releaseActiveDetailFull("image:unregister")
		}
		this.registeredImages.delete(elementId)
		this.lastVisibilityState.delete(elementId)
		this.lastRequestedLoadState.delete(elementId)
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
		if (this.farDisplayReleaseTimerId !== null) {
			clearTimeout(this.farDisplayReleaseTimerId)
		}
		if (this.contentLayerHitGraphRestoreTimerId !== null) {
			clearTimeout(this.contentLayerHitGraphRestoreTimerId)
		}
		if (this.variantSwitchCooldownTimerId !== null) {
			clearTimeout(this.variantSwitchCooldownTimerId)
		}
		if (this.detailFullTimerId !== null) {
			clearTimeout(this.detailFullTimerId)
		}
		this.rafId = null
		this.drainTimerId = null
		this.farDisplayReleaseTimerId = null
		this.contentLayerHitGraphRestoreTimerId = null
		this.variantSwitchCooldownTimerId = null
		this.detailFullTimerId = null
		this.restoreContentLayerHitGraph()
		this.releaseActiveDetailFull("destroy")
		this.registeredImages.clear()
		this.registeredVideos.clear()
		this.lastVisibilityState.clear()
		this.lastVideoVisibilityState.clear()
		this.lastRequestedLoadState.clear()
		this.lastRequestedVideoLoadState.clear()
		this.lastContainerDisplayVariant.clear()
		this.displayProtectionUntil.clear()
		this.renderVisibilityController.restoreAll()
		this.canvas.eventEmitter.off("viewport:pan", this.handleViewportPan)
		this.canvas.eventEmitter.off("viewport:scale", this.handleViewportScale)
		this.canvas.eventEmitter.off("element:change", this.handleElementChange)
		this.canvas.eventEmitter.off("document:loaded", this.handleDocumentLoaded)
		this.canvas.eventEmitter.off("resource:image:loaded", this.handleImageResourceLoaded)
		this.canvas.eventEmitter.off("resource:image:released", this.handleImageResourceReleased)
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
			resolveCanonicalResourcePath(left, resolveAbsolutePath) ===
			resolveCanonicalResourcePath(right, resolveAbsolutePath)
		)
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

	private scheduleDetailFullRecheck(reason: string, delayMs = DETAIL_FULL_STABLE_DELAY_MS): void {
		if (this.destroyed) return
		if (this.detailFullTimerId !== null) {
			clearTimeout(this.detailFullTimerId)
		}
		this.detailFullTimerId = setTimeout(
			() => {
				this.detailFullTimerId = null
				this.scheduleRefresh(`detail-full:${reason}`, true)
			},
			Math.max(0, delayMs),
		)
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
		if (!force) return true
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

	private getPreviousImageDisplayVariant(
		elementId: string,
	): MediaDisplayResourceVariant | undefined {
		const previousVariant = this.lastRequestedLoadState.get(elementId)?.variant
		return previousVariant === "small" ||
			previousVariant === "overview" ||
			previousVariant === "preview"
			? previousVariant
			: undefined
	}

	private releaseActiveDetailFull(reason: string): void {
		void reason
		const active = this.activeDetailFull
		if (!active) return

		this.detailFullGeneration += 1
		this.activeDetailFull = null

		const element = this.getDetailFullElement(active.elementId)
		element?.downgradeDetailFullDisplayResource?.()
		active.release?.()

		this.statsSnapshot.detailFullReleasedCount += 1
	}

	private evaluateDetailFullDisplay(options: {
		visibleCandidates: ImageLoadCandidate[]
		viewportRect: Rect
		viewportScale: number
		reason: string
	}): void {
		const { visibleCandidates, viewportRect, viewportScale, reason } = options
		const currentNow = now()
		this.statsSnapshot.detailFullCandidateCount = 0

		const viewportStableRemaining =
			DETAIL_FULL_STABLE_DELAY_MS - (currentNow - this.lastViewportMovementAt)
		if (viewportStableRemaining > 0) {
			this.skipDetailFull("viewport-unstable", {
				reason,
				viewportScale,
				viewportRect,
			})
			this.scheduleDetailFullRecheck("viewport-stable", viewportStableRemaining)
			return
		}

		const detailCandidates: DetailFullCandidate[] = []
		let lastSkipReason: string | null = null
		const activeElementId = this.activeDetailFull?.elementId

		visibleCandidates.forEach((candidate) => {
			const detailCandidate = this.createDetailFullCandidate({
				candidate,
				viewportRect,
				viewportScale,
				minZoomRatio:
					activeElementId === candidate.elementId
						? DETAIL_FULL_EXIT_ZOOM_RATIO
						: DETAIL_FULL_MIN_ZOOM_RATIO,
			})
			if (detailCandidate) {
				detailCandidates.push(detailCandidate)
			} else {
				lastSkipReason = this.statsSnapshot.detailFullLastSkipReason
			}
		})

		this.statsSnapshot.detailFullCandidateCount = detailCandidates.length
		this.statsSnapshot.detailFullActiveCount = this.activeDetailFull ? 1 : 0

		if (detailCandidates.length === 0) {
			this.skipDetailFull(lastSkipReason ?? "no-eligible-candidate", {
				reason,
				viewportScale,
				viewportRect,
			})
			this.releaseActiveDetailFull(lastSkipReason ?? "no-eligible-candidate")
			return
		}

		detailCandidates.sort((a, b) => {
			const visibleAreaDiff = b.visibleAreaRatio - a.visibleAreaRatio
			if (visibleAreaDiff !== 0) return visibleAreaDiff
			const zoomDiff = b.detailZoomRatio - a.detailZoomRatio
			if (zoomDiff !== 0) return zoomDiff
			return sortCandidates(a, b)
		})

		const candidate = detailCandidates[0]

		if (this.activeDetailFull?.elementId === candidate.elementId) {
			this.statsSnapshot.detailFullActiveCount = 1
			return
		}

		if (this.activeDetailFull) {
			this.releaseActiveDetailFull("candidate-changed")
		}

		this.scheduleDetailFullLoad(candidate, reason)
	}

	private createDetailFullCandidate(options: {
		candidate: ImageLoadCandidate
		viewportRect: Rect
		viewportScale: number
		minZoomRatio: number
	}): DetailFullCandidate | null {
		const { candidate, viewportRect, viewportScale, minZoomRatio } = options
		const element = this.getDetailFullElement(candidate.elementId)
		if (
			!element?.applyDetailFullDisplayResource ||
			!element?.downgradeDetailFullDisplayResource
		) {
			this.skipDetailFull("element-no-detail-full-api", {
				candidate,
				viewportScale,
				viewportRect,
			})
			return null
		}

		const isActiveDetailFullElement = this.activeDetailFull?.elementId === candidate.elementId
		if (!isActiveDetailFullElement && element.getDisplayResourceVariant?.() === "full") {
			this.skipDetailFull("display-already-full", {
				candidate,
				viewportScale,
				viewportRect,
			})
			return null
		}

		const bounds =
			candidate.frameVisibleBounds ??
			this.canvas.geometryCacheManager.getElementBounds(candidate.elementId)
		if (!bounds) {
			this.skipDetailFull("missing-bounds", {
				candidate,
				viewportScale,
				viewportRect,
			})
			return null
		}

		const metrics = computeElementViewportMetrics({
			bounds,
			viewportRect,
			viewportScale,
		})
		if (!metrics.isVisible) {
			this.skipDetailFull("not-visible", {
				candidate,
				viewportScale,
				viewportRect,
				screenLongEdge: metrics.screenLongEdge,
				visibleAreaRatio: metrics.visibleViewportAreaRatio,
				visibleElementAreaRatio: metrics.visibleElementAreaRatio,
			})
			return null
		}

		const previewResource = this.canvas.imageResourceManager.peekResource(candidate.path, {
			variant: "preview",
		})
		if (!previewResource) {
			if (candidate.variant === "preview" || isActiveDetailFullElement) {
				this.requestImageLoad(
					{
						...candidate,
						priority: "visible",
						variant: "preview",
						visibilityState: "visible",
					},
					"detail-full:preview-not-ready",
				)
			}
			this.skipDetailFull("preview-not-ready", {
				candidate,
				viewportScale,
				viewportRect,
				screenLongEdge: metrics.screenLongEdge,
				visibleAreaRatio: metrics.visibleViewportAreaRatio,
				visibleElementAreaRatio: metrics.visibleElementAreaRatio,
			})
			return null
		}

		if (previewResource.isFullSize) {
			this.skipDetailFull("preview-is-full-size", {
				candidate,
				viewportScale,
				viewportRect,
				screenLongEdge: metrics.screenLongEdge,
				visibleAreaRatio: metrics.visibleViewportAreaRatio,
				visibleElementAreaRatio: metrics.visibleElementAreaRatio,
			})
			return null
		}

		const previewLongEdge = Math.max(
			previewResource.sourceWidth || 0,
			previewResource.sourceHeight || 0,
		)
		if (previewLongEdge <= 0) {
			this.skipDetailFull("preview-size-missing", {
				candidate,
				viewportScale,
				viewportRect,
				screenLongEdge: metrics.screenLongEdge,
				visibleAreaRatio: metrics.visibleViewportAreaRatio,
				visibleElementAreaRatio: metrics.visibleElementAreaRatio,
			})
			return null
		}

		const fullNaturalWidth =
			previewResource.imageInfo.naturalWidth || previewResource.sourceWidth || 0
		const fullNaturalHeight =
			previewResource.imageInfo.naturalHeight || previewResource.sourceHeight || 0
		const fullDecodedBytes = fullNaturalWidth * fullNaturalHeight * 4
		const fullNativeBytes = Math.round(fullDecodedBytes * DETAIL_FULL_NATIVE_ESTIMATE_FACTOR)

		const detailDecision = decideMediaDetailLevel({
			metrics,
			previewLongEdge,
			isActive: isActiveDetailFullElement,
			fullDecodedBytes,
			fullNativeBytes,
			maxFullDecodedBytes: DETAIL_FULL_MAX_DECODED_BYTES,
			maxFullNativeBytes: DETAIL_FULL_MAX_NATIVE_BYTES,
			enterDisplayToPreviewRatio: minZoomRatio,
			exitDisplayToPreviewRatio: DETAIL_FULL_EXIT_ZOOM_RATIO,
		})
		if (detailDecision.target !== "full") {
			this.skipDetailFull(detailDecision.reason, {
				candidate,
				viewportScale,
				viewportRect,
				screenLongEdge: metrics.screenLongEdge,
				previewLongEdge,
				detailZoomRatio: detailDecision.displayToPreviewRatio,
				visibleAreaRatio: metrics.visibleViewportAreaRatio,
				visibleElementAreaRatio: metrics.visibleElementAreaRatio,
				fullDecodedBytes,
				fullNativeBytes,
			})
			return null
		}

		return {
			...candidate,
			screenLongEdge: metrics.screenLongEdge,
			previewLongEdge,
			detailZoomRatio: detailDecision.displayToPreviewRatio,
			visibleAreaRatio: metrics.visibleViewportAreaRatio,
			visibleElementAreaRatio: metrics.visibleElementAreaRatio,
			fullDecodedBytes,
			fullNativeBytes,
		}
	}

	private scheduleDetailFullLoad(candidate: DetailFullCandidate, reason: string): void {
		void reason
		const element = this.getDetailFullElement(candidate.elementId)
		if (!element?.applyDetailFullDisplayResource) {
			this.skipDetailFull("element-no-detail-full-api", {
				candidate,
				viewportScale: this.canvas.stage.scaleX() || 1,
				viewportRect: getViewportCanvasRect(this.canvas),
			})
			return
		}

		const generation = this.detailFullGeneration + 1
		this.detailFullGeneration = generation
		this.activeDetailFull = {
			elementId: candidate.elementId,
			path: candidate.path,
			generation,
			status: "loading",
		}
		this.statsSnapshot.detailFullScheduledCount += 1

		void element
			.applyDetailFullDisplayResource()
			.then((scopedResource) => {
				const active = this.activeDetailFull
				if (
					this.destroyed ||
					!active ||
					active.generation !== generation ||
					active.elementId !== candidate.elementId
				) {
					scopedResource?.release()
					return
				}

				if (!scopedResource) {
					this.activeDetailFull = null
					this.statsSnapshot.detailFullActiveCount = 0
					this.skipDetailFull("full-load-failed", {
						candidate,
						viewportScale: this.canvas.stage.scaleX() || 1,
						viewportRect: getViewportCanvasRect(this.canvas),
					})
					return
				}

				active.status = "applied"
				active.release = scopedResource.release
				this.statsSnapshot.detailFullAppliedCount += 1
			})
			.catch(() => {
				const active = this.activeDetailFull
				if (active?.generation === generation && active.elementId === candidate.elementId) {
					this.activeDetailFull = null
					this.statsSnapshot.detailFullActiveCount = 0
				}
				this.skipDetailFull("full-load-error", {
					candidate,
					viewportScale: this.canvas.stage.scaleX() || 1,
					viewportRect: getViewportCanvasRect(this.canvas),
				})
			})
	}

	private skipDetailFull(
		skipReason: string,
		options: {
			candidate?: ImageLoadCandidate | DetailFullCandidate
			reason?: string
			viewportScale: number
			viewportRect: Rect
			screenLongEdge?: number
			previewLongEdge?: number
			detailZoomRatio?: number
			visibleAreaRatio?: number
			visibleElementAreaRatio?: number
			fullDecodedBytes?: number
			fullNativeBytes?: number
		},
	): void {
		void options
		this.statsSnapshot.detailFullSkippedCount += 1
		this.statsSnapshot.detailFullLastSkipReason = skipReason
	}

	private getDetailFullElement(elementId: string): DetailFullImageElement | null {
		return (
			(this.canvas.elementManager.getElementInstance(elementId) as
				| DetailFullImageElement
				| undefined) ?? null
		)
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
			startedAt - this.lastViewportMovementAt >= FAR_DISPLAY_RELEASE_GRACE_MS

		if (
			this.shouldSkipViewportMovementQuery({
				reason,
				force,
				viewportRect,
				viewportScale,
				scaleBand,
			})
		) {
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
		const tinyVisibleCandidates: ImageLoadCandidate[] = []
		const nearCandidates: ImageLoadCandidate[] = []
		const visibleVideoCandidates: VideoLoadCandidate[] = []
		const tinyVisibleVideoCandidates: VideoLoadCandidate[] = []
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
			if (candidate.screenLongEdge >= MIN_VISIBLE_SCREEN_LONG_EDGE_FOR_LOAD) {
				visibleCandidates.push(candidate)
			} else {
				tinyVisibleCandidates.push(candidate)
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
				const frameAdjustedImageIds = new Set(
					visibleContainerMediaCandidates.imageCandidates.map(
						(candidate) => candidate.elementId,
					),
				)
				removeCandidatesByIds(visibleCandidates, frameAdjustedImageIds)
				removeCandidatesByIds(tinyVisibleCandidates, frameAdjustedImageIds)
				removeCandidatesByIds(nearCandidates, frameAdjustedImageIds)
				visibleCandidates.push(...visibleContainerMediaCandidates.imageCandidates)
			}
			if (visibleContainerMediaCandidates.videoCandidates.length > 0) {
				const frameAdjustedVideoIds = new Set(
					visibleContainerMediaCandidates.videoCandidates.map(
						(candidate) => candidate.elementId,
					),
				)
				removeCandidatesByIds(visibleVideoCandidates, frameAdjustedVideoIds)
				removeCandidatesByIds(tinyVisibleVideoCandidates, frameAdjustedVideoIds)
				removeCandidatesByIds(nearVideoCandidates, frameAdjustedVideoIds)
				visibleVideoCandidates.push(...visibleContainerMediaCandidates.videoCandidates)
			}
		}

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
				tinyVisibleVideoCandidates.push(candidate)
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
			this.shouldRequestImageCandidate(candidate),
		)
		const pendingTinyVisibleCandidates = tinyVisibleCandidates.filter((candidate) =>
			this.shouldRequestImageCandidate(candidate),
		)
		const pendingNearCandidates = nearCandidates.filter((candidate) =>
			this.shouldRequestImageCandidate(candidate),
		)
		const pendingVisibleVideoCandidates = visibleVideoCandidates.filter((candidate) =>
			this.shouldRequestVideoCandidate(candidate),
		)
		const pendingTinyVisibleVideoCandidates = tinyVisibleVideoCandidates.filter((candidate) =>
			this.shouldRequestVideoCandidate(candidate),
		)
		const pendingNearVideoCandidates = nearVideoCandidates.filter((candidate) =>
			this.shouldRequestVideoCandidate(candidate),
		)
		const shouldDeferNearLoads = isViewportMovementReason(reason)

		const visibleToLoad =
			pendingVisibleCandidates.length > 0
				? pendingVisibleCandidates
						.sort(sortCandidates)
						.slice(0, MAX_VISIBLE_LOAD_REQUESTS_PER_QUERY)
				: pendingTinyVisibleCandidates
						.sort(sortCandidates)
						.slice(0, LOW_DETAIL_VISIBLE_FALLBACK_LIMIT)
		const nearToLoad = shouldDeferNearLoads
			? []
			: pendingNearCandidates.sort(sortCandidates).slice(0, MAX_NEAR_LOAD_REQUESTS_PER_QUERY)
		const visibleVideosToLoad =
			pendingVisibleVideoCandidates.length > 0
				? pendingVisibleVideoCandidates
						.sort(sortCandidates)
						.slice(0, MAX_VISIBLE_VIDEO_LOAD_REQUESTS_PER_QUERY)
				: pendingTinyVisibleVideoCandidates
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
			pendingTinyVisibleCandidates.length +
			pendingNearCandidates.length
		const pendingVideoLoadCandidateCount =
			pendingVisibleVideoCandidates.length +
			pendingTinyVisibleVideoCandidates.length +
			pendingNearVideoCandidates.length
		const requestedImageLoadCount = visibleToLoad.length + nearToLoad.length
		const requestedVideoLoadCount = visibleVideosToLoad.length + nearVideosToLoad.length
		this.scheduleDrainIfNeeded({
			pendingImageLoadCandidateCount,
			pendingVideoLoadCandidateCount,
			requestedImageLoadCount,
			requestedVideoLoadCount,
		})

		const smallProtectedPaths = new Set<string>()
		const overviewProtectedPaths = new Set<string>()
		const previewProtectedPaths = new Set<string>()
		const protectDisplayCandidate = (candidate: ImageLoadCandidate): void => {
			this.displayProtectionUntil.set(candidate.path, now() + FAR_DISPLAY_RELEASE_GRACE_MS)
			smallProtectedPaths.add(candidate.path)
			overviewProtectedPaths.add(candidate.path)
			previewProtectedPaths.add(candidate.path)
		}
		visibleCandidates.forEach(protectDisplayCandidate)
		tinyVisibleCandidates.forEach(protectDisplayCandidate)
		nearCandidates.forEach(protectDisplayCandidate)
		if (isViewportMovementReason(reason)) {
			this.scheduleFarDisplayReleaseDrain()
		}
		this.renderVisibilityController.sync({
			activeElementIds: renderActiveRootIds,
			allElementIds: rootElementIds,
			allowCullFar: farDrainReady,
		})
		if (farDrainReady && FAR_RESOURCE_RECLAIM_STRATEGY === "visibility-drain") {
			const protectionNow = now()
			this.displayProtectionUntil.forEach((expiresAt, path) => {
				if (expiresAt <= protectionNow) {
					this.displayProtectionUntil.delete(path)
					return
				}
				smallProtectedPaths.add(path)
				overviewProtectedPaths.add(path)
				previewProtectedPaths.add(path)
			})
			this.canvas.imageResourceManager.enforceDisplayDecodedBudget({
				protectedSmallPaths: smallProtectedPaths,
				protectedOverviewPaths: overviewProtectedPaths,
				protectedPreviewPaths: previewProtectedPaths,
				reason: `visibility:${reason}`,
			})
		}
		this.evaluateDetailFullDisplay({
			visibleCandidates,
			viewportRect,
			viewportScale,
			reason,
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

		const durationMs = now() - startedAt
		const previousSnapshot = this.statsSnapshot
		this.statsSnapshot = {
			registeredImageCount: this.registeredImages.size,
			registeredVideoCount: this.registeredVideos.size,
			registerDedupedCount: previousSnapshot.registerDedupedCount,
			videoRegisterDedupedCount: previousSnapshot.videoRegisterDedupedCount,
			releaseClearedRequestCount: previousSnapshot.releaseClearedRequestCount,
			overviewFallbackPreviewCount: previousSnapshot.overviewFallbackPreviewCount,
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
			tinyVisibleVideoCount: tinyVisibleVideoCandidates.length,
			pendingTinyVisibleVideoLoadCandidateCount: pendingTinyVisibleVideoCandidates.length,
			pendingImageLoadCandidateCount,
			pendingVideoLoadCandidateCount,
			detailFullActiveCount: previousSnapshot.detailFullActiveCount,
			detailFullCandidateCount: previousSnapshot.detailFullCandidateCount,
			detailFullSkippedCount: previousSnapshot.detailFullSkippedCount,
			detailFullScheduledCount: previousSnapshot.detailFullScheduledCount,
			detailFullAppliedCount: previousSnapshot.detailFullAppliedCount,
			detailFullReleasedCount: previousSnapshot.detailFullReleasedCount,
			detailFullLastSkipReason: previousSnapshot.detailFullLastSkipReason,
			drainScheduledCount: previousSnapshot.drainScheduledCount,
			drainRunCount: previousSnapshot.drainRunCount,
			lastViewportScale: viewportScale,
			lastViewportWidth: viewportRect.width,
			lastViewportHeight: viewportRect.height,
			skippedViewportQueryCount: previousSnapshot.skippedViewportQueryCount,
			queryCount: previousSnapshot.queryCount + 1,
		}
	}

	private shouldRequestImageCandidate(candidate: ImageLoadCandidate): boolean {
		const previousState = this.lastRequestedLoadState.get(candidate.elementId)
		if (!previousState) return true
		const priorityImproved =
			getPriorityRank(previousState.priority) > getPriorityRank(candidate.priority)
		const elapsedSinceLastRequest = now() - previousState.requestedAt
		if (
			previousState.variant !== candidate.variant &&
			elapsedSinceLastRequest < IMAGE_VARIANT_SWITCH_COOLDOWN_MS
		) {
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

	private scheduleFarDisplayReleaseDrain(): void {
		if (this.destroyed) return
		if (this.farDisplayReleaseTimerId !== null) {
			clearTimeout(this.farDisplayReleaseTimerId)
		}
		this.farDisplayReleaseTimerId = setTimeout(() => {
			this.farDisplayReleaseTimerId = null
			this.scheduleRefresh("visibility:drain", true)
		}, FAR_DISPLAY_RELEASE_GRACE_MS)
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
		const frameScopedVariant =
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
		const variant = frameScopedVariant ?? viewingDecision.variant

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
				return this.resolveFrameScopedDisplayVariant({
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

	private resolveFrameScopedDisplayVariant(options: {
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
				frameScopedVariant?: MediaDisplayResourceVariant
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
				const variant =
					parentTransform.frameScopedVariant ??
					decideImageDisplayViewingLevel({
						visibilityState: "visible",
						screenArea,
						screenLongEdge,
						previousVariant: this.getPreviousImageDisplayVariant(element.id),
					}).variant
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
				const frameScopedVariant = isClippingContainer(element)
					? this.resolveFrameScopedDisplayVariant({
							containerId: element.id,
							clipBounds,
							viewportRect: options.viewportRect,
							viewportScale: options.viewportScale,
						})
					: parentTransform.frameScopedVariant
				const scaleX = parentTransform.scaleX * (element.scaleX ?? 1)
				const scaleY = parentTransform.scaleY * (element.scaleY ?? 1)
				element.children.forEach((child) =>
					visit(child, {
						bounds: elementBounds,
						scaleX,
						scaleY,
						clipBounds,
						frameScopedVariant,
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
			const frameScopedVariant = isClippingContainer(container)
				? this.resolveFrameScopedDisplayVariant({
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
					frameScopedVariant,
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
		this.lastContainerDisplayVariant.set(containerId, decision.variant)
		return decision.variant
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
		this.canvas.eventEmitter.emit({
			type: "resource:image:display-target",
			data: {
				elementId: candidate.elementId,
				path: candidate.path,
				variant: candidate.variant,
				reason,
			},
		})
		void this.canvas.imageResourceManager.loadResource(candidate.path, {
			variant: candidate.variant,
			priority: candidate.priority,
		})
	}

	private requestVideoLoad(candidate: VideoLoadCandidate, _reason: string, force = false): void {
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
			})
			return
		}

		const element = this.canvas.elementManager.getElementInstance(candidate.elementId) as
			| { requestPreviewLoad?: (options?: { force?: boolean }) => void }
			| undefined
		if (!element?.requestPreviewLoad) return

		this.lastRequestedVideoLoadState.set(candidate.elementId, {
			priority: candidate.priority,
			tier: candidate.tier,
			requestedAt: now(),
		})

		element.requestPreviewLoad({ force })
	}
}
