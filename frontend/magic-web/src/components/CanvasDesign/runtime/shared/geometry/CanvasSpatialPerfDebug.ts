import type {
	GeometryCacheManager,
	GeometrySpatialQueryProfilingSnapshot,
} from "./GeometryCacheManager"

const CONSOLE_PREFIX = "[CanvasSpatialPerf]"
const GLOBAL_API_KEY = "__MAGIC_CANVAS_SPATIAL_PERF__"

interface CanvasSpatialPerfTarget {
	canvasId: string
	geometryCacheManager: GeometryCacheManager
	getElementCount: () => number
	getViewportScale: () => number
	getActivity: () => CanvasSpatialPerfActivityCounters
}

export interface CanvasSpatialPerfActivityCounters {
	visibilityRefreshCount: number
	visibilitySkippedRefreshCount: number
	drawRequestCount: number
	drawnCount: number
	drawFlushCount: number
	drawCoalescedRequestCount: number
	drawSkippedByStageCount: number
	lastDrawFlushDurationMs: number
	drawReasonCounts: Record<string, number>
	drawLayerRequestCounts: Record<string, number>
	drawLayerDrawnCounts: Record<string, number>
	viewportScaleDispatchCount: number
	viewportScaleCallbackCount: number
	viewportScaleActivationCallbackCount: number
	lastVisibilityRefreshDurationMs: number
	registeredMediaCount: number
	visibleMediaCount: number
	nearMediaCount: number
	registeredViewportScaleLayoutElementCount: number
	registeredViewportScaleLayoutCallbackCount: number
	activeViewportScaleLayoutElementCount: number
	lastViewportScaleLayoutVisitedElementCount: number
	lastViewportScaleLayoutCallbackCount: number
}

interface CanvasSpatialPerfTargetSummary {
	canvasId: string
	elementCount: number
	viewportScale: number
	profiling: boolean
}

export interface CanvasSpatialPerfResult {
	event: "list" | "start" | "snapshot" | "stop" | "error"
	canvasId?: string
	elementCount?: number
	viewportScale?: number
	profiling?: GeometrySpatialQueryProfilingSnapshot | null
	activity?: CanvasSpatialPerfActivityCounters
	targets?: CanvasSpatialPerfTargetSummary[]
	message?: string
}

export interface CanvasSpatialPerfDebugApi {
	list: () => CanvasSpatialPerfResult
	start: (canvasId?: string) => CanvasSpatialPerfResult
	snapshot: (canvasId?: string) => CanvasSpatialPerfResult
	stop: (canvasId?: string) => CanvasSpatialPerfResult
}

interface RegisterCanvasSpatialPerfDebugTargetOptions {
	canvasId: string
	geometryCacheManager: GeometryCacheManager
	getElementCount: () => number
	getViewportScale: () => number
	getActivity: () => CanvasSpatialPerfActivityCounters
}

const targets = new Map<string, CanvasSpatialPerfTarget>()
const activityBaselines = new Map<string, CanvasSpatialPerfActivityCounters>()
let latestCanvasId: string | null = null

function emitResult(result: CanvasSpatialPerfResult): CanvasSpatialPerfResult {
	console.log(`${CONSOLE_PREFIX} ${JSON.stringify(result)}`)
	return result
}

function resolveTarget(canvasId?: string): CanvasSpatialPerfTarget | null {
	if (canvasId) return targets.get(canvasId) ?? null
	if (latestCanvasId) return targets.get(latestCanvasId) ?? null
	return null
}

function createTargetResult(
	event: "start" | "snapshot" | "stop",
	target: CanvasSpatialPerfTarget,
	profiling: GeometrySpatialQueryProfilingSnapshot | null,
	activity: CanvasSpatialPerfActivityCounters,
): CanvasSpatialPerfResult {
	return {
		event,
		canvasId: target.canvasId,
		elementCount: target.getElementCount(),
		viewportScale: target.getViewportScale(),
		profiling,
		activity,
	}
}

