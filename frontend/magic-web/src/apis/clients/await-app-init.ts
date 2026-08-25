import type { RequestConfig, RequestInterceptor } from "@/apis/core/HttpClient"
import { appStore } from "@/stores/app"
import { withTimeout } from "@/utils/promise"
import { logger as Logger } from "@/utils/log"

const appInitWaitTimeoutMs = 10000
const outgoingRequestTimeoutMessage = "http client wait for app init failed or timed out"

const logger = Logger.createLogger("await-app-init middleware")

async function waitForAppInitWithTimeout(
	timeoutMs: number,
	warnMessage: string,
	requestConfig?: RequestConfig<Headers>,
	failClosed = false,
): Promise<void> {
	if (!appStore.appInitPromise) return

	try {
		await withTimeout(appStore.appInitPromise, timeoutMs, warnMessage)
	} catch (error) {
		console.error(warnMessage, { error, requestConfig })
		logger.error({
			eventKey: "app_init_wait_timeout",
			errorKind: "timeout",
			message: warnMessage,
			error: error,
			context: { requestConfig },
		})
		// Business requests must never escape the bootstrap gate with an incomplete
		// session, otherwise their 401 responses can restart the login flow.
		if (failClosed) throw error
	}
}

/**
 * Await app bootstrap; used by UI gates. Always waits when promise exists.
 */
export async function awaitAppInitPromise(timeoutMs = appInitWaitTimeoutMs): Promise<void> {
	await waitForAppInitWithTimeout(timeoutMs, "await app init failed or timed out")
}

/**
 * For HttpClient: wait for app init unless the request opts out explicitly.
 */
export async function awaitAppInitForOutgoingRequest(
	timeoutMs = appInitWaitTimeoutMs,
	requestConfig?: RequestConfig<Headers>,
): Promise<void> {
	await waitForAppInitWithTimeout(timeoutMs, outgoingRequestTimeoutMessage, requestConfig, true)
}

/**
 * First HttpClient request interceptor: await app init unless bypassed.
 */
export function createWaitForAppInitRequestInterceptor(
	callback?: RequestInterceptor,
): RequestInterceptor {
	return async function waitForAppInitBeforeRequest(config) {
		if (config.skipAppInitWait) return config
		await awaitAppInitForOutgoingRequest(appInitWaitTimeoutMs, config)
		if (callback) return callback(config)
		return config
	}
}
