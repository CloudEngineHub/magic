/**
 * Public font contracts: consumers provide font download/embedding through fontResolver.
 * This package only detects which fonts are used; it does not fetch or load fonts.
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
