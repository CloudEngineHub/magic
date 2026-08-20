// Optional peer dependency: the host application supplies the official SDK at runtime.
// @ts-ignore The package is intentionally optional for consumers that use another Provider.
import { datafluxRum } from "@cloudcare/browser-rum"
import type { IDataFluxConfig } from "../../config/types"
import { BaseProvider } from "../../core/base-provider"
import { normalizeError } from "../../core/error"
import type { ICustomEvent, IUserInfo } from "../../core/types"

type DataFluxContext = Record<string, unknown>

function isContext(value: unknown): value is DataFluxContext {
	return typeof value === "object" && value !== null && !Array.isArray(value)
}

/**
 * DataFlux Browser RUM Provider。
 * SDK 在 init 时即开始采集，因此 start/stop 只维护统一 Provider 生命周期，避免重复初始化。
 */
export class DataFluxProvider extends BaseProvider {
	async init(config: IDataFluxConfig): Promise<void> {
		this.validateConfig(config)
		if (!config.site) {
			throw new Error("site is required")
		}

		this.config = config
		datafluxRum.init({
			applicationId: String(config.appId),
			clientToken: config.token,
			site: config.site,
			env: config.env || "production",
			service: config.service || "browser",
			version: config.version || "1.0.0",
			sessionSampleRate: config.sessionSampleRate ?? 100,
			sessionReplaySampleRate: config.sessionReplaySampleRate ?? 0,
			trackUserInteractions: config.trackUserInteractions ?? true,
			trackResources: config.trackResources ?? true,
			trackLongTasks: config.trackLongTasks ?? true,
			defaultPrivacyLevel: config.defaultPrivacyLevel || "mask-user-input",
			...config.extra,
		})

		if (config.startSessionReplayRecording) {
			datafluxRum.startSessionReplayRecording?.()
		}

		this.isInitialized = true
	}

	start(): void {
		if (!this.isInitialized) {
			throw new Error("Provider not initialized")
		}

		this.isStarted = true
	}

	stop(): void {
		// DataFlux SDK 没有公共 stop API，只停止统一 Provider 的后续主动调用状态。
		this.isStarted = false
	}

	setConfig(config: Record<string, string | null | undefined>): void {
		if (!this.isInitialized) return

		Object.entries(config).forEach(([key, value]) => {
			if (value !== null && value !== undefined) {
				datafluxRum.setGlobalContextProperty(key, value)
			}
		})
	}

	setUser(user: IUserInfo): void {
		if (!this.isInitialized) return

		datafluxRum.setUser(user)
	}

	error(...args: unknown[]): void {
		if (!this.isInitialized) return

		const [error, context] = args
		const normalizedError = normalizeError(error, "Unknown error")
		datafluxRum.addError(normalizedError.error, isContext(context) ? context : undefined)
	}

	report(value: ICustomEvent): void {
		if (!this.isInitialized) return

		datafluxRum.addAction(value.name, value.properties)
	}
}
