import type PptxGenJS from "pptxgenjs"
import type { ElementNode } from "./dom"
import type {
	PPTFill,
	PPTLine,
	PPTRadialGradientFill,
	PPTLinearGradientFill,
	PPTShadow,
	PPTTableRow,
} from "./style"
import type { SlideConfig } from "../api/options"

/**
 * PPT 中间表示层 (IR)：管线各阶段间传递的"PPT 节点"数据形态。
 * 与 pptxgenjs 实例对接，但本身只是数据，不直接操作 SDK。
 */

// ============================================================================
// 基础类型
// ============================================================================

export type PPTXGenCore = typeof PptxGenJS
export type Pptx = InstanceType<PPTXGenCore>
export type Slide = ReturnType<Pptx["addSlide"]>

// ============================================================================
// 节点联合与基础结构
// ============================================================================

/** PPT 节点基础属性 */
export interface PPTNodeBase {
	/** 节点类型 */
	type: string
	/** X 坐标 (英寸) */
	x: number
	/** Y 坐标 (英寸) */
	y: number
	/** 宽度 (英寸) */
	w: number
	/** 高度 (英寸) */
	h: number
	/** 绘制顺序 */
	zOrder: number
	/** 旋转角度 (度) */
	rotate?: number
}

/** custGeom 路径点 */
export type CustGeomPoint =
	| { x: number; y: number; moveTo?: boolean }
	| { x: number; y: number; curve: { type: "quadratic"; x1: number; y1: number } }
	| { x: number; y: number; curve: { type: "cubic"; x1: number; y1: number; x2: number; y2: number } }
	| { x: number; y: number; curve: { type: "arc"; hR: number; wR: number; stAng: number; swAng: number } }
	| { close: true }

/** 形状节点 */
export interface PPTShapeNode extends PPTNodeBase {
	type: "shape"
	/** 形状类型 */
	shapeType: "rect" | "roundRect" | "ellipse" | "custGeom"
	/** 填充 */
	fill: PPTFill | null
	/** 边框线 */
	line: PPTLine | null
	/** 阴影 */
	shadow: PPTShadow | null
	/** 圆角半径 (英寸) */
	radius?: number
	/** custGeom 路径点 (shapeType === "custGeom" 时使用) */
	points?: CustGeomPoint[]
	/** 柔化边缘半径 (磅) */
	softEdge?: number
	/** 旋转角度 (度) */
	rotate?: number
	/** 形状内文本；用于 badge 等需要文本和形状共同居中的场景 */
	text?: {
		value: string
		fontSize: number
		fontFace: string
		color: string
		bold?: boolean
		italic?: boolean
		underline?: boolean
		strike?: boolean
		align?: "left" | "center" | "right"
		valign?: "top" | "middle" | "bottom"
		margin?: [number, number, number, number]
		wrap?: boolean
	}
}

/** 图片节点 */
export interface PPTImageNode extends PPTNodeBase {
	type: "image"
	/** 图片源 (URL 或 base64) */
	src: string
	/**
	 * 图片二进制（worker 处理后透传）。存在时优先于 `src`：
	 * 主线程不再持有大块 base64，打包 worker 内即将写入前才转 data URL，
	 * 并以 transferable 移交（detach）以立即释放主线程内存。
	 */
	srcBytes?: { data: ArrayBuffer; mime: string }
	/** 截图来源 */
	capture?: "snapdom"
	/** 截图目标元素 */
	captureElement?: Element
	/** 仅截取元素背景（不含子元素），用于多值渐变背景的降级处理 */
	captureBackgroundOnly?: boolean
	/** SVG 根节点截图时排除文本，仅保留图形部分 */
	captureExcludeSvgText?: boolean
	/** 缩放模式 */
	sizing: "cover" | "contain" | "crop" | "stretch"
	/** 裁剪区域 */
	cropRect?: { x: number; y: number; w: number; h: number }
	/** 圆角半径 */
	radius?: number
	/** 透明度 (0-100) */
	transparency?: number
}

