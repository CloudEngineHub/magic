export type ManualPerfLogType = "event" | "metric" | "duration" | "count" | "error"

export type MetricDataFactory<T> =
	| Record<string, unknown>
	| ((result: T) => Record<string, unknown>)

export interface ManualPerfLog {
	timestamp: number
	time: string
	type: ManualPerfLogType
	metric?: string
	stage?: string
	value?: number
	data: Record<string, unknown>
	error?: unknown
}

export interface ManualPerfSummaryItem {
	metric: string
	count: number
	min: number
	p50: number
	p95: number
	max: number
	avg: number
}

export interface ManualPerfLoggerOptions {
	storageKey: string
	label: string
	sessionPrefix: string
	legacyStorageKeys?: string[]
	maxLogs?: number
	longTaskThresholdMs?: number
}

const DEFAULT_MAX_LOGS = 2000
const DEFAULT_LONG_TASK_THRESHOLD_MS = 50

function formatTimestamp(timestamp: number): string {
	const date = new Date(timestamp)
	const hours = String(date.getHours()).padStart(2, "0")
	const minutes = String(date.getMinutes()).padStart(2, "0")
	const seconds = String(date.getSeconds()).padStart(2, "0")
	const ms = String(date.getMilliseconds()).padStart(3, "0")
	return `${hours}:${minutes}:${seconds}.${ms}`
}

function now(): number {
	if (typeof performance !== "undefined" && typeof performance.now === "function") {
		return performance.now()
	}
	return Date.now()
}

function roundMetric(value: number): number {
	return Math.round(value * 100) / 100
}

function percentile(sortedValues: number[], ratio: number): number {
	if (sortedValues.length === 0) return 0
	const index = Math.min(sortedValues.length - 1, Math.ceil(sortedValues.length * ratio) - 1)
	return sortedValues[index]
}

function sanitizeValue(value: unknown, depth = 0): unknown {
	if (depth > 3) return "[depth-limit]"
	if (value === null || value === undefined) return value
	if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
		return value
	}
	if (Array.isArray(value)) {
		return {
			length: value.length,
			sample: value.slice(0, 3).map((item) => sanitizeValue(item, depth + 1)),
		}
	}
	if (typeof value === "object") {
		const result: Record<string, unknown> = {}
		Object.entries(value as Record<string, unknown>).forEach(([key, childValue]) => {
			if (
				/file(_|-)?(id|key|name)|filename|display_filename|relative_file_path|path|project_?id/i.test(
					key,
				)
			) {
				result[key] = "[redacted]"
				return
			}
			result[key] = sanitizeValue(childValue, depth + 1)
		})
		return result
	}
	return String(value)
}

function sanitizeData(data: Record<string, unknown> = {}): Record<string, unknown> {
	return sanitizeValue(data) as Record<string, unknown>
}

export function resolveMetricData<T>(data: MetricDataFactory<T> | undefined, result: T) {
	if (!data) return {}
	return typeof data === "function" ? data(result) : data
}

export function estimateObjectSizeMb(value: unknown): number | null {
	try {
		const json = JSON.stringify(value)
		const bytes = typeof Blob !== "undefined" ? new Blob([json]).size : json.length
		return roundMetric(bytes / 1024 / 1024)
	} catch (_error) {
		return null
	}
}

export class ManualPerfLogger {
	private enabled = false
	private logs: ManualPerfLog[] = []
	private sessionId: string | null = null
	private startTime = 0
	private marks = new Map<string, { startedAt: number; data: Record<string, unknown> }>()
	private longTaskObserver: PerformanceObserver | null = null
	private longTaskCount = 0
	private longTaskDurationMs = 0
	private readonly maxLogs: number
	private readonly longTaskThresholdMs: number

	constructor(private readonly options: ManualPerfLoggerOptions) {
		this.maxLogs = options.maxLogs ?? DEFAULT_MAX_LOGS
		this.longTaskThresholdMs = options.longTaskThresholdMs ?? DEFAULT_LONG_TASK_THRESHOLD_MS

		if (typeof window === "undefined") return

		const savedState = window.localStorage.getItem(options.storageKey)
		const legacyEnabled = options.legacyStorageKeys?.some(
			(key) => window.localStorage.getItem(key) === "true",
		)
		if (savedState === "true" || legacyEnabled) {
			this.enabled = true
		}
	}

	enable() {
		this.enabled = true
		if (typeof window !== "undefined") {
			window.localStorage.setItem(this.options.storageKey, "true")
		}
		this.observeLongTask()
	}

