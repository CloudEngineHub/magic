import {
	createContext,
	useContext,
	useState,
	useMemo,
	useCallback,
	useEffect,
	useReducer,
	type ReactNode,
} from "react"
import { useUpdateEffect } from "ahooks"
import type { CropConfig, LayerElement } from "../../runtime/document/types"
import { useCanvasEvent } from "../hooks/canvas/useCanvasEvent"
import { useCanvasElements } from "../hooks/canvas/useCanvasElement"
import { useCanvas } from "./CanvasProvider"
import type { ElementToolSession } from "../../runtime/element-tools"
import { ElementTypeEnum } from "../../runtime/document/types"
import {
	pickContentElementIdAtStagePointer,
	resolveManagedElementIdFromKonvaNode,
} from "../../runtime/interaction/transform/elementNodeUtils"

export interface FullscreenMediaElement {
	elementId: string
	type: "image" | "video" | "audio"
}

export interface StoryboardReferenceImagePreview {
	path: string
	crop?: CropConfig
}

interface CanvasUIContextValue {
	// 当前正在图层列表中重命名的元素 ID
	layerRenamingElementId: string | null
	setLayerRenamingElementId: (id: string | null) => void

	// 当前正在画布中重命名的元素 ID
	canvasRenamingElementId: string | null
	setCanvasRenamingElementId: (id: string | null) => void

	// 选中的元素 ID 列表（从 Canvas.selectionManager 同步）
	selectedElementIds: string[]

	// 选中的元素列表
	selectedElements: LayerElement[]

	// 是否正在拖拽元素
	isDragging: boolean

	// 是否正在框选元素
	isSelecting: boolean

	// 当前查看历史记录的图片元素 ID（null 表示不显示）
	messageHistoryElementId: string | null
	setMessageHistoryElementId: (id: string | null) => void

	// 当前全屏预览的媒体元素（null 表示不显示）
	fullscreenMediaElement: FullscreenMediaElement | null
	setFullscreenMediaElement: (element: FullscreenMediaElement | null) => void
	storyboardReferenceImagePreview: StoryboardReferenceImagePreview | null
	setStoryboardReferenceImagePreview: (preview: StoryboardReferenceImagePreview | null) => void

	// 当前正在裁剪的图片元素 ID（null 表示不在裁剪模式）
	croppingElementId: string | null
	setCroppingElementId: (id: string | null) => void

	// 当前正在扩展的图片元素 ID（null 表示不在扩展模式）
	extendingElementId: string | null
	setExtendingElementId: (id: string | null) => void

	// 当前正在使用橡皮擦的图片元素 ID（null 表示不在橡皮擦模式）
	erasingElementId: string | null
	setErasingElementId: (id: string | null) => void

	// 当前正在使用图片/视频编辑器的元素 ID
	editingElementId: string | null
	setEditingElementId: (id: string | null) => void

	// 当前工具会话
	activeToolSession: ElementToolSession | null
	setActiveToolSession: (session: ElementToolSession | null) => void
}

interface CanvasRenameUIContextValue {
	layerRenamingElementId: string | null
	setLayerRenamingElementId: (id: string | null) => void
	canvasRenamingElementId: string | null
	setCanvasRenamingElementId: (id: string | null) => void
}

interface CanvasSelectionUIContextValue {
	selectedElementIds: string[]
	selectedElements: LayerElement[]
	isDragging: boolean
	isSelecting: boolean
	activeToolSession: ElementToolSession | null
	setActiveToolSession: (session: ElementToolSession | null) => void
}

interface CanvasPanelUIContextValue {
	messageHistoryElementId: string | null
	setMessageHistoryElementId: (id: string | null) => void
	fullscreenMediaElement: FullscreenMediaElement | null
	setFullscreenMediaElement: (element: FullscreenMediaElement | null) => void
	storyboardReferenceImagePreview: StoryboardReferenceImagePreview | null
	setStoryboardReferenceImagePreview: (preview: StoryboardReferenceImagePreview | null) => void
}

interface CanvasModeUIContextValue {
	croppingElementId: string | null
	setCroppingElementId: (id: string | null) => void
	extendingElementId: string | null
	setExtendingElementId: (id: string | null) => void
	erasingElementId: string | null
	setErasingElementId: (id: string | null) => void
	editingElementId: string | null
	setEditingElementId: (id: string | null) => void
}

const CanvasRenameUIContext = createContext<CanvasRenameUIContextValue | undefined>(undefined)
const CanvasSelectionUIContext = createContext<CanvasSelectionUIContextValue | undefined>(undefined)
const CanvasPanelUIContext = createContext<CanvasPanelUIContextValue | undefined>(undefined)
const CanvasModeUIContext = createContext<CanvasModeUIContextValue | undefined>(undefined)

interface CanvasUIProviderProps {
	children: ReactNode
}

