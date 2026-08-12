import { parseJsonLargeIntAsString } from "@/utils/parse-json-large-int"

export interface ResponseParseOptions {
	/** When true, quote 16+ digit JSON integers before parse to avoid precision loss */
	parseJsonLargeIntAsString?: boolean
}

/**
 * Raised when an HTTP response was received but its body could not be parsed.
 * Keeping the original response makes this distinguishable from a fetch-level
 * network error while still allowing the existing error-interceptor path to
 * handle it consistently.
 */
export class ResponseParseError extends Error {
	readonly response: Response
	readonly contentType: string
	readonly rawText?: string

	constructor(
		message: string,
		response: Response,
		contentType: string,
		rawText?: string,
		cause?: unknown,
	) {
		super(message)
		this.name = "ResponseParseError"
		this.response = response
		this.contentType = contentType
		this.rawText = rawText
		if (cause !== undefined) {
			;(this as Error & { cause?: unknown }).cause = cause
		}
	}
}

export class UrlUtils {
	/**
	 * Checks whether a URL contains a host.
	 * @param url - The URL string to check
	 */
	static hasHost(url: string) {
		try {
			return !!new URL(url).host
		} catch {
			return url.startsWith("//")
		}
	}

	/**
	 * Safely joins URL segments.
	 * @param origin - The base URL
	 * @param pathname - The path
	 * @returns The joined URL
	 */
	static join(origin: string, pathname: string): string {
		// Return absolute URLs unchanged.
		if (pathname.startsWith("http://") || pathname.startsWith("https://")) {
			return pathname
		}

		if (pathname.startsWith("//")) {
			return pathname
		}

		// Handle invalid URLs.
		try {
			const originUrl = new URL(origin)
			const originPathname = originUrl.pathname

			// Normalize the path by removing redundant slashes.
			const normalizedPathname = originPathname.endsWith("/")
				? originPathname.slice(0, -1)
				: originPathname

			const normalizedPath = pathname.startsWith("/") ? pathname : `/${pathname}`

			const url = new URL(normalizedPathname + normalizedPath, originUrl.origin)

			return url.toString()
		} catch (e) {
			// Fall back to simple concatenation for invalid URLs.
			return origin + (origin.endsWith("/") ? "" : "/") + pathname.replace(/^\.\/|^\/+/, "")
		}
	}

	/**
	 * @description Replaces the hostname in a URL.
	 * @param uri A pathname, query string, or hash
	 * @param hostname The new hostname
	 */
	static replaceHostname(uri: string, hostname: string) {
		const baseUri = "https://a.com"
		const url = new URL(uri, baseUri)

		const replaceHost = url.hostname === baseUri ? baseUri : url.hostname
		return url.toString().replace(replaceHost, hostname)
	}

	/**
	 * Gets the individual parts of a URL.
	 */
	static parse = (url: string) => {
		try {
			const urlObj = new URL(url)
			return {
				protocol: urlObj.protocol,
				origin: urlObj.origin,
				host: urlObj.host,
				pathname: urlObj.pathname,
				search: urlObj.search,
				hash: urlObj.hash,
				isValid: true,
			}
		} catch {
			return {
				origin: "",
				protocol: "",
				host: "",
				pathname: url,
				search: "",
				hash: "",
				isValid: false,
			}
		}
	}

	/**
	 * Converts a WebSocket connection URL to a Socket.IO connection URL.
	 * @param url The WebSocket connection URL
	 * @returns The Socket.IO connection URL
	 */
	static transformToSocketIoUrl(url: string) {
		return `${url}/socket.io/?EIO=3&transport=websocket&timestamp=${Date.now()}`
		// An invalid WebSocket URL for debugging the reconnection mechanism.
		// return `wss://192.0.2.1/test`
	}

	/**
	 * @description request body parsing
	 * @param response
	 */
	static async responseParse(response: Response, options?: ResponseParseOptions) {
		const contentType = (response.headers.get("Content-Type") || "").toLowerCase()

		// 204/205 responses are explicitly bodyless. Do not call response.json()
		// for them because the browser rejects an empty body as invalid JSON.
		if (response.status === 204 || response.status === 205) {
			return { data: undefined, type: "empty" }
		}

		if (contentType.includes("application/json")) {
			const text = await response.text()
			if (!text.trim()) return { data: undefined, type: "empty" }

			try {
				return {
					data: options?.parseJsonLargeIntAsString
						? parseJsonLargeIntAsString(text)
						: JSON.parse(text),
					type: "json",
				}
			} catch (error) {
				throw new ResponseParseError(
					`Failed to parse JSON response: ${response.status} ${response.url}`,
					response,
					contentType,
					text.slice(0, 2000),
					error,
				)
			}
		}
		if (contentType.includes("text/")) {
			return { data: await response.text(), type: "text" }
		}
		if (contentType.includes("image/")) {
			return { data: await response.blob(), type: "blob" }
		}

		return { data: await response.arrayBuffer(), type: "buffer" }
	}
}

export class StringUtils {
	static generateSessionFingerprint() {
		const keys = [
			navigator.userAgent,
			navigator.hardwareConcurrency,
			screen.width,
			Intl.DateTimeFormat().resolvedOptions().timeZone,
		]
		const data = new TextEncoder().encode(keys.join("|"))
		let hash = 0
		for (let i = 0; i < data.length; i++) {
			hash = (hash << 5) + hash + data[i]
		}
		return Math.abs(hash).toString(16).slice(0, 8)
	}

	static createRequestId() {
		// Part 1: time-based entropy (8 characters).
		const timePart = Math.floor(performance.timeOrigin + performance.now())
			.toString(36)
			.slice(-8)
			.padStart(8, "0")

		// Part 2: cryptographically secure randomness (16 characters).
		const randomBuffer = window.crypto.getRandomValues(new Uint8Array(6))
		const randomPart = Array.from(randomBuffer, (byte) =>
			byte.toString(16).padStart(2, "0"),
		).join("")

		// Part 3: session-context fingerprint (8 characters).
		const contextPart = StringUtils.generateSessionFingerprint()

		return `${timePart}${randomPart}${contextPart}`.toUpperCase()
	}
}
