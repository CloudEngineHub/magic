import { normalizeTemplateColors } from "./templateColors"
import type { TemplateColorExtractionResponse } from "./templateColorExtractionProtocol"
import { resolveTrustedTemplateColorUrl } from "./templateColorExtractionUrl"

export type TemplateColorExtractionPriority = "background" | "interactive"

interface TemplateColorExtractionTask {
	imageUrl: string
	priority: TemplateColorExtractionPriority
	requestId: string
}

const ALGORITHM_VERSION = "v1"
const MAX_BACKGROUND_QUEUE_SIZE = 160
const MAX_INTERACTIVE_QUEUE_SIZE = 32
const MAX_RESULT_CACHE_SIZE = 400
const FILTER_RESULT_BATCH_SIZE = 4
const FILTER_RESULT_PUBLISH_DELAY_MS = 1_200
const WORKER_TASK_TIMEOUT_MS = 12_000
const WORKER_IDLE_TERMINATE_MS = 30_000
const EMPTY_COLORS: string[] = Object.freeze([]) as string[]

const extractedColorsByUrl = new Map<string, string[]>()
const failedImageUrls = new Set<string>()
const pendingTasksByUrl = new Map<string, TemplateColorExtractionTask>()
const interactiveQueue: TemplateColorExtractionTask[] = []
const backgroundQueue: TemplateColorExtractionTask[] = []
const listenersByUrl = new Map<string, Set<() => void>>()
const publishedResultListeners = new Set<() => void>()
const settledTaskListeners = new Set<() => void>()

let activeTask: TemplateColorExtractionTask | null = null
let activeTaskTimeoutId: number | null = null
let pendingPublishedResultCount = 0
let publishedResultVersion = 0
let publishedResultTimeoutId: number | null = null
let requestSequence = 0
let worker: Worker | null = null
let workerIdleTimeoutId: number | null = null
let isWorkerDisabled = false

function getTemplateColorExtractionAllowedOrigins() {
	const currentOrigin =
		typeof window === "undefined" ? "https://localhost" : window.location.origin
	const runtimeConfig = typeof window === "undefined" ? undefined : window.CONFIG
	return [
		import.meta.env?.MAGIC_CDNHOST,
		import.meta.env?.MAGIC_PUBLIC_CDN_URL,
		runtimeConfig?.MAGIC_CDNHOST,
		runtimeConfig?.MAGIC_PUBLIC_CDN_URL,
	]
		.map((origin) => {
			if (!origin) return ""
			try {
				return new URL(origin, currentOrigin).origin
			} catch {
				return ""
			}
		})
		.filter(Boolean)
}

export function normalizeTemplateColorExtractionImageUrl(imageUrl: string | undefined) {
	if (!imageUrl) return ""

	const currentOrigin =
		typeof window === "undefined" ? "https://localhost" : window.location.origin
	return (
		resolveTrustedTemplateColorUrl({
			allowedOrigins: getTemplateColorExtractionAllowedOrigins(),
			currentOrigin,
			imageUrl,
		})?.toString() ?? ""
	)
}

function getCacheKey(imageUrl: string) {
	return `${ALGORITHM_VERSION}:${imageUrl}`
}

function flushPublishedResults() {
	if (publishedResultTimeoutId != null) {
		window.clearTimeout(publishedResultTimeoutId)
	}
	publishedResultTimeoutId = null
	if (pendingPublishedResultCount === 0) return
	pendingPublishedResultCount = 0
	publishedResultVersion += 1
	publishedResultListeners.forEach((listener) => listener())
}

function schedulePublishedResults() {
	if (publishedResultListeners.size === 0) return
	pendingPublishedResultCount += 1
	if (pendingPublishedResultCount >= FILTER_RESULT_BATCH_SIZE) {
		flushPublishedResults()
		return
	}
	if (publishedResultTimeoutId != null) return
	publishedResultTimeoutId = window.setTimeout(
		flushPublishedResults,
		FILTER_RESULT_PUBLISH_DELAY_MS,
	)
}

function notifyTaskSettled() {
	settledTaskListeners.forEach((listener) => listener())
}

function notifyResolvedImage(imageUrl: string) {
	listenersByUrl.get(imageUrl)?.forEach((listener) => listener())
	schedulePublishedResults()
}