export function CanvasUIProvider({ children }: CanvasUIProviderProps) {
	const { canvas } = useCanvas()
	const [, forceAccessUpdate] = useReducer((value: number) => value + 1, 0)
	const canWrite = canvas?.permissionManager?.can("document.write") ?? false
	const canGenerate = canvas?.permissionManager?.can("sideEffect.generate") ?? false
	const [layerRenamingElementId, setLayerRenamingElementId] = useState<string | null>(null)
	const [canvasRenamingElementId, setCanvasRenamingElementId] = useState<string | null>(null)

	const [selectedElementIds, setSelectedElementIds] = useState<string[]>([])
	const [isDragging, setIsDragging] = useState(false)
	const [isSelecting, setIsSelecting] = useState(false)

	const [messageHistoryElementId, setMessageHistoryElementId] = useState<string | null>(null)
	const [fullscreenMediaElement, setFullscreenMediaElement] =
		useState<FullscreenMediaElement | null>(null)
	const [storyboardReferenceImagePreview, setStoryboardReferenceImagePreview] =
		useState<StoryboardReferenceImagePreview | null>(null)

	const [croppingElementId, setCroppingElementId] = useState<string | null>(null)
	const [extendingElementId, setExtendingElementId] = useState<string | null>(null)
	const [erasingElementId, setErasingElementId] = useState<string | null>(null)
	const [editingElementId, setEditingElementId] = useState<string | null>(null)

	const [activeToolSession, setActiveToolSession] = useState<ElementToolSession | null>(null)

	// 监听选中事件
	useCanvasEvent("element:select", ({ data }) => {
		setSelectedElementIds(data.elementIds)
		setActiveToolSession(null)
		setEditingElementId(null)
	})

	// 监听取消选中事件
	useCanvasEvent("element:deselect", () => {
		setSelectedElementIds([])
		setActiveToolSession(null)
		setEditingElementId(null)
	})

	// 监听拖拽开始事件
	useCanvasEvent("elements:transform:dragstart", () => {
		setIsDragging(true)
	})

	// 监听拖拽结束事件
	useCanvasEvent("elements:transform:dragend", () => {
		setIsDragging(false)
	})

	// 监听框选开始事件
	useCanvasEvent("selection:start", () => {
		setIsSelecting(true)
	})

	// 监听框选结束事件
	useCanvasEvent("selection:end", () => {
		setIsSelecting(false)
	})

	const openMessageHistory = useCallback((elementId: string) => {
		setMessageHistoryElementId(elementId)
	}, [])

	useEffect(() => {
		if (!canvas || !messageHistoryElementId) return
		if (
			canvas.elementManager.getElementData(messageHistoryElementId)?.type !==
			ElementTypeEnum.Image
		)
			return
		// 同一图片再次点击不会改变选区；直接消费已有输入事件，切回编辑器。
		return canvas.inputManager.on("down", (input) => {
			if (input.button !== 0 || input.activePointerCount > 1) return
			if (Object.values(input.modifiers).some(Boolean)) return
			let node: typeof input.target | null = input.target
			while (node && node !== canvas.stage) {
				if (node.name().startsWith("decorator-")) return
				node = node.getParent()
			}
			const elementId =
				resolveManagedElementIdFromKonvaNode(input.target, canvas) ??
				pickContentElementIdAtStagePointer(canvas, input.stage)
			if (elementId === messageHistoryElementId) setMessageHistoryElementId(null)
		})
	}, [canvas, messageHistoryElementId])

	useCanvasEvent("element:image:infoButtonClick", ({ data }) => {
		openMessageHistory(data.elementId)
	})

	useCanvasEvent("element:video:infoButtonClick", ({ data }) => {
		openMessageHistory(data.elementId)
	})

	useCanvasEvent(
		"element:image:fullscreenClick",
		({ data }) => {
			setFullscreenMediaElement({ elementId: data.elementId, type: "image" })
		},
		[],
	)

	useCanvasEvent(
		"element:video:fullscreenClick",
		({ data }) => {
			setFullscreenMediaElement({ elementId: data.elementId, type: "video" })
		},
		[],
	)

	useCanvasEvent(
		"element:audio:fullscreenClick",
		({ data }) => {
			setFullscreenMediaElement({ elementId: data.elementId, type: "audio" })
		},
		[],
	)

	useCanvasEvent(
		"storyboard:reference-image:preview",
		({ data }) => {
			setFullscreenMediaElement(null)
			setStoryboardReferenceImagePreview(data)
		},
		[],
	)

	// 替换会改变媒体资源身份；关闭旧资源的全屏预览、历史和编辑模式，
	// 避免替换完成后恢复到已经过期的媒体操作界面。
	useCanvasEvent(
		"element:media:replaceStateChanged",
		({ data }) => {
			if (data.status !== "uploading" && data.status !== "applying") return
			setActiveToolSession((current) =>
				current?.elementId === data.elementId ? null : current,
			)
			setMessageHistoryElementId((current) => (current === data.elementId ? null : current))
			setFullscreenMediaElement((current) =>
				current?.elementId === data.elementId ? null : current,
			)
			setCroppingElementId((current) => (current === data.elementId ? null : current))
			setExtendingElementId((current) => (current === data.elementId ? null : current))
			setErasingElementId((current) => (current === data.elementId ? null : current))
			setEditingElementId((current) => (current === data.elementId ? null : current))
		},
		[],
	)

	// 监听进入裁剪模式事件
	useCanvasEvent("crop:enter", ({ data }) => {
		setCroppingElementId(data.elementId)
	})

	// 监听退出裁剪模式事件
	useCanvasEvent("crop:exit", () => {
		setCroppingElementId(null)
	})

	useCanvasEvent("extend:enter", ({ data }) => {
		setExtendingElementId(data.elementId)
	})

	useCanvasEvent("extend:exit", () => {
		setExtendingElementId(null)
	})

	// 监听进入橡皮擦模式事件
	useCanvasEvent("eraser:enter", ({ data }) => {
		setErasingElementId(data.elementId)
	})

	// 监听退出橡皮擦模式事件
	useCanvasEvent("eraser:exit", () => {
		setErasingElementId(null)
	})

	useCanvasEvent("element:rename-start", ({ data }) => {
		setLayerRenamingElementId(null)
		setCanvasRenamingElementId(data.elementId)
	})

	useCanvasEvent("element:rename-end", () => {
		setCanvasRenamingElementId(null)
	})

	useUpdateEffect(() => {
		if (selectedElementIds.length !== 1 || selectedElementIds[0] !== messageHistoryElementId) {
			setMessageHistoryElementId(null)
		}
	}, [selectedElementIds])

	useEffect(() => {
		if (canWrite && canGenerate) return
		setLayerRenamingElementId(null)
		setCanvasRenamingElementId(null)
		setActiveToolSession(null)
		setEditingElementId(null)
		if (!canWrite) {
			setCroppingElementId(null)
		}
		if (!canGenerate) {
			setExtendingElementId(null)
			setErasingElementId(null)
		}
	}, [canGenerate, canWrite])

	useCanvasEvent("permission:changed", () => forceAccessUpdate(), [])

	// 获取选中的元素列表
	const selectedElements = useCanvasElements(selectedElementIds)

	const renameValue = useMemo<CanvasRenameUIContextValue>(() => {
		return {
			layerRenamingElementId,
			setLayerRenamingElementId,
			canvasRenamingElementId,
			setCanvasRenamingElementId,
		}
	}, [layerRenamingElementId, canvasRenamingElementId])

	const selectionValue = useMemo<CanvasSelectionUIContextValue>(() => {
		return {
			selectedElements,
			selectedElementIds,
			isDragging,
			isSelecting,
			activeToolSession,
			setActiveToolSession,
		}
	}, [selectedElements, selectedElementIds, isDragging, isSelecting, activeToolSession])

	const panelValue = useMemo<CanvasPanelUIContextValue>(() => {
		return {
			messageHistoryElementId,
			setMessageHistoryElementId,
			fullscreenMediaElement,
			setFullscreenMediaElement,
			storyboardReferenceImagePreview,
			setStoryboardReferenceImagePreview,
		}
	}, [messageHistoryElementId, fullscreenMediaElement, storyboardReferenceImagePreview])

	const modeValue = useMemo<CanvasModeUIContextValue>(() => {
		return {
			croppingElementId,
			setCroppingElementId,
			extendingElementId,
			setExtendingElementId,
			erasingElementId,
			setErasingElementId,
			editingElementId,
			setEditingElementId,
		}
	}, [croppingElementId, extendingElementId, erasingElementId, editingElementId])

	return (
		<CanvasRenameUIContext.Provider value={renameValue}>
			<CanvasSelectionUIContext.Provider value={selectionValue}>
				<CanvasPanelUIContext.Provider value={panelValue}>
					<CanvasModeUIContext.Provider value={modeValue}>
						{children}
					</CanvasModeUIContext.Provider>
				</CanvasPanelUIContext.Provider>
			</CanvasSelectionUIContext.Provider>
		</CanvasRenameUIContext.Provider>
	)
}

export function useCanvasRenameUI() {
	const context = useContext(CanvasRenameUIContext)
	if (context === undefined) {
		throw new Error("useCanvasRenameUI must be used within a CanvasUIProvider")
	}
	return context
}

export function useCanvasSelectionUI() {
	const context = useContext(CanvasSelectionUIContext)
	if (context === undefined) {
		throw new Error("useCanvasSelectionUI must be used within a CanvasUIProvider")
	}
	return context
}

export function useCanvasPanelUI() {
	const context = useContext(CanvasPanelUIContext)
	if (context === undefined) {
		throw new Error("useCanvasPanelUI must be used within a CanvasUIProvider")
	}
	return context
}

export function useCanvasModeUI() {
	const context = useContext(CanvasModeUIContext)
	if (context === undefined) {
		throw new Error("useCanvasModeUI must be used within a CanvasUIProvider")
	}
	return context
}

export function useCanvasUI() {
	const value: CanvasUIContextValue = {
		...useCanvasRenameUI(),
		...useCanvasSelectionUI(),
		...useCanvasPanelUI(),
		...useCanvasModeUI(),
	}
	return value
}
