/**
 * prelude-runtime-context
 *
 * document.write 后 window 对象在当前 shell 内存活，但旧 prelude 安装的
 * message 监听器仍然挂在 window 上。新 prelude 会自增版本号并写入
 * window.__MAGIC_API_PRELUDE_VERSION__；已安装的插件在 install 时捕获当前
 * 版本快照，message handler 每次触发前比对——若版本已过期就跳过回调，
 * 避免旧文档的残留监听器干扰新文档。
 *
 * 单测场景不经过 prelude-entry，preludeVersion 保持 undefined，
 * isStaleDocument 始终返回 false，对现有测试零侵入。
 */

declare global {
	interface Window {
		__MAGIC_API_PRELUDE_VERSION__?: number
	}
}

let currentPreludeVersion: number | undefined

export function getPreludeVersion(): number | undefined {
	return currentPreludeVersion
}

export function markPreludeVersion(v: number): void {
	currentPreludeVersion = v
}

/**
 * 判断当前文档是否已被更新的 prelude 覆盖（即当前 install 的版本快照已过时）。
 * installedVersion 在各插件 install() 开头通过 getPreludeVersion() 捕获。
 */
export function isStaleDocument(installedVersion: number | undefined): boolean {
	if (installedVersion === undefined) return false
	return (
		typeof window.__MAGIC_API_PRELUDE_VERSION__ === "number" &&
		window.__MAGIC_API_PRELUDE_VERSION__ !== installedVersion
	)
}