function rememberFailure(cacheKey: string) {
	failedImageUrls.add(cacheKey)
	if (failedImageUrls.size <= MAX_RESULT_CACHE_SIZE) return

	const oldestCacheKey = failedImageUrls.values().next().value
	if (oldestCacheKey) failedImageUrls.delete(oldestCacheKey)
}

function rememberExtractedColors(cacheKey: string, colors: string[]) {
	extractedColorsByUrl.set(cacheKey, colors)
	if (extractedColorsByUrl.size <= MAX_RESULT_CACHE_SIZE) return

	const oldestCacheKey = extractedColorsByUrl.keys().next().value
	if (oldestCacheKey) extractedColorsByUrl.delete(oldestCacheKey)
}

function clearActiveTaskTimeout() {
	if (activeTaskTimeoutId == null) return
	window.clearTimeout(activeTaskTimeoutId)
	activeTaskTimeoutId = null
}

function clearWorkerIdleTimeout() {
	if (workerIdleTimeoutId == null) return
	window.clearTimeout(workerIdleTimeoutId)
	workerIdleTimeoutId = null
}

function scheduleWorkerIdleTermination() {
	clearWorkerIdleTimeout()
	if (!worker || activeTask || interactiveQueue.length > 0 || backgroundQueue.length > 0) return

	workerIdleTimeoutId = window.setTimeout(() => {
		workerIdleTimeoutId = null
		if (activeTask || interactiveQueue.length > 0 || backgroundQueue.length > 0) return
		worker?.terminate()
		worker = null
	}, WORKER_IDLE_TERMINATE_MS)
}

function removeTaskFromQueue(
	queue: TemplateColorExtractionTask[],
	task: TemplateColorExtractionTask,
) {
	const taskIndex = queue.indexOf(task)
	if (taskIndex >= 0) queue.splice(taskIndex, 1)
}

function markTaskFailed(task: TemplateColorExtractionTask) {
	rememberFailure(getCacheKey(task.imageUrl))
	pendingTasksByUrl.delete(task.imageUrl)
}

function enqueueInteractiveTask(task: TemplateColorExtractionTask) {
	interactiveQueue.unshift(task)
	if (interactiveQueue.length <= MAX_INTERACTIVE_QUEUE_SIZE) return

	const downgradedTask = interactiveQueue.pop()
	if (!downgradedTask) return
	if (backgroundQueue.length < MAX_BACKGROUND_QUEUE_SIZE) {
		downgradedTask.priority = "background"
		backgroundQueue.push(downgradedTask)
		return
	}
	pendingTasksByUrl.delete(downgradedTask.imageUrl)
}

function disableWorker() {
	isWorkerDisabled = true
	clearActiveTaskTimeout()
	clearWorkerIdleTimeout()
	worker?.terminate()
	worker = null

	if (activeTask) {
		markTaskFailed(activeTask)
		activeTask = null
	}
	for (const task of [...interactiveQueue, ...backgroundQueue]) {
		markTaskFailed(task)
	}
	interactiveQueue.length = 0
	backgroundQueue.length = 0
}

function handleWorkerMessage(event: MessageEvent<TemplateColorExtractionResponse>) {
	const task = activeTask
	if (!task || event.data.requestId !== task.requestId) return

	clearActiveTaskTimeout()
	activeTask = null
	pendingTasksByUrl.delete(task.imageUrl)

	const colors = normalizeTemplateColors(event.data.colors)
	if (event.data.error || colors.length === 0) {
		rememberFailure(getCacheKey(task.imageUrl))
	} else {
		rememberExtractedColors(getCacheKey(task.imageUrl), colors)
		notifyResolvedImage(task.imageUrl)
	}

	processNextTask()
	notifyTaskSettled()
	scheduleWorkerIdleTermination()
}

function getWorker() {
	clearWorkerIdleTimeout()
	if (worker) return worker
	if (isWorkerDisabled || typeof Worker !== "function") return null

	worker = new Worker(new URL("./templateColorExtraction.worker.ts", import.meta.url), {
		type: "module",
	})
	worker.onmessage = handleWorkerMessage
	worker.onerror = () => disableWorker()
	return worker
}

