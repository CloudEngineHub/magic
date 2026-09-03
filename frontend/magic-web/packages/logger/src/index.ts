/**
 * @magic-web/logger
 * 统一的日志追踪解决方案
 */

// 核心导出
export { createLogger, getLogger } from "./core/logger"
export { BaseProvider } from "./core/base-provider"
export { MagicLoggerSyntheticError, normalizeError } from "./core/error"
export { ErrorCaptureSource } from "./core/types"
export type { NormalizedError } from "./core/error"

// 类型导出
export type {
	ILogger,
	ILoggerConfig,
	IProvider,
	IProviderConfig,
	IPlugin,
	IUserInfo,
	ICustomEvent,
	IErrorInfo,
	ProviderErrorInput,
	ProviderType,
	LogLevel,
} from "./core/types"

export type {
	IVolcengineConfig,
	IAliyunConfig,
	IDataFluxConfig,
	ProviderConfig,
} from "./config/types"

// Provider 通过 Logger 动态加载，避免把可选的 SDK 依赖提升为主入口依赖。
