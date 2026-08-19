import type { LogContext, LoggerPlugin } from "../types"
import type Logger from "../../Logger"
import { fetch as originFetch } from "../../helpers/fetch"
import { UrlUtils } from "@/apis/utils"

/**
 * Configuration for the Fetch monitoring plugin.
 */
export interface FetchMonitorPluginOptions {
	/** Whether the plugin is enabled */
	enabled?: boolean
	/** Slow API threshold in milliseconds; requests exceeding it are marked as slow (default: 3000) */
	slowApiThreshold?: number
	/** URL patterns to exclude; supports strings and regular expressions */
	excludeUrls?: (string | RegExp)[]
}

/**
 * API request information.
 */
interface ApiRequestInfo {
	/** Request URL */
	url: string
	/** Request body */
	body?: string
	/** Request headers */
	headers: Record<string, string>
	/** HTTP request method */
	method: string
	/** Request start timestamp */
	startTime: number
	/** Request duration in milliseconds */
	duration?: number
	/** HTTP response status code */
	status?: number
	/** HTTP response status text */
	statusText?: string
	/** Error encountered during the request */
	error?: Error | string
	/** Business response code */
	responseCode?: string
}

/**
 * Fetch API monitoring plugin.
 *
 * Core capabilities:
 * - Intercepts all fetch requests
 * - Detects slow and failed requests
 * - Reports monitoring data through logger.report
 * - Delegates data processing and redaction to other plugins
 */
export class FetchMonitorPlugin implements LoggerPlugin {
	readonly name = "fetch-monitor"
	readonly version = "1.0.0"
	readonly priority = 5 // High priority ensures early interception.

	public enabled = true
	private options: Required<FetchMonitorPluginOptions>
	private logger: Logger | null = null
	private isInitialized = false

	constructor(options: FetchMonitorPluginOptions = {}) {
		// Set the default configuration.
		this.options = {
			enabled: true,
			slowApiThreshold: 800, // 3 seconds
			excludeUrls: [
				/.*\.(js|json|css|png|jpg|jpeg|gif|svg|webp|webm|ico|woff|woff2|ttf|eot|wasm|br|gz)(\?.*)?$/, // Exclude static assets, including WebAssembly.
			],
			...options,
		}

		this.enabled = this.options.enabled
	}

	/**
	 * Initializes the plugin and intercepts the Fetch API.
	 */
	init(logger: Logger): void {
		if (this.isInitialized || typeof window === "undefined") {
			return
		}

		this.logger = logger
		this.interceptFetch()
		this.isInitialized = true
	}

	/**
	 * Checks whether this plugin should process the log. It only intercepts requests.
	 */
	shouldHandle(): boolean {
		return false
	}

	/**
	 * Processes the log context. This plugin does not modify logs.
	 */
	process(context: LogContext): LogContext {
		return context
	}

	/**
	 * Intercepts the Fetch API.
	 */
	private interceptFetch(): void {
		// eslint-disable-next-line @typescript-eslint/no-this-alias
		const self = this

		window.fetch = async function (
			input: RequestInfo | URL,
			init?: RequestInit,
		): Promise<Response> {
			const url = self.extractUrl(input)
			const method = init?.method || "GET"

			const fetch = originFetch.getInstance()

			// Check whether this request should be monitored.
			if (!url || !self.shouldMonitorRequest(url)) {
				return fetch.call(this, input, init)
			}

			// Collect request headers.
			const headers: Record<string, any> = {}
			;(init?.headers as Headers)?.forEach?.((v, k) => {
				headers[k] = v
			})

			// Create the request record.
			const requestInfo: ApiRequestInfo = {
				url,
				headers,
				body: typeof init?.body === "string" ? init.body : undefined,
				method: method.toUpperCase(),
				startTime: performance.now(),
			}

			try {
				// Execute the original request.
				const response = await fetch.call(this, input, init)
				// Record the successful response.
				requestInfo.duration = performance.now() - requestInfo.startTime
				requestInfo.status = response.status
				requestInfo.statusText = response.statusText

				// Monitoring is deliberately fire-and-forget. The monitor must never
				// delay, replace, or reject the business response returned to HttpClient.
				try {
					self.checkSlowApi(requestInfo)
				} catch (error) {
					console.error("[FetchMonitorPlugin] slow API monitoring failed", error)
				}
				void self.inspectResponse(response, requestInfo)

				return response
			} catch (error: any) {
				// Record the failed response.
				requestInfo.duration = performance.now() - requestInfo.startTime

				// Preserve the original fetch rejection so HttpClient remains the
				// single owner of request error handling and business recovery.
				try {
					self.reportError(requestInfo, error)
				} catch (reportError) {
					console.error(
						"[FetchMonitorPlugin] network error reporting failed",
						reportError,
					)
				}

				throw error
			}
		}
	}