function processNextTask() {
	if (activeTask || isWorkerDisabled) return

	const nextTask = interactiveQueue.shift() ?? backgroundQueue.shift()
	if (!nextTask) return

	activeTask = nextTask
	const colorWorker = getWorker()
	if (!colorWorker) {
		disableWorker()
		return
	}

	activeTaskTimeoutId = window.setTimeout(() => {
		const timedOutTask = activeTask
		if (!timedOutTask) return

		worker?.terminate()
		worker = null
		activeTask = null
		activeTaskTimeoutId = null
		markTaskFailed(timedOutTask)
		processNextTask()
		notifyTaskSettled()
		scheduleWorkerIdleTermination()
	}, WORKER_TASK_TIMEOUT_MS)
	colorWorker.postMessage({
		allowedOrigins: getTemplateColorExtractionAllowedOrigins(),
		imageUrl: nextTask.imageUrl,
		requestId: nextTask.requestId,
	})
}

export function requestTemplateColorExtraction(
	imageUrl: string | undefined,
	priority: TemplateColorExtractionPriority,
) {
	if (isWorkerDisabled) return
	const normalizedImageUrl = normalizeTemplateColorExtractionImageUrl(imageUrl)
	if (!normalizedImageUrl) return

	const cacheKey = getCacheKey(normalizedImageUrl)
	if (extractedColorsByUrl.has(cacheKey) || failedImageUrls.has(cacheKey)) return

	const pendingTask = pendingTasksByUrl.get(normalizedImageUrl)
	if (pendingTask) {
		if (priority === "interactive" && pendingTask.priority === "background") {
			pendingTask.priority = "interactive"
			removeTaskFromQueue(backgroundQueue, pendingTask)
			if (pendingTask !== activeTask) enqueueInteractiveTask(pendingTask)
		}
		return
	}

	if (priority === "background" && backgroundQueue.length >= MAX_BACKGROUND_QUEUE_SIZE) return

	requestSequence += 1
	const task: TemplateColorExtractionTask = {
		imageUrl: normalizedImageUrl,
		priority,
		requestId: `template-color-${requestSequence}`,
	}
	pendingTasksByUrl.set(normalizedImageUrl, task)
	if (priority === "interactive") {
		enqueueInteractiveTask(task)
	} else {
		backgroundQueue.push(task)
	}
	processNextTask()
}

export function clearTemplateColorExtractionBackgroundQueue() {
	for (const task of backgroundQueue) {
		pendingTasksByUrl.delete(task.imageUrl)
	}
	backgroundQueue.length = 0
	scheduleWorkerIdleTermination()
}

export function getExtractedTemplateColors(imageUrl: string | undefined) {
	const normalizedImageUrl = normalizeTemplateColorExtractionImageUrl(imageUrl)
	if (!normalizedImageUrl) return EMPTY_COLORS
	return extractedColorsByUrl.get(getCacheKey(normalizedImageUrl)) ?? EMPTY_COLORS
}

export function subscribeTemplateColorExtraction(
	imageUrl: string | undefined,
	listener: () => void,
) {
	const normalizedImageUrl = normalizeTemplateColorExtractionImageUrl(imageUrl)
	if (!normalizedImageUrl) return () => undefined

	const listeners = listenersByUrl.get(normalizedImageUrl) ?? new Set<() => void>()
	listeners.add(listener)
	listenersByUrl.set(normalizedImageUrl, listeners)

	return () => {
		listeners.delete(listener)
		if (listeners.size === 0) listenersByUrl.delete(normalizedImageUrl)
	}
}

export function getTemplateColorExtractionVersion() {
	return publishedResultVersion
}

export function subscribeTemplateColorExtractionChanges(listener: () => void) {
	publishedResultListeners.add(listener)
	return () => {
		publishedResultListeners.delete(listener)
		if (publishedResultListeners.size > 0) return
		if (publishedResultTimeoutId != null) {
			window.clearTimeout(publishedResultTimeoutId)
			publishedResultTimeoutId = null
		}
		pendingPublishedResultCount = 0
	}
}

export function subscribeTemplateColorExtractionSettled(listener: () => void) {
	settledTaskListeners.add(listener)
	return () => {
		settledTaskListeners.delete(listener)
	}
}
