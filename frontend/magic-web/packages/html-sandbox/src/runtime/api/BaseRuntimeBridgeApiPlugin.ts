/**
 * BaseRuntimeBridgeApiPlugin
 *
 * Runtime 提供给外部 API 插件继承的桥接基类。它只封装 runtime 级别的
 * logger 与 postMessage request/response 模式，不感知外部插件会向 window
 * 注入什么业务命名空间。
 */

import type { RuntimePlugin } from "../RuntimePlugin"
import { runtimeLoggerHub, type RuntimeLogger } from "../RuntimeLogger"
import { getParentOrigin } from "../../utils/parentOrigin"

export abstract class BaseRuntimeBridgeApiPlugin implements RuntimePlugin {
	protected readonly logger: RuntimeLogger

	constructor(source: string) {
		// logger 是 runtime 内置观测能力，由基类统一创建，外部插件无需感知日志实现。
		this.logger = runtimeLoggerHub.createLogger(source)
	}

	abstract install(): void

	/**
	 * 向宿主窗口发起一次 postMessage 请求并等待响应。
	 *
	 * @param type          消息类型（REQUEST 侧，例如 "MAGIC_FS_READ_REQUEST"）
	 * @param payload       额外载荷，会合并到 postMessage 消息体中
	 * @param timeout       超时毫秒数，默认 15000ms
	 * @param extractResult 从响应数据中提取结果的函数；
	 *                      若不传则默认取 `data.content ?? data`
	 */
	protected request<T>(
		type: string,
		payload: Record<string, unknown>,
		timeout = 15000,
		extractResult?: (data: Record<string, unknown>) => T,
	): Promise<T> {
		return new Promise<T>((resolve, reject) => {
			const requestId = `${type}_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`
			const responseType = type.replace(/_REQUEST$/, "_RESPONSE")

			this.logger.info("request:start", {
				type,
				requestId,
				timeout,
			})

			const timer = setTimeout(() => {
				window.removeEventListener("message", handler)
				this.logger.error("request:timeout", {
					type,
					requestId,
					timeout,
				})
				reject(new Error(`${type} request timed out`))
			}, timeout)

			const handler = (event: MessageEvent<Record<string, unknown>>) => {
				if (!event.data || event.data["requestId"] !== requestId) return
				if (event.data["type"] !== responseType) return
				clearTimeout(timer)
				window.removeEventListener("message", handler)
				if (event.data["success"]) {
					try {
						const result = extractResult
							? extractResult(event.data)
							: ((event.data["content"] ?? event.data) as T)
						this.logger.info("request:success", {
							type,
							requestId,
							result,
						})
						resolve(result)
					} catch (error) {
						this.logger.error("request:extract_failure", {
							type,
							requestId,
							error: error instanceof Error ? error.message : String(error),
						})
						reject(error instanceof Error ? error : new Error(String(error)))
					}
				} else {
					this.logger.error("request:failure", {
						type,
						requestId,
						error:
							typeof event.data["error"] === "string"
								? event.data["error"]
								: undefined,
					})
					reject(new Error((event.data["error"] as string) ?? `${type} request failed`))
				}
			}
			window.addEventListener("message", handler)
			window.parent.postMessage({ type, requestId, ...payload }, getParentOrigin())
		})
	}
}