	/**
	 * Inspect a cloned response without changing the response consumed by the
	 * business client. All monitoring failures are isolated to this task.
	 */
	private async inspectResponse(response: Response, requestInfo: ApiRequestInfo): Promise<void> {
		try {
			if (this.isStreamingResponse(requestInfo, response)) return

			const jsonData = (await UrlUtils.responseParse(response.clone())).data
			const isBusinessError = jsonData?.code && jsonData.code !== 1000
			const isHttpError = requestInfo.status !== undefined && requestInfo.status !== 200

			if (isBusinessError || isHttpError) {
				requestInfo.responseCode = jsonData?.code
				this.reportError(requestInfo, new Error("stack trace"))
			}
		} catch (error) {
			console.error("[FetchMonitorPlugin] response inspection failed", error)
		}
	}

	/**
	 * Safely extracts the URL.
	 */
	private extractUrl(input: RequestInfo | URL): string | null {
		try {
			if (typeof input === "string") {
				return input
			} else if (input instanceof URL) {
				return input.href
			} else {
				return input.url
			}
		} catch {
			return null
		}
	}

	/**
	 * Checks whether this request should be monitored.
	 */
	private shouldMonitorRequest(url: string): boolean {
		return !this.options.excludeUrls.some((pattern) => {
			if (typeof pattern === "string") {
				return url.includes(pattern)
			}
			return pattern.test(url)
		})
	}

	private isStreamingResponse(requestInfo: ApiRequestInfo, response: Response): boolean {
		const requestAccept = String(requestInfo.headers.accept || requestInfo.headers.Accept || "")
		const responseContentType = response.headers.get("content-type") || ""

		return (
			requestAccept.toLowerCase().includes("text/event-stream") ||
			responseContentType.toLowerCase().includes("text/event-stream")
		)
	}

	/**
	 * Checks the request result and reports it.
	 */
	private checkSlowApi(requestInfo: ApiRequestInfo): void {
		// Check for a slow request.
		if (requestInfo.duration && requestInfo.duration >= this.options.slowApiThreshold) {
			this.reportSlowApi(requestInfo)
		}

		// // Check for an HTTP error status code.
		// if (requestInfo.status && requestInfo.status !== 200) {
		// 	this.reportError(requestInfo)
		// }
	}

	/**
	 * Reports a slow request.
	 */
	private reportSlowApi(requestInfo: ApiRequestInfo): void {
		if (!this.logger) return

		this.logger.report({
			namespace: "slowApi",
			data: {
				url: requestInfo.url,
				method: requestInfo.method,
				headers: requestInfo.headers,
				duration: requestInfo.duration,
				threshold: this.options.slowApiThreshold,
				status: requestInfo.status,
				statusText: requestInfo.statusText,
			},
		})
	}

	/**
	 * Reports a failed request.
	 */
	private reportError(requestInfo: ApiRequestInfo, arg: any): void {
		if (!this.logger) return

		this.logger.report({
			namespace: "apiError",
			data: {
				url: requestInfo.url,
				headers: requestInfo.headers,
				body: requestInfo.body ? requestInfo.body.slice(0, 2048) : undefined,
				method: requestInfo.method,
				duration: requestInfo.duration,
				status: requestInfo.status,
				statusText: requestInfo.statusText,
				responseCode: requestInfo.responseCode,
				error: requestInfo.error,
				arg,
			},
		})
	}

	/**
	 * Destroys the plugin.
	 */
	destroy(): void {
		// Restore the original fetch implementation.
		if (this.isInitialized && typeof window !== "undefined") {
			window.fetch = originFetch.getInstance()
		}

		this.isInitialized = false
		this.logger = null
	}
}

/**
 * Factory function for the Fetch monitoring plugin.
 *
 * Usage example:
 * ```typescript
 * const fetchMonitor = createFetchMonitorPlugin({
 *   slowApiThreshold: 5000, // Treat requests slower than 5 seconds as slow.
 *   excludeUrls: [/analytics/, /tracking/], // Exclude analytics endpoints.
 * })
 *
 * logger.plugin(fetchMonitor)
 * ```
 */
export function createFetchMonitorPlugin(options?: FetchMonitorPluginOptions): FetchMonitorPlugin {
	return new FetchMonitorPlugin(options)
}
