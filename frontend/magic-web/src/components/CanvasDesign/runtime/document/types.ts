import type {
	GenerateImageRequest,
	CanvasDesignMethods,
	MagicPermissions,
	GenerateHightImageRequest,
	ImageGenerationTaskMeta,
	IdentifyImageMarkResponse,
	GenerateVideoRequest,
	VideoGenerationResultMeta,
	GenerationStatus,
} from "../../public/magic-types"
import type { TFunction } from "../../public/i18n-types"

/** 裁剪矩形配置 */
export interface CropConfig {
	/** 宽度 */
	width: number
	/** 高度 */
	height: number
	/** 横坐标 */
	x: number
	/** 纵坐标 */
	y: number
	/** 裁剪编辑态下的完整显示宽度 */
	displayWidth?: number
	/** 裁剪编辑态下的完整显示高度 */
	displayHeight?: number
}

/** 裁剪信息（不包含显示宽高） */
export type CropConfigWithoutDisplaySize = Omit<CropConfig, "displayWidth" | "displayHeight">

/** 扩展编辑框配置 */
export interface ExtendFrameConfig {
	/** 宽度 */
	width: number
	/** 高度 */
	height: number
	/** 横坐标 */
	x: number
	/** 纵坐标 */
	y: number
}

/** 扩展编辑态会话数据 */
export interface ExtendSession {
	frame: ExtendFrameConfig
}

/**
 * Canvas配置
 */
export type CanvasDeviceFormFactor = "phone" | "tablet" | "desktop"

export type CanvasDeviceLayout = "compact" | "regular"

export interface CanvasDeviceInfo {
	formFactor: CanvasDeviceFormFactor
	layout: CanvasDeviceLayout
	input: {
		touch: boolean
		coarsePointer: boolean
		hover: boolean
	}
}

export interface CanvasConfig {
	/** 用于挂载Konva画布的DOM元素 */
	element: HTMLDivElement
	/** 交互作用域根节点，仅在该范围内处理画布外点击 */
	scopeElement?: HTMLElement
	/** 设计项目 ID，用于隔离画布级缓存、SW 离线资源与跨画布粘贴校验 */
	id: string
	/** 默认只读模式 */
	defaultReadyonly?: boolean
	/** Magic 配置 */
	magic?: {
		methods?: CanvasDesignMethods
		permissions?: MagicPermissions
	}
	/** Plugin configuration injected by the host application. */
	plugins?: CanvasDesignPluginModuleConfig
	/** 获取设备形态、布局和输入能力，如果未提供则使用默认检测 */
	getDevice?: () => CanvasDeviceInfo
	/** 翻译函数 */
	t?: TFunction
}

/** 画布工具 */
export const ToolTypeEnum = {
	Select: "select", // 选择工具
	Hand: "hand", // 抓手工具
	Text: "text", // 文本
	Frame: "frame", // 画框
	ImageGenerator: "image-generator", // 图像生成
	VideoGenerator: "video-generator", // 视频生成
	Marker: "Marker", // 标记
	Rect: "rect", // 矩形形状
	Ellipse: "ellipse", // 圆形形状
	Triangle: "triangle", // 三角形形状
	Star: "star", // 星形形状
} as const

/** 画布工具类型 */
export type ToolType = (typeof ToolTypeEnum)[keyof typeof ToolTypeEnum]

/** 工具快捷键 */
export type ToolKey = "v" | "h" | "t" | "f" | "a" | "m" | "space"

/** 工具快捷键事件 */
export type ToolKeyEvent = ToolKey | `${ToolKey}-up`

/** 元素类型枚举 */
export const ElementTypeEnum = {
	/** 画框 */
	Frame: "frame",
	/** 组 */
	Group: "group",
	/** 图片 */
	Image: "image",
	/** 文本 */
	Text: "text",
	/** 矩形 */
	Rectangle: "rectangle",
	/** 圆形 */
	Ellipse: "ellipse",
	/** 三角形 */
	Triangle: "triangle",
	/** 星形 */
	Star: "star",
	/** 视频 */
	Video: "video",
} as const

/** 元素类型 */
export type ElementType = (typeof ElementTypeEnum)[keyof typeof ElementTypeEnum]

/** 边框位置类型 */
export type StrokePosition = "inside" | "center" | "outside"

