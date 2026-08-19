import { createLogger, type ILogger, type ILoggerConfig } from "../../../packages/logger/src"

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

export const trackLogger: ILogger = createLogger(loggerConfig)
