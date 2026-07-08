/**
 * prelude-entry
 *
 * Magic API 的构建入口——由 vite-plugin-magic-api 在构建期用 esbuild
 * 编译为自包含的 IIFE 字符串，运行时注入到 iframe document 的 <head> 最前端。
 *
 * 此文件**不会**出现在主应用模块图中；它只作为 esbuild entryPoint，
 * 编译产物经 virtual:magic-api 虚拟模块以 string 形式被 full-content.ts
 * 消费。
 *
 * 运行时前提：
 *   - shell 已启动，window.MagicHtmlSandboxRuntime 可用
 *     （含 registerRuntimePlugins / BaseRuntimeBridgeApiPlugin）
 *   - window.__MAGIC_INITIAL_LANG__ 已在本脚本之前的 script 中赋值
 */

import { magicApiPlugins } from "./index"
import { markPreludeVersion } from "./prelude-runtime-context"

interface SandboxRuntime {
	registerRuntimePlugins?: (plugins: unknown[]) => void
	BaseRuntimeBridgeApiPlugin?: unknown
	[key: string]: unknown
}

;(function installMagicApiPrelude() {
	const runtime = (window as unknown as { MagicHtmlSandboxRuntime?: SandboxRuntime })
		.MagicHtmlSandboxRuntime

	if (
		!runtime ||
		typeof runtime.registerRuntimePlugins !== "function" ||
		typeof runtime.BaseRuntimeBridgeApiPlugin !== "function"
	) {
		try {
			window.parent.postMessage(
				{
					type: "MAGIC_API_PRELUDE_ERROR",
					message: "MagicHtmlSandboxRuntime is not ready",
					timestamp: Date.now(),
				},
				"*",
			)
		} catch {
			// cross-origin safety
		}
		return
	}

	const nextVersion = (window.__MAGIC_API_PRELUDE_VERSION__ || 0) + 1
	window.__MAGIC_API_PRELUDE_VERSION__ = nextVersion
	markPreludeVersion(nextVersion)

	window.Magic = {} as typeof window.Magic

	runtime.registerRuntimePlugins(magicApiPlugins as unknown[])
})()