	disable() {
		this.enabled = false
		if (typeof window !== "undefined") {
			window.localStorage.removeItem(this.options.storageKey)
			this.options.legacyStorageKeys?.forEach((key) => {
				window.localStorage.removeItem(key)
			})
		}
		this.stopLongTaskObserver()
	}

	isEnabled() {
		return this.enabled
	}

	hasActiveSession() {
		return Boolean(this.sessionId)
	}

	ensureSession(data: Record<string, unknown> = {}) {
		if (!this.enabled) return
		if (!this.sessionId) {
			this.startSession(data)
			return
		}
		this.log("session_context", data)
	}

	hasMark(mark: string) {
		return this.marks.has(mark)
	}

	ensureMarkStart(mark: string, data: Record<string, unknown> = {}) {
		if (!this.enabled || this.hasMark(mark)) return
		this.markStart(mark, data)
	}

	now() {
		return now()
	}

	startSession(data: Record<string, unknown> = {}) {
		if (!this.enabled) return

		if (this.sessionId) {
			this.finishSession({ reason: "restart" })
		}

		this.sessionId = `${this.options.sessionPrefix}-${Date.now()}-${Math.random()
			.toString(36)
			.slice(2, 11)}`
		this.startTime = Date.now()
		this.marks.clear()
		this.longTaskCount = 0
		this.longTaskDurationMs = 0
		this.observeLongTask()
		this.log("session_start", data)
	}

	finishSession(data: Record<string, unknown> = {}) {
		if (!this.enabled || !this.sessionId) return

		const totalElapsed = Date.now() - this.startTime
		this.log("session_end", {
			...data,
			total_elapsed_ms: totalElapsed,
			long_task_count: this.longTaskCount,
			long_task_total_ms: roundMetric(this.longTaskDurationMs),
		})
		this.sessionId = null
		this.startTime = 0
		this.marks.clear()
	}

	log(stage: string, data: Record<string, unknown> = {}) {
		if (!this.enabled) return
		this.pushLog({ type: "event", stage, data })
	}

	logError(stage: string, error: unknown, data: Record<string, unknown> = {}) {
		if (!this.enabled) return
		this.pushLog({ type: "error", stage, data, error: sanitizeValue(error) })
		console.error(`[${this.options.label}] ${stage}`, sanitizeData(data), error)
	}

	markStart(mark: string, data: Record<string, unknown> = {}) {
		if (!this.enabled) return
		this.marks.set(mark, { startedAt: now(), data: sanitizeData(data) })
		this.log(`${mark}_start`, data)
	}

	markEnd(mark: string, data: Record<string, unknown> = {}) {
		if (!this.enabled) return
		const started = this.marks.get(mark)
		if (!started) return

		this.recordDuration(mark, started.startedAt, {
			...started.data,
			...data,
		})
		this.marks.delete(mark)
	}

	recordDuration(metric: string, startedAt: number, data: Record<string, unknown> = {}) {
		if (!this.enabled) return
		this.recordMetric(metric, roundMetric(now() - startedAt), data, "duration")
	}

	recordMetric(
		metric: string,
		value: number,
		data: Record<string, unknown> = {},
		type: ManualPerfLogType = "metric",
	) {
		if (!this.enabled) return
		this.pushLog({ type, metric, value: roundMetric(value), data })
	}

	count(metric: string, value = 1, data: Record<string, unknown> = {}) {
		this.recordMetric(metric, value, data, "count")
	}

	measure<T>(metric: string, callback: () => T, data: Record<string, unknown> = {}): T {
		if (!this.enabled) return callback()

		const startedAt = now()
		try {
			const result = callback()
			this.recordDuration(metric, startedAt, data)
			return result
		} catch (error) {
			this.logError(`${metric}_error`, error, data)
			throw error
		}
	}

	async measureAsync<T>(
		metric: string,
		callback: () => Promise<T>,
		data: Record<string, unknown> = {},
	): Promise<T> {
		if (!this.enabled) return callback()

		const startedAt = now()
		try {
			const result = await callback()
			this.recordDuration(metric, startedAt, data)
			return result
		} catch (error) {
			this.logError(`${metric}_error`, error, data)
			throw error
		}
	}

	recordStats(source: string, stats: Record<string, number>, data: Record<string, unknown> = {}) {
		if (!this.enabled) return
		Object.entries(stats).forEach(([metric, value]) => {
			this.recordMetric(metric, value, { source, ...data })
		})
	}

