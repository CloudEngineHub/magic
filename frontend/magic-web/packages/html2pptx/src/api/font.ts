/**
 * 字体相关公共契约：消费方通过 fontResolver 提供字体下载/嵌入。
 * 包内只负责"检测使用了哪些字体"，不负责字体获取与加载。
 */

export interface EmbedFontInput {
	typeface: string
	regular?: ArrayBuffer
	bold?: ArrayBuffer
	italic?: ArrayBuffer
	boldItalic?: ArrayBuffer
}

export type FontMissPolicy = "fallback-with-warning" | "no-embed" | "fail"

export interface UsedFont {
	typeface: string
	faceKeys: string[]
}

export interface FontResolverContext {
	missPolicy: FontMissPolicy
}

export type FontResolver = (
	usedFonts: UsedFont[],
	context: FontResolverContext,
) => EmbedFontInput[] | Promise<EmbedFontInput[]> | void | Promise<void>
