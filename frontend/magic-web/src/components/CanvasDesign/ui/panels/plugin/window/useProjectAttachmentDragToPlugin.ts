import { useCallback, useEffect, useRef, useState, type RefObject } from "react"
import { toast } from "sonner"

import type { Canvas } from "../../../../runtime/core/Canvas"
import type { CanvasDesignPlugin } from "../../../../runtime/document/types"
import {
	createCanvasAssetDragSessionId,
	pluginHasCapability,
	type PluginCanvasAssetDragTargetMode,
	type PluginRuntimeMessage,
} from "../runtime-protocol/v1/index"
import { getIframePoint, getPluginWindowHoverState } from "./dragGeometry"
import { resolvePluginFileAssets } from "../assets/fileAssets"
import {
	getProjectAttachmentImageFilesFromDataTransfer,
	hasProjectAttachmentDragPayload,
} from "./projectAttachmentDrag"

type CanvasAssetDragTargetMessage = Extract<
	PluginRuntimeMessage,
	{ type: "magic-canvas-plugin:canvas-asset-drag-target" }
>

interface DropTarget {
	targetId: string
	mode: PluginCanvasAssetDragTargetMode
	canDrop: boolean
	importRemaining?: number
}

interface UseProjectAttachmentDragToPluginParams {
	canvas: Canvas
	channelToken: string
	iframeRef: RefObject<HTMLIFrameElement | null>
	plugin: CanvasDesignPlugin
	pluginWindowRef: RefObject<HTMLDivElement | null>
}

/**
 * 处理项目附件拖拽到插件浮窗的事件。
 * @param canvas - 画布实例
 * @param channelToken - 插件通道 token
 * @param iframeRef - iframe 引用
 * @param plugin - 插件实例
 * @param pluginWindowRef - 插件浮窗引用
 * @returns 处理项目附件拖拽到插件浮窗的事件的函数
 */
