function normalizeFileNameCandidate(value: string): string {
	const trimmed = value.trim()
	if (!trimmed) return ""
	const queryIndex = trimmed.search(/[?#]/)
	const pathWithoutQuery = queryIndex >= 0 ? trimmed.slice(0, queryIndex) : trimmed
	const segments = pathWithoutQuery.replace(/\\/g, "/").split("/").filter(Boolean)
	const last = segments.at(-1) ?? pathWithoutQuery
	try {
		return decodeURIComponent(last)
	} catch {
		return last
	}
}

/** 全屏预览顶栏：只展示文件名，显式文件名和 path 都会先归一化为 basename。 */
export function getFullscreenMediaFileLabel(path: string, explicitFileName?: string): string {
	const explicitLabel = explicitFileName ? normalizeFileNameCandidate(explicitFileName) : ""
	return explicitLabel || normalizeFileNameCandidate(path)
}