function createActivitySnapshot(
	current: CanvasSpatialPerfActivityCounters,
	baseline: CanvasSpatialPerfActivityCounters,
): CanvasSpatialPerfActivityCounters {
	return {
		visibilityRefreshCount: current.visibilityRefreshCount - baseline.visibilityRefreshCount,
		visibilitySkippedRefreshCount:
			current.visibilitySkippedRefreshCount - baseline.visibilitySkippedRefreshCount,
		drawRequestCount: current.drawRequestCount - baseline.drawRequestCount,
		drawnCount: current.drawnCount - baseline.drawnCount,
		drawFlushCount: current.drawFlushCount - baseline.drawFlushCount,
		drawCoalescedRequestCount:
			current.drawCoalescedRequestCount - baseline.drawCoalescedRequestCount,
		drawSkippedByStageCount: current.drawSkippedByStageCount - baseline.drawSkippedByStageCount,
		lastDrawFlushDurationMs: current.lastDrawFlushDurationMs,
		drawReasonCounts: subtractCounterRecords(
			current.drawReasonCounts,
			baseline.drawReasonCounts,
		),
		drawLayerRequestCounts: subtractCounterRecords(
			current.drawLayerRequestCounts,
			baseline.drawLayerRequestCounts,
		),
		drawLayerDrawnCounts: subtractCounterRecords(
			current.drawLayerDrawnCounts,
			baseline.drawLayerDrawnCounts,
		),
		viewportScaleDispatchCount:
			current.viewportScaleDispatchCount - baseline.viewportScaleDispatchCount,
		viewportScaleCallbackCount:
			current.viewportScaleCallbackCount - baseline.viewportScaleCallbackCount,
		viewportScaleActivationCallbackCount:
			current.viewportScaleActivationCallbackCount -
			baseline.viewportScaleActivationCallbackCount,
		lastVisibilityRefreshDurationMs: current.lastVisibilityRefreshDurationMs,
		registeredMediaCount: current.registeredMediaCount,
		visibleMediaCount: current.visibleMediaCount,
		nearMediaCount: current.nearMediaCount,
		registeredViewportScaleLayoutElementCount:
			current.registeredViewportScaleLayoutElementCount,
		registeredViewportScaleLayoutCallbackCount:
			current.registeredViewportScaleLayoutCallbackCount,
		activeViewportScaleLayoutElementCount: current.activeViewportScaleLayoutElementCount,
		lastViewportScaleLayoutVisitedElementCount:
			current.lastViewportScaleLayoutVisitedElementCount,
		lastViewportScaleLayoutCallbackCount: current.lastViewportScaleLayoutCallbackCount,
	}
}

function subtractCounterRecords(
	current: Record<string, number>,
	baseline: Record<string, number>,
): Record<string, number> {
	return Object.fromEntries(
		Object.entries(current)
			.map(([key, value]) => [key, value - (baseline[key] ?? 0)] as const)
			.filter(([, value]) => value > 0)
			.sort((left, right) => right[1] - left[1]),
	)
}

function getTargetActivitySnapshot(
	target: CanvasSpatialPerfTarget,
): CanvasSpatialPerfActivityCounters {
	const current = target.getActivity()
	const baseline = activityBaselines.get(target.canvasId) ?? current
	return createActivitySnapshot(current, baseline)
}

function missingTargetResult(canvasId?: string): CanvasSpatialPerfResult {
	return {
		event: "error",
		canvasId,
		message: canvasId
			? `Canvas "${canvasId}" is not registered`
			: "No Canvas instance is registered",
	}
}

const debugApi: CanvasSpatialPerfDebugApi = {
	list: () => {
		const targetSummaries = Array.from(targets.values(), (target) => ({
			canvasId: target.canvasId,
			elementCount: target.getElementCount(),
			viewportScale: target.getViewportScale(),
			profiling: target.geometryCacheManager.isSpatialQueryProfiling(),
		}))
		return emitResult({ event: "list", targets: targetSummaries })
	},
	start: (canvasId) => {
		const target = resolveTarget(canvasId)
		if (!target) return emitResult(missingTargetResult(canvasId))
		const activity = target.getActivity()
		activityBaselines.set(target.canvasId, activity)
		target.geometryCacheManager.startSpatialQueryProfiling()
		return emitResult(
			createTargetResult(
				"start",
				target,
				target.geometryCacheManager.getSpatialQueryProfilingSnapshot(),
				createActivitySnapshot(activity, activity),
			),
		)
	},
	snapshot: (canvasId) => {
		const target = resolveTarget(canvasId)
		if (!target) return emitResult(missingTargetResult(canvasId))
		return emitResult(
			createTargetResult(
				"snapshot",
				target,
				target.geometryCacheManager.getSpatialQueryProfilingSnapshot(),
				getTargetActivitySnapshot(target),
			),
		)
	},
	stop: (canvasId) => {
		const target = resolveTarget(canvasId)
		if (!target) return emitResult(missingTargetResult(canvasId))
		const result = createTargetResult(
			"stop",
			target,
			target.geometryCacheManager.stopSpatialQueryProfiling(),
			getTargetActivitySnapshot(target),
		)
		activityBaselines.delete(target.canvasId)
		return emitResult(result)
	},
}

function installGlobalDebugApi(): void {
	if (typeof window === "undefined") return
	const debugGlobal = globalThis as typeof globalThis & {
		[GLOBAL_API_KEY]?: CanvasSpatialPerfDebugApi
	}
	debugGlobal[GLOBAL_API_KEY] = debugApi
}

/**
 * Registers a Canvas without enabling any counters. The explicit console start command creates
 * the profiling session, so normal Canvas usage only retains this lightweight debug handle.
 */
export function registerCanvasSpatialPerfDebugTarget(
	options: RegisterCanvasSpatialPerfDebugTargetOptions,
): () => void {
	const target: CanvasSpatialPerfTarget = options
	targets.set(options.canvasId, target)
	latestCanvasId = options.canvasId
	installGlobalDebugApi()

	return () => {
		if (targets.get(options.canvasId) !== target) return
		targets.delete(options.canvasId)
		activityBaselines.delete(options.canvasId)
		if (latestCanvasId !== options.canvasId) return
		const remainingCanvasIds = Array.from(targets.keys())
		latestCanvasId = remainingCanvasIds[remainingCanvasIds.length - 1] ?? null
	}
}