	snapshotHeap(stage: string, data: Record<string, unknown> = {}) {
		if (!this.enabled || typeof performance === "undefined") return

		const memory = (
			performance as Performance & {
				memory?: {
					usedJSHeapSize?: number
					totalJSHeapSize?: number
					jsHeapSizeLimit?: number
				}
			}
		).memory

		if (!memory?.usedJSHeapSize) return

		this.recordMetric("js_heap_used_mb", roundMetric(memory.usedJSHeapSize / 1024 / 1024), {
			stage,
			...data,
		})
	}

	observeLongTask() {
		if (!this.enabled || this.longTaskObserver || typeof window === "undefined") return
		if (typeof window.PerformanceObserver === "undefined") return

		try {
			this.longTaskObserver = new PerformanceObserver((list) => {
				list.getEntries().forEach((entry) => {
					if (entry.duration < this.longTaskThresholdMs) return
					this.longTaskCount += 1
					this.longTaskDurationMs += entry.duration
					this.recordMetric("long_task_count", this.longTaskCount, {
						duration_ms: roundMetric(entry.duration),
						start_time_ms: roundMetric(entry.startTime),
					})
				})
			})
			this.longTaskObserver.observe({ entryTypes: ["longtask"] })
		} catch (error) {
			this.longTaskObserver = null
			this.logError("observe_long_task_error", error)
		}
	}

	stopLongTaskObserver() {
		this.longTaskObserver?.disconnect()
		this.longTaskObserver = null
	}

	getLogs() {
		return this.logs
	}

	getSummary(): ManualPerfSummaryItem[] {
		const groups = new Map<string, number[]>()

		this.logs.forEach((log) => {
			if (!log.metric || typeof log.value !== "number") return
			const values = groups.get(log.metric) || []
			values.push(log.value)
			groups.set(log.metric, values)
		})

		return Array.from(groups.entries())
			.map(([metric, values]) => {
				const sortedValues = [...values].sort((a, b) => a - b)
				const total = sortedValues.reduce((sum, value) => sum + value, 0)
				return {
					metric,
					count: sortedValues.length,
					min: sortedValues[0] ?? 0,
					p50: percentile(sortedValues, 0.5),
					p95: percentile(sortedValues, 0.95),
					max: sortedValues[sortedValues.length - 1] ?? 0,
					avg: roundMetric(total / sortedValues.length),
				}
			})
			.sort((a, b) => a.metric.localeCompare(b.metric))
	}

	flushToConsoleTable() {
		if (!this.enabled) return
		console.table(this.logs)
		return this.logs
	}

	flushSummaryToConsole() {
		if (!this.enabled) return
		const summary = this.getSummary()
		if (summary.length > 0) {
			console.table(summary)
		}
		return summary
	}

	exportLogs() {
		const exportData = {
			sessionId: this.sessionId,
			startTime: this.startTime,
			startTimeFormatted: this.startTime ? formatTimestamp(this.startTime) : "",
			totalTime: this.startTime ? Date.now() - this.startTime : 0,
			logsCount: this.logs.length,
			summary: this.getSummary(),
			logs: this.logs,
		}
		const json = JSON.stringify(exportData, null, 2)

		if (typeof navigator !== "undefined" && navigator.clipboard) {
			navigator.clipboard.writeText(json).catch((error) => {
				console.error(`[${this.options.label}] copy failed`, error)
			})
		}

		return exportData
	}

	clearLogs() {
		this.logs = []
		this.sessionId = null
		this.startTime = 0
		this.marks.clear()
		this.longTaskCount = 0
		this.longTaskDurationMs = 0
	}

	private shouldDebugToConsole() {
		if (typeof window === "undefined") return false
		return window.localStorage.getItem(`${this.options.storageKey}:consoleDebug`) === "true"
	}

	private pushLog(entry: {
		type: ManualPerfLogType
		metric?: string
		stage?: string
		value?: number
		data?: Record<string, unknown>
		error?: unknown
	}) {
		const timestamp = Date.now()
		const elapsed = this.startTime ? timestamp - this.startTime : 0
		const log: ManualPerfLog = {
			timestamp,
			time: formatTimestamp(timestamp),
			type: entry.type,
			metric: entry.metric,
			stage: entry.stage,
			value: entry.value,
			data: sanitizeData({
				...entry.data,
				sessionId: this.sessionId,
				elapsed,
			}),
			error: entry.error,
		}

		this.logs.push(log)
		if (this.logs.length > this.maxLogs) {
			this.logs.splice(0, this.logs.length - this.maxLogs)
		}

		if (entry.type === "error") return
		if (!this.shouldDebugToConsole()) return
		if (entry.type === "duration" || entry.type === "metric" || entry.type === "count") {
			console.debug(`[${this.options.label}] ${entry.metric}: ${entry.value}`, log.data)
			return
		}
		console.debug(`[${this.options.label}] ${entry.stage}`, log.data)
	}
}

