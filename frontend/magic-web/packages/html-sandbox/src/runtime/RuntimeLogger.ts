/**
 * Runtime 内置观测日志模块
 *
 * 提供 runtime 拥有的结构化日志事件流：
 *   - runtime 内部生产者通过 createLogger(source) 创建带命名空间的 scoped logger，
 *     业务代码只使用 logger 接口，不直接感知日志总线实现。
 *   - DevTools 内部观测者（如 ApiCallProxy）通过 subscribe 消费事件流，
 *     将 API 生命周期事件转换成调试面板数据。
 *
 * 设计要点：
 *   1. source 在 createLogger 时绑定，调用面收敛为 info/warn/error(event, details)。
 *   2. hub 是 runtime 内部事件总线，不写 console（与既有“API 调用不打印到控制台”的行为一致）。
 *   3. 当前 subscribe 只服务 runtime 内部观测能力，不作为外部日志插件注入点。
 */

export type RuntimeLogLevel = "info" | "warn" | "error"

/** 一条结构化日志事件 */
export interface RuntimeLogRecord {
	level: RuntimeLogLevel
	/** 来源命名空间，例如 "MagicLLMApi" */
	source: string
	/** 事件名，例如 "request:start" */
	event: string
	/** 附加结构化详情 */
	details?: Record<string, unknown>
	/** 事件时间戳（ms） */
	timestamp: number
}

/** 暴露给插件的最小日志接口（source 已在 createLogger 时绑定） */
export interface RuntimeLogger {
	info(event: string, details?: Record<string, unknown>): void
	warn(event: string, details?: Record<string, unknown>): void
	error(event: string, details?: Record<string, unknown>): void
}

export type RuntimeLogListener = (record: RuntimeLogRecord) => void

/**
 * 日志事件总线：一处 emit、多处 subscribe。
 */
export class RuntimeLoggerHub {
	private listeners = new Set<RuntimeLogListener>()

	/** 派生一个绑定了 source 的 scoped logger */
	createLogger(source: string): RuntimeLogger {
		const emit = (
			level: RuntimeLogLevel,
			event: string,
			details?: Record<string, unknown>,
		): void => {
			this.dispatch({ level, source, event, details, timestamp: Date.now() })
		}
		return {
			info: (event, details) => emit("info", event, details),
			warn: (event, details) => emit("warn", event, details),
			error: (event, details) => emit("error", event, details),
		}
	}

	/** 订阅事件流，返回取消订阅函数 */
	subscribe(listener: RuntimeLogListener): () => void {
		this.listeners.add(listener)
		return () => {
			this.listeners.delete(listener)
		}
	}

	private dispatch(record: RuntimeLogRecord): void {
		for (const listener of this.listeners) {
			try {
				listener(record)
			} catch {
				// 单个监听器异常不影响其它监听器
			}
		}
	}
}

/** 进程级内置单例：runtime 中唯一的日志总线 */
export const runtimeLoggerHub = new RuntimeLoggerHub()