/** 交互配置 */
export interface InteractionConfig {
	/** 填充是否透明 */
	fillTransparent?: boolean
	/** 填充颜色格式 */
	fillColorMode?: "hex" | "rgb" | "hsl"
	/** 描边是否透明 */
	strokeTransparent?: boolean
	/** 描边颜色格式 */
	strokeColorMode?: "hex" | "rgb" | "hsl"
	/** 描边位置 */
	strokePosition?: StrokePosition
	/** 是否锁定宽高比 */
	aspectRatioLocked?: boolean
	/** 是否允许作为连接线起点/终点；Group 等纯编组容器固定不可连接 */
	connectable?: boolean
}

/** 基础元素属性 */
export interface BaseElementProps {
	/** 元素唯一标识 */
	id: string
	/** 元素名称 */
	name?: string
	/** 元素类型 */
	type: ElementType
	/** 是否可见 */
	visible?: boolean
	/** 是否锁定 */
	locked?: boolean
	/** 透明度 0-1 */
	opacity?: number
	/** 元素位置 */
	x?: number
	/** 元素位置 */
	y?: number
	/** 元素宽度 */
	width?: number
	/** 元素高度 */
	height?: number
	/** 水平缩放比例 */
	scaleX?: number
	/** 垂直缩放比例 */
	scaleY?: number
	/** 图层层级，数值越大越靠上，默认为 0 */
	zIndex?: number
	/** 交互配置 */
	interactionConfig?: InteractionConfig
}

/** 画框元素 */
export interface FrameElement extends BaseElementProps {
	type: typeof ElementTypeEnum.Frame
	/** 子元素 */
	children?: LayerElement[]
}

/** 组元素 */
export interface GroupElement extends BaseElementProps {
	type: typeof ElementTypeEnum.Group
	/** 子元素 */
	children?: LayerElement[]
}

/** 矩形元素 */
export interface RectangleElement extends BaseElementProps {
	type: typeof ElementTypeEnum.Rectangle
	/** 填充色 */
	fill?: string
	/** 描边色 */
	stroke?: string
	/** 描边宽度 */
	strokeWidth?: number
	/** 圆角半径 */
	cornerRadius?: number
}

/** 星形元素 */
export interface StarElement extends BaseElementProps {
	type: typeof ElementTypeEnum.Star
	/** 填充色 */
	fill?: string
	/** 描边色 */
	stroke?: string
	/** 描边宽度 */
	strokeWidth?: number
	/** 圆角半径 */
	cornerRadius?: number
	/** 边数 */
	sides?: number
	/** 内凹比例（0-1） */
	innerRadiusRatio?: number
}

/** 圆形元素 */
export interface EllipseElement extends BaseElementProps {
	type: typeof ElementTypeEnum.Ellipse
	/** 填充色 */
	fill?: string
	/** 描边色 */
	stroke?: string
	/** 描边宽度 */
	strokeWidth?: number
}

/** 三角形元素 */
export interface TriangleElement extends BaseElementProps {
	type: typeof ElementTypeEnum.Triangle
	/** 填充色 */
	fill?: string
	/** 描边色 */
	stroke?: string
	/** 描边宽度 */
	strokeWidth?: number
}

/** 富文本样式 */
export interface TextStyle {
	/** 字体大小 */
	fontSize?: number
	/** 字体粗细 */
	fontWeight?: number | string
	/** 字体颜色 */
	color?: string
	/** 字体家族 */
	fontFamily?: string
	/** 是否加粗 */
	bold?: boolean
	/** 是否斜体 */
	italic?: boolean
	/** 是否下划线 */
	underline?: boolean
	/** 是否删除线 */
	strikethrough?: boolean
	/** 背景色 */
	backgroundColor?: string
	/** 字母间距 */
	letterSpacing?: number
}

/** 富文本文本节点 */
export interface RichTextNode {
	/** 节点类型 */
	type: "text"
	/** 文本内容 */
	text: string
	/** 文本样式 */
	style?: TextStyle
}

/** 富文本段落 */
export interface RichTextParagraph {
	/** 段落内容节点 */
	children?: RichTextNode[]
	/** 段落样式 */
	style?: {
		/** 文本对齐 */
		textAlign?: "left" | "center" | "right"
		/** 行高 */
		lineHeight?: number
		/** 段落间距 */
		paragraphSpacing?: number
		/** 列表类型 */
		listType?: "bullet" | "ordered"
	}
}

/** 文本元素 */
export interface TextElement extends BaseElementProps {
	type: typeof ElementTypeEnum.Text
	/** 富文本内容（段落数组） */
	content?: RichTextParagraph[]
	/** 默认文本样式（作为基础样式） */
	defaultStyle?: TextStyle
}