/** 文本渐变 */
export type PPTTextGradient = PPTLinearGradientFill | PPTRadialGradientFill

/** 文本节点（每个 DOM Text Node 对应一个独立文本框） */
export interface PPTTextNode extends PPTNodeBase {
	type: "text"
	/** 纯文本内容 */
	text: string
	/** 字号 (pt) */
	fontSize: number
	/** 字体 */
	fontFace: string
	/** 字重 */
	fontWeight: number
	/** 颜色 (HEX 或 渐变对象) */
	color: string | PPTTextGradient
	/** 粗体 */
	bold: boolean
	/** 斜体 */
	italic: boolean
	/** 下划线 */
	underline: boolean
	/** 删除线 */
	strike?: boolean
	/** 水平对齐 */
	align?: "left" | "center" | "right" | "justify"
	/** 垂直对齐 */
	valign?: "top" | "middle" | "bottom"
	/** 行距 */
	lineSpacing?: number
	/** 是否换行 */
	wrap?: boolean
	/** 透明度 (0-100) */
	transparency?: number
	/** 字间距 (pt) */
	charSpacing?: number
	/** 阴影 */
	shadow?: PPTShadow | null
	/** 外边距 (pt) */
	margin?: [number, number, number, number]
	/** 旋转角度 (度) */
	rotate?: number
	/** 文本描边 (模拟 text-stroke) */
	outline?: {
		color: string
		size: number
		transparency?: number
	}
}

/** 表格节点 */
export interface PPTTableNode extends PPTNodeBase {
	type: "table"
	/** 表格行 */
	rows: PPTTableRow[]
	/** 列宽 (英寸) */
	colWidths: number[]
	/** 行高 (英寸) */
	rowHeights?: number[]
}

/** 单边边框线节点 */
export interface PPTBorderLineNode extends PPTNodeBase {
	type: "borderLine"
	/** 边框位置 */
	side: "top" | "right" | "bottom" | "left"
	/** 线条样式 */
	line: PPTLine
	/** 自定义几何路径（圆角边框时使用填充形状代替直线） */
	points?: CustGeomPoint[]
	/** 填充颜色（圆角边框填充用） */
	fillColor?: string
	/** 填充透明度 (0-100) */
	fillTransparency?: number
}

/** 媒体节点 */
export interface PPTMediaNode extends PPTNodeBase {
	type: "media"
	/** 媒体类型 */
	mediaType: "video" | "audio" | "online"
	/** 媒体路径 (URL) */
	path?: string
	/** 媒体数据 (base64) */
	data?: string
	/** 在线视频链接 (YouTube 等) */
	link?: string
	/** 封面：poster 或物化后的 JPEG data URL */
	cover?: string
	/**
	 * 封面二进制（worker 处理后透传）。存在时优先于 `cover`，
	 * 与图片节点的 `srcBytes` 同理：打包 worker 内即将写入前才转 data URL。
	 */
	coverBytes?: { data: ArrayBuffer; mime: string }
	/** 是否自动播放 */
	autoplay?: boolean
	/** 文件扩展名 */
	extn?: string
	/** 仅主线程物化用，序列化前剥离；无 poster 时指向 `<video>` 以截首帧 */
	coverCaptureElement?: HTMLVideoElement
}

/** PPT 节点联合类型 */
export type PPTNode =
	| PPTShapeNode
	| PPTImageNode
	| PPTTextNode
	| PPTTableNode
	| PPTBorderLineNode
	| PPTMediaNode

// ============================================================================
// 解析器上下文
// ============================================================================

/** 解析器上下文（保留对外兼容；包内目前未直接使用） */
export interface ParserContext {
	/** 当前 PPTX 实例 */
	pptx: Pptx
	/** 当前幻灯片 */
	slide: Slide
	/** 当前元素节点 */
	node: ElementNode
	/** iframe window 对象 */
	iWindow: Window
	/** iframe document 对象 */
	iDocument: Document
	/** 幻灯片配置 */
	config: SlideConfig
}
