import type { LogContext, LoggerPlugin } from "../../types"
import { LogType } from "../../types"
// import { requestIdleCallback } from "../../../utils"
import { fetch } from "../../../helpers/fetch"
import { compressLogData, CompressionType, type CompressionConfig } from "./compression"
import { isDev } from "@/utils/env"
import { merge, chunk } from "lodash-es"

/**
 * Reporter plugin configuration.
 */
export interface ReporterPluginOptions {
	/** Whether the plugin is enabled. */
	enabled?: boolean
	/** Reporter configuration. */
	reporter?: {
		/** Reporter URL. */
		url?: string
		/** Log levels to report. */
		logType?: LogType[]
		/** Whether to report in development. */
		enableInDev?: boolean
		/** Request headers. */
		headers?: Record<string, string>
		/** Request timeout. */
		timeout?: number
		/** Compression configuration. */
		compression?: CompressionConfig
		/** Batch reporting configuration. */
		batch?: {
			/** Whether batch reporting is enabled. */
			enabled?: boolean
			/** Batch size. */
			size?: number
			/** Batch interval in milliseconds. */
			interval?: number
		}
		/** Retry configuration. */
		retry?: {
			/** Maximum number of retries. */
			maxRetries?: number
			/** Retry interval in milliseconds. */
			interval?: number
		}
	}
}

export function formatLogData(context: LogContext) {
	// 新旧记录共用原有 /log-report 队列和接口，仅在单条数据格式化阶段区分协议。
	const runtimeFields = {
		logType: context.logType,
		traceId: context.traceId,
		release: context.release,
		url: context.url,
		info: context.info,
		timestamp: context.timestamp,
	}

	if (context.errorReport) {
		return {
			...runtimeFields,
			...context.errorReport,
		}
	}

	return {
		...runtimeFields,
		namespace: context.namespace,
		data: context.data,
	}
}

/**
 * Log reporter plugin.
 * Sends logs to the server.
 */
export class ReporterPlugin implements LoggerPlugin {
	readonly name = "reporter"
	readonly version = "1.0.0"
	readonly priority = 100 // Lowest priority; runs last.

	enabled = true
	private options: ReporterPluginOptions
	private batchQueue: LogContext[] = []
	private batchTimer: NodeJS.Timeout | null = null

	constructor(options: ReporterPluginOptions = {}) {
		this.options = merge(
			{
				enabled: true,
				reporter: {
					url: "/log-report",
					logType: [LogType.ERROR, LogType.REPORT],
					enableInDev: false,
					headers: {
						"Content-Type": "application/json",
					},
					timeout: 5000,
					compression: {
						type: CompressionType.GZIP,
						threshold: 0,
					},
					batch: {
						enabled: true,
						size: 30,
						interval: 5000,
					},
					retry: {
						maxRetries: 2,
						interval: 1000,
					},
				},
			},
			options || {},
		)
		this.enabled = this.options.enabled ?? true
	}

	init() {
		// Flush the pending log queue when the page is unloaded or closed.
		const beforeUnloadHandler = () => {
			const logs = this.batchQueue.splice(0).map((context) => this.formatLogData(context))
			chunk(logs, 30).map((o) => this.reportLogs(o))
		}
		window.addEventListener("beforeunload", beforeUnloadHandler)
	}

	/**
	 * Check whether this log should be processed.
	 */
	shouldHandle(context: LogContext): boolean {
		const reporterConfig = this.options.reporter!
		// Check whether reporting should be skipped.
		if (context.skipReport) {
			return false
		}

		// Check the log level.
		if (!reporterConfig.logType?.includes(context.logType)) {
			return false
		}

		// Check the development environment setting.
		if (isDev && !reporterConfig.enableInDev) {
			return false
		}

		return true
	}

	/**
	 * Process the log context and report the log.
	 */
	process(context: LogContext): LogContext {
		const reporterConfig = this.options.reporter!

		try {
			if (reporterConfig.batch?.enabled) {
				this.addToBatch(context)
			} else {
				this.sendLog(context)
			}
		} catch (error) {
			console.error("Reporter plugin failed:", error)
		}

		return context
	}

	/**
	 * Send a single log.
	 */
	private sendLog(context: LogContext): void {
		const logData = this.formatLogData(context)
		this.reportLogs([logData])
	}