/** 图片元素 */
export interface ImageElement extends BaseElementProps {
	type: typeof ElementTypeEnum.Image
	/** 图片源(用来换取 ossSrc 的临时 path) */
	src?: string
	/** 状态 */
	status?: GenerationStatus
	/** 错误信息 */
	errorMessage?: string
	/** 图片生成请求参数（请求成功后保存） */
	generateImageRequest?: GenerateImageRequest
	/** 图片生成任务元数据（用于高清放大 / 去背景 / 橡皮擦 / 扩图） */
	imageGenerationTaskMeta?: ImageGenerationTaskMeta
	/** @deprecated 仅用于兼容旧版高清放大数据，新的持久化请使用 imageGenerationTaskMeta */
	generateHightImageRequest?: GenerateHightImageRequest
	/** 源图裁剪区域 */
	crop?: CropConfig
}

/** 视频元素 */
export interface VideoElement extends BaseElementProps {
	type: typeof ElementTypeEnum.Video
	/** 视频源(用来换取 ossSrc 的临时 path) */
	src?: string
	/** 视频状态 */
	status?: GenerationStatus
	/** 错误信息 */
	errorMessage?: string
	/** 海报源(用来换取 ossSrc 的临时 path) （暂未支持） */
	// poster?: string
	/** 视频生成请求参数（请求成功后保存） */
	generateVideoRequest?: GenerateVideoRequest
	/** 视频生成结果元信息（计费、生成参数与运行时间） */
	videoGenerationResultMeta?: VideoGenerationResultMeta
}

/** 可上传/下载的文件类元素（图片、视频等），用于 uploadFiles / downloadFiles 等接口 */
export type CanvasFileElement = ImageElement | VideoElement

/** 图层元素联合类型 */
export type LayerElement =
	| FrameElement
	| GroupElement
	| RectangleElement
	| StarElement
	| EllipseElement
	| TriangleElement
	| TextElement
	| ImageElement
	| VideoElement

/** 视口状态 */
export interface ViewportState {
	/** 缩放比例 (0.1 - 2.0) */
	scale: number
	/** 画布 X 偏移 */
	x: number
	/** 画布 Y 偏移 */
	y: number
}

/** 标记类型枚举 */
export const MarkerTypeEnum = {
	/** 标记 */
	Mark: 1,
	/** 区域 */
	Area: 2,
} as const

/** 标记类型 */
export type MarkerType = (typeof MarkerTypeEnum)[keyof typeof MarkerTypeEnum]

/** 标记数据结构（包含位置和识别信息） */
export interface MarkerCommon {
	/** 标记唯一标识 */
	id: string
	/** 文件路径 */
	filePath?: string
	/** 关联的元素ID */
	elementId: string
	/** 标记创建/更新时对应的图片裁剪信息 */
	elementCrop?: CropConfigWithoutDisplaySize
	/** 标记在元素内的相对X位置（0-1，相对于元素宽度的比例） */
	relativeX: number
	/** 标记在元素内的相对Y位置（0-1，相对于元素高度的比例） */
	relativeY: number
	/** 标记识别图片信息 */
	result?: IdentifyImageMarkResponse
	/** 选中下标 */
	selectedSuggestionIndex?: number
	/** 错误信息 */
	error?: string
}

/** 标记点 */
export interface MarkerPoint extends MarkerCommon {
	/** 类型 */
	type: typeof MarkerTypeEnum.Mark
}

/** 区域标记 */
export interface MarkerArea extends MarkerCommon {
	/** 类型 */
	type: typeof MarkerTypeEnum.Area
	/** 区域宽度 */
	areaWidth: number
	/** 区域高度 */
	areaHeight: number
}

/** 标记类型 */
export type Marker = MarkerPoint | MarkerArea

/**
 * 画布元素业务关联线。
 *
 * 该结构只表达持久化的因果语义：sourceElementId -> targetElementId。
 * 视觉上的左右连接点由渲染层根据元素位置实时计算，不写入画布 DSL。
 */
export interface CanvasConnection {
	/** 关联线唯一标识 */
	id: string
	/** 上游/原因/输入元素 ID；默认视觉承接方向为左到右 */
	sourceElementId: string
	/** 下游/结果/消费方元素 ID */
	targetElementId: string
}

/** 画布文档结构 */
export interface CanvasDocument {
	/** 元素 */
	elements?: LayerElement[]
	/** 元素业务关联线 */
	connections?: CanvasConnection[]
}

