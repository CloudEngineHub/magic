/**
 * MagicApiLogger
 *
 * 历史上承担「结构化日志 + 宿主接入桥（onLog）」职责，现已解耦：
 *   - 日志事件统一由 runtime bridge API 基类内置 logger 发出；
 *   - DevTools 侧 ApiCallProxy 订阅 runtime 日志总线，不再反向依赖本模块。
 *
 * 本模块因此收敛为「敏感/大体量参数的脱敏摘要工具」，供各 Magic*Api 在
 * 记录日志前对入参做精简，避免把完整文本/路径写入事件详情。
 */
export const MagicApiLogger = {
	summarizeText(text: string): Record<string, unknown> {
		return { length: text.length }
	},
	summarizePaths(paths: string[]): Record<string, unknown> {
		return {
			count: paths.length,
			paths: paths.slice(0, 5),
			truncated: paths.length > 5,
		}
	},
	summarizeOptions(options?: Record<string, unknown>): Record<string, unknown> {
		return {
			hasOptions: Boolean(options),
			optionKeys: Object.keys(options ?? {}),
		}
	},
}