export function measurePerfOperation<T>(
	logger: ManualPerfLogger,
	metric: string,
	callback: () => T,
	data?: MetricDataFactory<T>,
): T {
	if (!logger.isEnabled()) return callback()

	const startedAt = logger.now()
	try {
		const result = callback()
		logger.recordDuration(metric, startedAt, resolveMetricData(data, result))
		return result
	} catch (error) {
		logger.logError(`${metric}_error`, error)
		throw error
	}
}

export async function measurePerfAsyncOperation<T>(
	logger: ManualPerfLogger,
	metric: string,
	callback: () => Promise<T>,
	data?: MetricDataFactory<T>,
): Promise<T> {
	if (!logger.isEnabled()) return callback()

	const startedAt = logger.now()
	try {
		const result = await callback()
		logger.recordDuration(metric, startedAt, resolveMetricData(data, result))
		return result
	} catch (error) {
		logger.logError(`${metric}_error`, error)
		throw error
	}
}

export function createPerfScope<TStats extends Record<string, number>>(
	logger: ManualPerfLogger,
	getStats: () => TStats,
) {
	const enabled = logger.isEnabled()
	const stats = enabled ? getStats() : undefined

	return {
		stats,
		start() {
			return enabled ? logger.now() : 0
		},
		measure<T>(metric: string, callback: () => T, data?: MetricDataFactory<T>): T {
			if (!enabled) return callback()

			const startedAt = logger.now()
			try {
				const result = callback()
				logger.recordDuration(metric, startedAt, {
					...stats,
					...resolveMetricData(data, result),
				})
				return result
			} catch (error) {
				logger.logError(`${metric}_error`, error, stats || {})
				throw error
			}
		},
		recordDuration(metric: string, startedAt: number, data: Record<string, unknown> = {}) {
			if (!enabled) return
			logger.recordDuration(metric, startedAt, {
				...stats,
				...data,
			})
		},
		snapshotHeap(stage: string, data: Record<string, unknown> = {}) {
			if (!enabled) return
			logger.snapshotHeap(stage, {
				...stats,
				...data,
			})
		},
	}
}

export const manualPerfLogger = new ManualPerfLogger({
	storageKey: "manualPerfLoggerEnabled",
	legacyStorageKeys: ["fileSystemPerfLoggerEnabled"],
	label: "ManualPerfLogger",
	sessionPrefix: "manual-perf",
})

export function measureManualPerfOperation<T>(
	metric: string,
	callback: () => T,
	data?: MetricDataFactory<T>,
): T {
	return measurePerfOperation(manualPerfLogger, metric, callback, data)
}

export function measureManualPerfAsyncOperation<T>(
	metric: string,
	callback: () => Promise<T>,
	data?: MetricDataFactory<T>,
): Promise<T> {
	return measurePerfAsyncOperation(manualPerfLogger, metric, callback, data)
}

export function createManualPerfScope<TStats extends Record<string, number>>(
	getStats: () => TStats,
) {
	return createPerfScope(manualPerfLogger, getStats)
}

declare global {
	interface Window {
		manualPerfLogger: ManualPerfLogger
		enableManualPerfLogger: () => void
		disableManualPerfLogger: () => void
		startManualPerfSession: (data?: Record<string, unknown>) => void
		finishManualPerfSession: (data?: Record<string, unknown>) => void
		getManualPerfLogs: () => ManualPerfLog[]
		getManualPerfSummary: () => ManualPerfSummaryItem[]
		exportManualPerfLogs: () => ReturnType<ManualPerfLogger["exportLogs"]>
		clearManualPerfLogs: () => void
		flushManualPerfLogs: () => ManualPerfLog[] | undefined
	}
}

if (typeof window !== "undefined") {
	window.manualPerfLogger = manualPerfLogger
	window.enableManualPerfLogger = () => manualPerfLogger.enable()
	window.disableManualPerfLogger = () => manualPerfLogger.disable()
	window.startManualPerfSession = (data) => manualPerfLogger.startSession(data)
	window.finishManualPerfSession = (data) => manualPerfLogger.finishSession(data)
	window.getManualPerfLogs = () => {
		console.table(manualPerfLogger.getLogs())
		return manualPerfLogger.getLogs()
	}
	window.getManualPerfSummary = () => manualPerfLogger.flushSummaryToConsole() || []
	window.exportManualPerfLogs = () => manualPerfLogger.exportLogs()
	window.clearManualPerfLogs = () => manualPerfLogger.clearLogs()
	window.flushManualPerfLogs = () => manualPerfLogger.flushToConsoleTable()
}
