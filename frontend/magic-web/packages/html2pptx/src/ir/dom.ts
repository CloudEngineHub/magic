/**
 * DOM 收集层数据契约：collector 阶段从 iframe DOM 中抽取的中间表示。
 * 不依赖任何业务模块。
 */

/** 计算样式信息 (精简版) */
export interface ComputedStyleInfo {
	// 背景
	backgroundColor: string
	backgroundImage: string
	backgroundSize: string
	backgroundPosition: string
	backgroundRepeat: string
	backgroundClip: string
	objectFit: string
	objectPosition: string

	// 边框
	borderRadius: string
	borderWidth: string
	borderColor: string
	borderStyle: string
	// 单边边框
	borderTopWidth: string
	borderRightWidth: string
	borderBottomWidth: string
	borderLeftWidth: string
	borderTopColor: string
	borderRightColor: string
	borderBottomColor: string
	borderLeftColor: string
	borderTopStyle: string
	borderRightStyle: string
	borderBottomStyle: string
	borderLeftStyle: string

	// 文字
	color: string
	fontSize: number
	fontFamily: string
	fontWeight: string
	fontStyle: string
	textAlign: string
	textDecoration: string
	whiteSpace: string
	lineHeight: string
	letterSpacing: string
	verticalAlign: string
	paddingTop: string
	paddingRight: string
	paddingBottom: string
	paddingLeft: string
	marginTop: string
	marginRight: string
	marginBottom: string
	marginLeft: string

	// 布局
	display: string
	position: string
	opacity: string
	visibility: string
	overflow: string
	zIndex: string

	// Flex/Grid 对齐
	alignItems: string
	justifyContent: string
	alignContent: string
	alignSelf: string
	flexDirection: string

	// 阴影
	boxShadow: string
	textShadow: string

	// 变换
	transform: string

	// 滤镜
	filter: string

	// 裁剪
	clipPath: string

	// 文本转换
	textTransform: string

	// WebKit 专属 (text-stroke，与 lib.dom.d.ts 一致)
	webkitTextStroke?: string
	webkitTextStrokeWidth?: string
	webkitTextStrokeColor?: string
}

/** DOM 元素节点 */
export interface ElementNode {
	/** 唯一标识 */
	id: string
	/** 元素类型 */
	tagName: string
	/** 原始 DOM 引用 */
	element: Element
	/** 位置和尺寸 (像素) */
	rect: {
		x: number
		y: number
		w: number
		h: number
	}
	/** 布局尺寸 (无变换的原始尺寸) */
	layout: {
		offsetWidth: number
		offsetHeight: number
	}
	/** 计算后的样式 */
	style: ComputedStyleInfo
	/** 直接文本内容 */
	textContent: string | null
	/** 子元素 */
	children: ElementNode[]
	/** 父元素引用 */
	parent: ElementNode | null
	/** DOM 深度 */
	depth: number
	/** z-index 数值 */
	zIndex: number
	/** DOM 遍历顺序（用于同级元素排序，后来居上） */
	domOrder: number
	/** 绘制顺序（由 sortByZOrder 计算后挂载） */
	paintOrder?: number
}