export function useProjectAttachmentDragToPlugin({
	canvas,
	channelToken,
	iframeRef,
	plugin,
	pluginWindowRef,
}: UseProjectAttachmentDragToPluginParams): {
	handleProjectAttachmentDragTarget: (target: CanvasAssetDragTargetMessage) => void
	isProjectAttachmentDragActive: boolean
	isProjectAttachmentDropResolving: boolean
} {
	const [activeSessionId, setActiveSessionId] = useState<string | null>(null)
	const [isProjectAttachmentDragDetected, setIsProjectAttachmentDragDetected] = useState(false)
	const [isDropResolving, setIsDropResolving] = useState(false)
	const activeSessionIdRef = useRef<string | null>(null)
	const isProjectAttachmentDragDetectedRef = useRef(false)
	const isDropResolvingRef = useRef(false)
	const isInsideIframeRef = useRef(false)
	const targetRef = useRef<DropTarget | null>(null)
	// 只有声明了 assets.pickFiles 能力的插件才允许接收项目附件拖拽。
	const canAcceptProjectAttachmentDrag = pluginHasCapability(plugin, "assets.pickFiles")

	useEffect(() => {
		activeSessionIdRef.current = activeSessionId
	}, [activeSessionId])

	const setProjectAttachmentDragDetected = useCallback((detected: boolean) => {
		if (isProjectAttachmentDragDetectedRef.current === detected) return
		isProjectAttachmentDragDetectedRef.current = detected
		setIsProjectAttachmentDragDetected(detected)
	}, [])

	/** 向插件 iframe 投递带 channelToken 的宿主消息 */
	const postPluginMessage = useCallback(
		(message: Record<string, unknown>) => {
			iframeRef.current?.contentWindow?.postMessage(
				{
					channelToken,
					...message,
				},
				"*",
			)
		},
		[channelToken, iframeRef],
	)

	/** 通知插件清理画布图片拖拽 hover/drop 状态（不结束宿主拖拽会话） */
	const sendDragLeave = useCallback(() => {
		isInsideIframeRef.current = false
		targetRef.current = null
		// 指针离开 iframe 或拖拽结束时，通知插件清理内部 hover 样式。
		postPluginMessage({
			type: "magic-canvas-plugin:canvas-asset-drag-leave",
		})
	}, [postPluginMessage])

	/** 结束拖拽会话，清理状态 */
	const finishDragSession = useCallback(() => {
		sendDragLeave()
		activeSessionIdRef.current = null
		setActiveSessionId(null)
	}, [sendDragLeave])

	/** 清理项目附件拖拽状态，包括用于挡住 iframe 的提前识别状态 */
	const resetProjectAttachmentDrag = useCallback(() => {
		finishDragSession()
		setProjectAttachmentDragDetected(false)
	}, [finishDragSession, setProjectAttachmentDragDetected])

	/** 发送拖拽移动消息，通知插件更新预览状态 */
	const postDragMove = useCallback(
		(sessionId: string, event: DragEvent) => {
			const iframePoint = getIframePoint(iframeRef.current, event.clientX, event.clientY)
			if (!iframePoint) {
				if (isInsideIframeRef.current) {
					sendDragLeave()
				}
				return
			}

			isInsideIframeRef.current = true
			// 给iframe 发 move 事件，只传元信息，真正文件会在确认 drop 后再解析，避免拖动中反复上传。
			postPluginMessage({
				type: "magic-canvas-plugin:canvas-asset-drag-move",
				dragSessionId: sessionId,
				clientX: iframePoint.x,
				clientY: iframePoint.y,
				assetsMeta: {
					count: 1,
					source: "project-attachment",
				},
			})
		},
		[iframeRef, postPluginMessage, sendDragLeave],
	)

	/** 确保拖拽会话存在 */
	const ensureDragSession = useCallback((): string => {
		const existingSessionId = activeSessionIdRef.current
		if (existingSessionId) return existingSessionId

		const sessionId = createCanvasAssetDragSessionId()
		activeSessionIdRef.current = sessionId
		targetRef.current = null
		setActiveSessionId(sessionId)
		return sessionId
	}, [])

	const handleProjectAttachmentDragTarget = useCallback(
		(target: CanvasAssetDragTargetMessage) => {
			const activeSessionId = activeSessionIdRef.current
			if (!activeSessionId || target.dragSessionId !== activeSessionId) return

			targetRef.current =
				target.canDrop && target.targetId && target.mode && isInsideIframeRef.current
					? {
							targetId: target.targetId,
							mode: target.mode,
							canDrop: true,
							importRemaining: target.importRemaining,
						}
					: null
		},
		[],
	)

	useEffect(() => {
		if (!canAcceptProjectAttachmentDrag) return undefined

		// 拖拽阶段只识别项目文件 payload，图片筛选留到 drop 阶段。
		const isProjectAttachmentEvent = (event: DragEvent): boolean =>
			hasProjectAttachmentDragPayload(event.dataTransfer)

		// 只有指针仍位于插件窗体范围内时，才接管这次拖拽。
		const isOverPluginWindow = (event: DragEvent): boolean =>
			getPluginWindowHoverState(pluginWindowRef.current, event.clientX, event.clientY)

		const stopPluginDragEvent = (event: DragEvent) => {
			event.preventDefault()
			event.stopPropagation()
			event.stopImmediatePropagation()
		}

		// 移动阶段只维持会话和 hover，不在这里按文件类型拦截。
		const handleDragMove = (event: DragEvent) => {
			if (!isProjectAttachmentEvent(event)) {
				if (activeSessionIdRef.current || isProjectAttachmentDragDetectedRef.current) {
					resetProjectAttachmentDrag()
				}
				return
			}

			// 一旦识别出左侧项目文件拖拽，就先渲染 iframe 的遮罩，避免 iframe和画布 抢走后续 dragover/drop。
			setProjectAttachmentDragDetected(true)

			if (!isOverPluginWindow(event)) {
				if (activeSessionIdRef.current) {
					finishDragSession()
				}
				return
			}

			// 阻止拖拽默认行为，阻拦画布侧 dragover/drop 事件。
			stopPluginDragEvent(event)

			const sessionId = ensureDragSession()
			postDragMove(sessionId, event)
			// HTML5 DnD 光标由 dropEffect 决定；仅可投放目标显示 copy，其余为 none。
			if (event.dataTransfer) {
				event.dataTransfer.dropEffect = targetRef.current?.canDrop ? "copy" : "none"
			}
		}

		// drop 时再过滤图片；文件夹与非图片文件静默丢弃。
		const handleDrop = (event: DragEvent) => {
			// 只有包含项目附件拖拽数据时，才接管这次拖拽。
			if (!isProjectAttachmentEvent(event)) return

			// 只有指针仍位于插件窗体范围内时，才接管这次拖拽。
			if (!isOverPluginWindow(event)) {
				resetProjectAttachmentDrag()
				return
			}

			// 阻止拖拽默认行为，阻拦画布侧 dragover/drop 事件。
			stopPluginDragEvent(event)

			const sessionId = activeSessionIdRef.current
			const target = targetRef.current
			if (!sessionId || !target?.canDrop) {
				resetProjectAttachmentDrag()
				return
			}

			const imageFiles = getProjectAttachmentImageFilesFromDataTransfer(event.dataTransfer)
			const maxResolveCount =
				target.mode === "slot"
					? 1
					: Math.max(0, target.importRemaining ?? imageFiles.length)
			const filesToResolve = imageFiles.slice(0, maxResolveCount)
			if (!filesToResolve.length) {
				resetProjectAttachmentDrag()
				return
			}

			// 同步标记：drop 后浏览器会立刻再发 dragend，不能把 session 清掉。
			isDropResolvingRef.current = true
			setIsDropResolving(true)
			const toastId = toast.loading(
				canvas.t?.("plugin.canvasAssetDrop.loading", "正在导入图片...") ||
					"正在导入图片...",
			)
			void resolvePluginFileAssets(canvas, filesToResolve, { type: "image" })
				.then((files) => {
					if (activeSessionIdRef.current !== sessionId || !files.length) {
						toast.dismiss(toastId)
						throw new Error("Session expired or no image asset resolved.")
					}
					postPluginMessage({
						type: "magic-canvas-plugin:canvas-asset-drop",
						dragSessionId: sessionId,
						targetId: target.targetId,
						files,
					})
					toast.dismiss(toastId)
				})
				.catch(() => {
					toast.error(
						canvas.t?.("plugin.canvasAssetDrop.error", "图片导入失败，请重试") ||
							"图片导入失败，请重试",
						{ id: toastId },
					)
				})
				.finally(() => {
					if (activeSessionIdRef.current === sessionId) {
						resetProjectAttachmentDrag()
					}
					isDropResolvingRef.current = false
					setIsDropResolving(false)
				})
		}

		// 在插件外松手时往往只有 dragend、没有 drop；仅用于放弃场景清理遮罩。
		const handleDragEnd = () => {
			if (isDropResolvingRef.current) return
			if (activeSessionIdRef.current || isProjectAttachmentDragDetectedRef.current) {
				resetProjectAttachmentDrag()
			}
		}

		window.addEventListener("dragenter", handleDragMove, true)
		window.addEventListener("dragover", handleDragMove, true)
		window.addEventListener("drop", handleDrop, true)
		window.addEventListener("dragend", handleDragEnd, true)

		return () => {
			window.removeEventListener("dragenter", handleDragMove, true)
			window.removeEventListener("dragover", handleDragMove, true)
			window.removeEventListener("drop", handleDrop, true)
			window.removeEventListener("dragend", handleDragEnd, true)
		}
	}, [
		canAcceptProjectAttachmentDrag,
		canvas,
		ensureDragSession,
		finishDragSession,
		pluginWindowRef,
		postDragMove,
		postPluginMessage,
		resetProjectAttachmentDrag,
		setProjectAttachmentDragDetected,
	])

	useEffect(() => {
		return () => {
			resetProjectAttachmentDrag()
		}
	}, [resetProjectAttachmentDrag])

	return {
		handleProjectAttachmentDragTarget,
		isProjectAttachmentDragActive: isProjectAttachmentDragDetected && !isDropResolving,
		isProjectAttachmentDropResolving: isDropResolving,
	}
}
