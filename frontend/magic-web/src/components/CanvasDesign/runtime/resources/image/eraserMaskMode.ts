export interface EraserMaskColors {
	background: "#000" | "#fff"
	stroke: "#000" | "#fff"
}

/**
 * 模型侧始终把白色识别为待擦除区域。反向模式直接交换底色与笔迹色，
 * 既保持这份契约，也避免生成 mask 后再逐像素反色带来的额外内存开销。
 */
export function resolveEraserMaskColors(eraseOutside: boolean): EraserMaskColors {
	return eraseOutside
		? { background: "#fff", stroke: "#000" }
		: { background: "#000", stroke: "#fff" }
}