	/**
	 * Add a log to the batch queue.
	 */
	private addToBatch(context: LogContext): void {
		const batchConfig = this.options.reporter!.batch!

		this.batchQueue.push(context)

		// Check whether the batch size has been reached.
		if (this.batchQueue.length >= (batchConfig.size || 10)) {
			this.flushBatch()
		} else if (!this.batchTimer) {
			// Set the flush timer.
			this.batchTimer = setTimeout(() => {
				this.flushBatch()
			}, batchConfig.interval || 2000)
		}
	}

	/**
	 * Flush the batch queue.
	 */
	private flushBatch(): void {
		if (this.batchQueue.length === 0) return

		const logs = this.batchQueue.splice(0).map((context) => this.formatLogData(context))
		this.reportLogs(logs)

		// Clear the flush timer.
		if (this.batchTimer) {
			clearTimeout(this.batchTimer)
			this.batchTimer = null
		}
	}

	/**
	 * Format log data.
	 */
	private formatLogData(context: LogContext) {
		return formatLogData(context)
	}

	/**
	 * Report log data.
	 */
	private reportLogs(logData: any): void {
		// requestIdleCallback(async () => {
		// 	await this.sendRequest(logData, 0)
		// })
		this.sendRequest(logData, 0)
	}

	/**
	 * Send the request with retry support.
	 */
	private async sendRequest(logData: any, retryCount: number): Promise<void> {
		const reporterConfig = this.options.reporter!
		const retryConfig = reporterConfig.retry!

		try {
			// Compress the log data.
			const compressionResult = await compressLogData(logData, reporterConfig.compression)

			// Prepare request headers.
			const headers = { ...reporterConfig.headers }
			let body: string | Uint8Array

			if (compressionResult.compressed) {
				// Set headers according to the compression type.
				switch (compressionResult.type) {
					case CompressionType.GZIP:
						headers["Content-Encoding"] = "gzip"
						headers["Content-Type"] = "application/octet-stream"
						body = compressionResult.data as Uint8Array
						break
					case CompressionType.LZ_STRING:
						headers["X-Compression"] = "lz-string"
						headers["Content-Type"] = "application/json"
						body = compressionResult.data as string
						break
					default:
						headers["Content-Type"] = "application/json"
						body = compressionResult.data as string
						break
				}
			} else {
				headers["Content-Type"] = "application/json"
				body = compressionResult.data as string
			}

			// const controller = new AbortController()
			// const timeoutId = setTimeout(() => controller.abort(), reporterConfig.timeout || 5000)

			const response = await fetch.internalFetch(reporterConfig.url!, {
				method: "POST",
				headers,
				body,
				keepalive: true,
				// signal: controller.signal,
			})

			// clearTimeout(timeoutId)

			if (!response.ok) {
				console.error(`HTTP ${response.status}: ${response.statusText}`)
			} else {
				// // Record compression results in development only.
				// if (isDev && compressionResult.compressed) {
				// 	console.log(
				// 		`Log compression: ${compressionResult.originalSize} -> ${compressionResult.compressedSize} bytes ` +
				// 			`(${((1 - compressionResult.ratio) * 100).toFixed(1)}% saved)`,
				// 	)
				// }
			}
		} catch (error) {
			console.error("Failed to report logs:", error)

			// Check whether a retry is needed.
			if (retryCount < (retryConfig.maxRetries || 3)) {
				setTimeout(() => {
					this.sendRequest(logData, retryCount + 1)
				}, retryConfig.interval || 1000)
			}
		}
	}

	/**
	 * Destroy the plugin.
	 */
	destroy(): void {
		// Flush remaining batched data.
		this.flushBatch()

		// Clear the flush timer.
		if (this.batchTimer) {
			clearTimeout(this.batchTimer)
			this.batchTimer = null
		}
	}

	/**
	 * Get the queue status.
	 */
	getQueueStatus() {
		return {
			queueSize: this.batchQueue.length,
			batchEnabled: this.options.reporter?.batch?.enabled || false,
			hasPendingTimer: this.batchTimer !== null,
		}
	}

	/**
	 * Manually flush the queue.
	 */
	flush(): void {
		this.flushBatch()
	}
}

/**
 * Reporter plugin factory.
 */
export function createReporterPlugin(options?: ReporterPluginOptions): ReporterPlugin {
	return new ReporterPlugin(options)
}
