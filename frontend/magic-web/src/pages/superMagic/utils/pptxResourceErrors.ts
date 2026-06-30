import type { ResourceLoadError } from "@magic/html2pptx"
import magicToast from "@/components/base/MagicToaster/utils"

const RESOURCE_ERROR_TOAST_KEY = "pptx-resource-load-error"

type Translate = (key: string, options?: Record<string, unknown>) => string

/**
 * 收集 PPT 导出过程中加载失败/超时的资源（按 url + reason 去重），
 * 并在每出现一个新失败资源时**立即**用同一个 toast 刷新提示用户当前页哪个资源出问题。
 */
export function createPptxResourceErrorCollector(t: Translate) {
	const map = new Map<string, ResourceLoadError>()
	return {
		onResourceLoadError(error: ResourceLoadError) {
			const key = `${error.url}|${error.reason}`
			if (map.has(key)) return
			map.set(key, error)
			const failures = Array.from(map.values())
			magicToast.error({
				key: RESOURCE_ERROR_TOAST_KEY,
				content: t("topicFiles.resourceLoadFailed", {
					count: failures.length,
				}),
				duration: 5000,
			})
		},
		getFailures(): ResourceLoadError[] {
			return Array.from(map.values())
		},
	}
}
