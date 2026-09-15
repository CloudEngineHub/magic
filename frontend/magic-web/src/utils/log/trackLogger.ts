import { createLogger, type ILoggerConfig } from "../../../packages/logger/src"
import { createDeferredTrackLogger } from "./deferred-track-logger"

const APMConfig = JSON.parse(window?.CONFIG?.MAGIC_APM || "{}")
const providerOptions = APMConfig?.options || {}
const { appId, token, extra, ...providerExtra } = providerOptions
const loggerConfig: ILoggerConfig = {
	provider: {
		// Keep provider-specific options (for example DataFlux site and sampling)
		// in the runtime config instead of duplicating customer credentials in HTML.
		...providerOptions,
		type: APMConfig?.strategy,
		appId,
		token,
		extra: {
			...extra,
			...providerExtra,
		},
	},
}

const logger = createLogger(loggerConfig, { autoInit: false })

export const trackLogger = createDeferredTrackLogger(logger, loggerConfig)

// Let the browser finish the first render before importing and initializing the optional APM SDK.
// The timeout keeps telemetry from being postponed forever on browsers without idle callbacks.
const scheduleProviderInitialization = () => {
	if (typeof window === "undefined") return

	let didSchedule = false
	const initialize = () => {
		if (didSchedule) return
		didSchedule = true
		void trackLogger.initialize()
	}
	const timeoutId = window.setTimeout(initialize, 2000)

	if (typeof window.requestIdleCallback === "function") {
		window.requestIdleCallback(
			() => {
				window.clearTimeout(timeoutId)
				initialize()
			},
			{ timeout: 2000 },
		)
	}
}

// Loading the facade can precede the application's first commit. Wait for document loading
// before scheduling optional telemetry so SDK work cannot start during module evaluation.
if (document.readyState === "complete") {
	scheduleProviderInitialization()
} else {
	window.addEventListener("load", scheduleProviderInitialization, { once: true })
}
