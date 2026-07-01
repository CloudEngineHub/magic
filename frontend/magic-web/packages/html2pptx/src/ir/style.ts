/**
 * PPT 节点引用的样式子类型集合：填充、边框、阴影、表格单元格等。
 * 这些是 PPTNode 内部组合使用的小型纯类型，与具体节点解耦。
 */

/** 纯色填充 */
export interface PPTSolidFill {
	type: "solid"
	color: string
	transparency?: number
}

/** 线性渐变填充 */
export interface PPTLinearGradientFill {
	type: "gradient"
	gradientType: "linear"
	/** 渐变节点，position 是 0-1 的比例 */
	stops: Array<{ position: number; color: string; transparency?: number }>
	/** 渐变角度（0-360），0=从左到右，90=从上到下 */
	angle?: number
	/** 是否随形状缩放 */
	scaled?: boolean
	/** 是否随形状旋转 */
	rotWithShape?: boolean
	/** 翻转模式 */
	flip?: "none" | "x" | "xy" | "y"
	/** 平铺矩形设置 */
	tileRect?: { t?: number; r?: number; b?: number; l?: number }
}

/** 径向渐变填充 */
export interface PPTRadialGradientFill {
	type: "gradient"
	gradientType: "radial"
	/** 渐变节点，position 是 0-1 的比例 */
	stops: Array<{ position: number; color: string; transparency?: number }>
	/** 渐变样式: 'circle' (默认) | 'ellipse' */
	style?: "circle" | "ellipse"
	/** 是否随形状旋转 */
	rotWithShape?: boolean
	/** 翻转模式 */
	flip?: "none" | "x" | "xy" | "y"
	/** 平铺矩形设置 */
	tileRect?: { t?: number; r?: number; b?: number; l?: number }
}

/** 填充类型 */
export type PPTFill = PPTSolidFill | PPTLinearGradientFill | PPTRadialGradientFill

/** 兼容旧代码的联合类型别名 */
export type PPTGradientFill = PPTLinearGradientFill | PPTRadialGradientFill

/** 边框线 */
export interface PPTLine {
	color: string
	width: number
	style: "solid" | "dashed" | "dotted"
	transparency?: number
}

/** 阴影 (使用极坐标，匹配 pptxgenjs API) */
export interface PPTShadow {
	/** 阴影类型 */
	type: "outer" | "inner"
	/** 阴影颜色 (HEX) */
	color: string
	/** 模糊半径 (磅) */
	blur: number
	/** 偏移距离 (磅) */
	offset: number
	/** 角度 (度数, 0-360) */
	angle: number
	/** 透明度 (0-1) */
	opacity: number
}

/** 表格行 */
export interface PPTTableRow {
	cells: PPTTableCell[]
}

/** 表格单元格边框 */
export interface PPTTableCellBorder {
	color?: string
	/** 边框透明度 (0-100, 0=不透明, 100=完全透明) */
	transparency?: number
	pt?: number
	type?: "solid" | "dash" | "dot" | "none"
}

/** 表格单元格文本片段 */
export interface PPTTableTextRun {
	text: string
	options?: {
		color?: string
		fontSize?: number
		bold?: boolean
		italic?: boolean
		breakLine?: boolean
	}
}

/** 表格单元格 */
export interface PPTTableCell {
	text: string | PPTTableTextRun[]
	options?: {
		fill?: string
		/** 填充透明度 (0-100, 0=不透明, 100=完全透明) */
		fillTransparency?: number
		color?: string
		fontSize?: number
		bold?: boolean
		align?: "left" | "center" | "right"
		valign?: "top" | "middle" | "bottom"
		colspan?: number
		rowspan?: number
		/** 边距（英寸，TRBL），与 PptxGenJS 默认分支一致 */
		margin?: number | [number, number, number, number]
		/** false → 需配合打过补丁的 pptxgenjs（tablecell 的 a:bodyPr wrap=none），否则库会忽略 */
		wrap?: boolean
		border?:
			| PPTTableCellBorder
			| [PPTTableCellBorder, PPTTableCellBorder, PPTTableCellBorder, PPTTableCellBorder]
	}
}
