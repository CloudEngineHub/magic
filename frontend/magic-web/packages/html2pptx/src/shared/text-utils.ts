import { PX_TO_PT_RATIO } from "./constants"

/**
 * 解析 line-height 并转换为 PPT 的 lineSpacing (倍数)
 * PPT 默认单倍行距是 1.0，CSS normal 约为 1.2
 */
export function parseLineSpacing(lineHeight: string, fontSizePx: number): number | undefined {
	if (!lineHeight || lineHeight === "normal") return undefined

	const unitless = Number(lineHeight)
	if (!Number.isNaN(unitless)) {
		return parseFloat(unitless.toFixed(2))
	}

	const match = lineHeight.match(/([\d.]+)(px|em|rem|%)/)
	if (!match) return undefined

	const value = parseFloat(match[1])
	const unit = match[2]

	let lineHeightPx = value
	if (unit === "em" || unit === "rem") {
		lineHeightPx = value * fontSizePx
	} else if (unit === "%") {
		lineHeightPx = (value / 100) * fontSizePx
	}

	if (fontSizePx <= 0) return undefined
	const multiple = lineHeightPx / fontSizePx
	return parseFloat(multiple.toFixed(2))
}

/**
 * 解析 letter-spacing 并转换为 PPT 的 charSpacing (pt)
 * PPT charSpacing 单位是 points
 */
export function parseLetterSpacing(
	letterSpacing: string,
	fontSizePx: number,
	scale: number,
): number | undefined {
	if (!letterSpacing || letterSpacing === "normal") return undefined

	let pxValue = 0

	if (letterSpacing.endsWith("em")) {
		pxValue = parseFloat(letterSpacing) * fontSizePx
	} else if (letterSpacing.endsWith("rem")) {
		pxValue = parseFloat(letterSpacing) * 16
	} else {
		pxValue = parseFloat(letterSpacing)
	}

	if (Number.isNaN(pxValue) || pxValue === 0) return undefined

	return Math.round(pxValue * scale * PX_TO_PT_RATIO)
}

/**
 * 解析是否粗体
 */
export function parseBold(fontWeight: string): boolean {
	const weight = parseInt(fontWeight)
	return !Number.isNaN(weight) && weight >= 600
}

export function parseFontWeight(fontWeight: string): number {
	const weight = parseInt(fontWeight)
	if (Number.isNaN(weight)) return 400

	return Math.min(900, Math.max(100, Math.round(weight / 100) * 100))
}

/**
 * 从 font-family 栈中取第一个字体名。
 * 字体若在 manifest 中会被嵌入；不在 manifest 中则由 PowerPoint 自行匹配相近字体。
 */
export function mapFontFamily(fontFamily: string): string {
	const first = fontFamily.split(",")[0].replace(/['"]/g, "").trim()
	return first || "Arial"
}

export function parseLineHeightPx(lineHeight: string, fontSize: number): number {
	if (!lineHeight || lineHeight === "normal") return fontSize * 1.2

	const unitless = Number(lineHeight)
	if (!Number.isNaN(unitless)) return unitless * fontSize

	const match = lineHeight.match(/([\d.]+)(px|em|rem)?/)
	if (!match) return fontSize * 1.2

	const value = parseFloat(match[1])
	const unit = match[2] || "px"
	if (unit === "px") return value
	if (unit === "em" || unit === "rem") return value * fontSize
	return fontSize * 1.2
}

/**
 * 根据 text-transform 属性转换文本
 */
export function transformText(text: string, textTransform: string): string {
	if (!text) return text

	if (textTransform === "uppercase") {
		return text.toUpperCase()
	}
	if (textTransform === "lowercase") {
		return text.toLowerCase()
	}
	if (textTransform === "capitalize") {
		return text.replace(/\b\w/g, (c) => c.toUpperCase())
	}

	return text
}

export function normalizeTextByWhiteSpace(input: { text: string; whiteSpace: string }): string {
	const { text, whiteSpace } = input
	const mode = whiteSpace.toLowerCase()

	if (mode === "pre" || mode === "pre-wrap" || mode === "break-spaces") return text
	if (mode === "pre-line") return text.replace(/[ \t\f\v]+/g, " ").trim()
	return text.replace(/\s+/g, " ").trim()
}

export function hasRenderableText(input: { text: string; whiteSpace: string }): boolean {
	const { text, whiteSpace } = input
	const mode = whiteSpace.toLowerCase()
	if (mode === "pre" || mode === "pre-wrap" || mode === "break-spaces") return text.length > 0
	return text.trim().length > 0
}