/**
 * 视口预留值类型：支持数值（像素）或百分比字符串，与 Padding 语义统一
 */
export type PaddingInsetValue = number | `${number}%`

/**
 * 视口预留配置
 * 支持数字与百分比字符串
 */
export interface PaddingInsetConfig {
	left?: PaddingInsetValue
	right?: PaddingInsetValue
	top?: PaddingInsetValue
	bottom?: PaddingInsetValue
	minLeft?: PaddingInsetValue
	minRight?: PaddingInsetValue
	minTop?: PaddingInsetValue
	minBottom?: PaddingInsetValue
	maxLeft?: PaddingInsetValue
	maxRight?: PaddingInsetValue
	maxTop?: PaddingInsetValue
	maxBottom?: PaddingInsetValue
}

/**
 * 视口预留后的智能对齐规则（由 padding 配置及解析后的 insets 推导）：
 * - 仅设置水平方向 padding 时，垂直居中、水平左对齐
 * - 仅设置垂直方向 padding 时，水平居中、垂直顶对齐
 * - 水平与垂直都设置时，根据两侧 inset 大小决定：哪侧 inset 更小则贴哪侧，相等则居中
 * - 都未设置时，水平垂直都居中
 */
export type ViewportPaddingAlignHorizontal = "left" | "center" | "right"
export type ViewportPaddingAlignVertical = "top" | "center" | "bottom"

export interface ViewportPaddingAlignment {
	horizontal: ViewportPaddingAlignHorizontal
	vertical: ViewportPaddingAlignVertical
}

/** 解析后的四边 inset（像素），用于智能对齐推导 */
export interface ViewportPaddingInsets {
	left: number
	right: number
	top: number
	bottom: number
}

export type CanvasDesignPluginSource = "builtin" | "user"

export type CanvasDesignPluginLocaleMessages = Record<string, string>

export type CanvasDesignPluginLocales = Record<string, CanvasDesignPluginLocaleMessages>

export interface CanvasDesignPluginCategory {
	key: string
	label?: string
}

export type CanvasDesignPluginCapability =
	| "ui.toast"
	| "ui.close"
	| "ui.setHeight"
	| "resources.resolve"
	| "assets.pickFiles"
	| "assets.uploadFile"
	| "assets.fetchBlob"
	| "ai.getImageModels"
	| "ai.generateAndPlace"
	| "ai.completeImagePrompt"
	| "plugin.storage"

export type CanvasDesignPluginRuntimeVersion = number

export interface CanvasDesignPluginConfig {
	name: string
	/** Runtime processor version. It selects CanvasDesign's versioned plugin handler, e.g. runtime/v1. */
	version: CanvasDesignPluginRuntimeVersion
	/** Single-character emoji or a relative path to a media asset inside the plugin package. */
	icon?: string
	category?: CanvasDesignPluginCategory
	tags?: string[]
	label: string
	description: string
	/** Relative path to the plugin runtime entry script. */
	entry: string
	/** Relative stylesheet path or paths inside the plugin package. */
	styles?: string | string[]
	/** Host capabilities the plugin is allowed to call through the runtime bridge. */
	capabilities?: string[]
	/** Browser-resolved runtime URL for built-in plugin iframe loading. */
	runtimeUrl?: string
	/** Browser-resolved base URL for resolving resources inside the plugin package. */
	resourceBaseUrl?: string
	/** Inline runtime script content for built-in or imported user plugins. */
	runtimeCode?: string
	/** Inline stylesheet content loaded from styles entries. */
	styleCode?: string[]
	/** Resolve a relative resource path inside the plugin package to a browser URL. */
	resolveResourceUrl?: (path: string) => string | Promise<string>
	/** Plugin locale messages declared in manifest.json. */
	locales?: CanvasDesignPluginLocales
}

export interface CanvasDesignPlugin extends CanvasDesignPluginConfig {
	/** Plugin source: built-in plugin or user plugin. */
	source: CanvasDesignPluginSource
}

export interface CanvasDesignUserPluginLoadConfig {
	/** Topic-file resource directory that contains user plugins, usually ./plugins. */
	rootPath: string
	/** Plugin folder names under rootPath. Each folder is one user plugin package. */
	directories?: string[]
}

export interface CanvasDesignPluginModuleConfig {
	/** Built-in plugins registered by the host application. */
	builtin?: CanvasDesignPlugin[]
	/** User plugins loaded from the topic-file resource directory. */
	user?: CanvasDesignUserPluginLoadConfig
}
