import type { ExternalLogger, LogLevelLabel } from "../logger"
import type { FontMissPolicy, FontResolver } from "./font"

/** 幻灯片配置 */
export interface SlideConfig {
	/** 设计稿宽度 (px) */
	htmlWidth: number
	/** 设计稿高度 (px) */
	htmlHeight: number
	/** PPT 宽度 (英寸) */
	slideWidth: number
	/** PPT 高度 (英寸) */
	slideHeight: number
}

/** 导出选项 */
export interface ExportOptions {
	/** 文件名 */
	fileName?: string
	/** 幻灯片配置 */
	config?: Partial<SlideConfig>
	/** 导出模式 */
	exportMode?: "single"
	/** 页面失败时是否跳过并继续导出后续页面 */
	skipFailedPages?: boolean
	/**
	 * 任意尺寸模式开关（默认 `false`，即标准 PPT 模式）。
	 *
	 * - `false`（默认 / PPT 模式）：严格按 `config.slideWidth/slideHeight` 输出单页，
	 *   超出内容由 PPT 页面边界裁切，导出尺寸固定且与设计稿无关。
	 * - `true`（任意尺寸模式）：根据 HTML 真实尺寸自适应：
	 *   - 真实宽度 > `config.htmlWidth` 时，自动扩展 `slideWidth` 至最大测量宽度
	 *   - 真实高度 > `config.htmlHeight` 时，按 `slideHeight` 切片为多页 PPT
	 *   - 任一页宽度超过 PowerPoint 单页 56 英寸上限 (5376px) 时直接抛错
	 */
	autoSize?: boolean
	/** 每页渲染开始时的进度回调 */
	onSlideProgress?: (context: ExportPageContext) => void
	/**
	 * 资源（图片、视频封面等）加载失败、被跳过时的回调。
	 * 失败资源不会中断导出，仅用于提示用户。可能就同一资源多次触发，调用方需自行去重。
	 */
	onResourceLoadError?: (error: ResourceLoadError) => void
	/** 最低输出级别，低于此级别的日志会被忽略，默认 "info" */
	logLevel?: LogLevelLabel
	/** 传入外部 logger，直接传 console 即可；方法均为可选 */
	logger?: ExternalLogger
	/** 字体解析器。包内只提供已使用字体列表，manifest、CDN、私有化路径均由业务层处理。 */
	fontResolver?: FontResolver
	/**
	 * 字体缺失时的处理策略，默认 'fallback-with-warning'
	 * - 'fallback-with-warning'：跳过该字体并打印警告，其余字体正常嵌入
	 * - 'no-embed'：静默跳过
	 * - 'fail'：抛出错误，终止导出
	 */
	fontMissPolicy?: FontMissPolicy
}

/** 资源加载失败信息 */
export interface ResourceLoadError {
	/** 资源地址（可能被截断） */
	url: string
	/** 资源类型，如 image / video / script / style */
	kind: string
	/** 失败原因：超时或加载错误 */
	reason: "timeout" | "load-error"
}

/** exportPPTX 的返回句柄，用于等待完成或主动取消 */
export interface ExportHandle {
	/** 等待导出完成（成功 resolve，失败/取消 reject） */
	promise: Promise<void>
	/** 取消本次导出 */
	cancel: () => void
}

/** 逐页导出上下文 */
export interface ExportPageContext {
	/** 当前页索引（从 0 开始） */
	index: number
	/** 总页数 */
	total: number
	/** 当前页 HTML */
	html: string
	/** 当前页导出文件名 */
	fileName: string
	/** 幻灯片配置 */
	config: SlideConfig
}
