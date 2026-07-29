/**
 * 翻译选项。
 */
export interface TOptions {
	/** 默认值，当翻译键不存在时返回 */
	defaultValue?: string
	/** 插值变量，用于替换翻译文本中的占位符 */
	[key: string]: unknown
}

/**
 * 翻译函数类型，模仿 i18next 的 TFunction 类型。
 */
export type TFunction = (key: string, options?: string | TOptions) => string
