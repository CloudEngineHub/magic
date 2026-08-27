import type { Ref } from "react"
import type { HTMLEditorV2Ref } from "../../iframe-bridge/types/props"

/**
 * 选中的元素信息
 */
export interface SelectedElementInfo {
	/** CSS 选择器 */
	selector: string
	/** 元素标签名 */
	tagName: string
	/** 是否为图片元素 */
	isImageElement?: boolean
	/** 是否主要由文字组成 */
	isTextElement?: boolean
	/** 元素当前的文本内容 */
	textContent?: string
	/** 元素当前的内联 CSS 声明 */
	inlineStyles?: Record<string, string>
	/** 图片原始宽度 */
	intrinsicWidth?: number
	/** 图片原始高度 */
	intrinsicHeight?: number
	/** 图片原始宽高比 */
	intrinsicAspectRatio?: number
	/** 计算后的样式 */
	computedStyles: {
		// 文字样式
		color: string
		fontSize: string
		fontWeight: string
		fontFamily: string
		fontStyle: string
		lineHeight: string
		textAlign: string
		textDecoration: string

		// 背景样式
		backgroundColor: string
		backgroundImage: string

		// 布局样式
		width: string
		height: string
		display: string
		parentDisplay?: string
		position: string

		// 边距
		margin: string
		marginTop: string
		marginRight: string
		marginBottom: string
		marginLeft: string
		padding: string
		paddingTop: string
		paddingRight: string
		paddingBottom: string
		paddingLeft: string

		// 边框
		border: string
		borderWidth: string
		borderStyle: string
		borderColor: string
		borderRadius: string

		// Flex 布局
		flexDirection: string
		justifyContent: string
		alignItems: string
		alignContent?: string
		flexWrap: string
		flexGrow?: string
		flexShrink?: string
		flexBasis?: string
		alignSelf?: string
		order?: string
		gap: string
		rowGap?: string
		columnGap?: string

		// Grid 布局
		gridTemplateColumns: string
		gridTemplateRows: string
		gridAutoFlow?: string
		gridAutoColumns?: string
		gridAutoRows?: string
		gridColumn?: string
		gridRow?: string
		justifyItems: string
		justifySelf?: string

		// 图片
		objectFit?: string
		objectPosition?: string

		// 阴影与效果
		opacity: string
		boxShadow: string
		textShadow: string
	}
	/** 当前节点的 HTML 属性，非 CSS 样式 */
	attributes?: {
		src?: string
		alt?: string
		title?: string
		href?: string
	}
}

/**
 * StylePanel 组件 Props
 */
export interface StylePanelProps {
	/** 渲染模式：完整工具栏、顶部全局栏或元素上下文栏 */
	variant?: "full" | "global" | "context"
	/** HTMLEditorV2 的 ref 引用 */
	editorRef: React.RefObject<HTMLEditorV2Ref>

	/** 样式变化回调 */
	onStyleChange?: (selector: string, property: string, value: string) => void

	/** 是否禁用编辑 */
	disabled?: boolean

	/** 类名 */
	className?: string

	/** Mount node for portaled toolbar actions (e.g. save), shown at far right */
	toolbarEndRef?: Ref<HTMLDivElement | null>
	/** Whether the DOM tree panel is open in the HTML editor. */
	domTreeOpen?: boolean
	/** Toggle the DOM tree panel from the global toolbar. */
	onToggleDomTree?: () => void

	/** Whether the element inspector is currently active */
	inspectorActive?: boolean

	/** Called when user clicks the inspector button to toggle inspector mode */
	onStartInspector?: () => void
}

/**
 * 样式配置区域的通用 Props
 */
export interface StyleSectionProps {
	/** 选中的元素信息 */
	selectedElement: SelectedElementInfo | null

	/** HTMLEditorV2 的 ref 引用 */
	editorRef: React.RefObject<HTMLEditorV2Ref>

	/** 样式变化回调 */
	onStyleChange?: (property: string, value: string) => void
	/** Hide width and height fields when a parent panel already renders them. */
	showDimensions?: boolean
}

/**
 * 字体大小单位
 */
export type FontSizeUnit = "px" | "em" | "rem" | "%"

/**
 * 边框样式
 */
export type BorderStyle = "none" | "solid" | "dashed" | "dotted" | "double"

/**
 * 定位方式
 */
export type PositionType = "static" | "relative" | "absolute" | "fixed" | "sticky"

/**
 * 文字对齐方式
 */
export type TextAlign = "left" | "center" | "right" | "justify"

/**
 * 显示方式
 */
export type DisplayType = "block" | "inline" | "inline-block" | "flex" | "grid" | "none"

/**
 * Flex 方向
 */
export type FlexDirection = "row" | "row-reverse" | "column" | "column-reverse"

/**
 * Flex 主轴对齐
 */
export type JustifyContent =
	| "flex-start"
	| "center"
	| "flex-end"
	| "space-between"
	| "space-around"
	| "space-evenly"

/**
 * Flex 交叉轴对齐
 */
export type AlignItems = "flex-start" | "center" | "flex-end" | "stretch" | "baseline"

/**
 * Flex 换行
 */
export type FlexWrap = "nowrap" | "wrap" | "wrap-reverse"

/**
 * Grid 对齐
 */
export type GridAlign = "start" | "center" | "end" | "stretch"
