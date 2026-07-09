import { useCallback, useEffect, useMemo, useRef, useState, type PropsWithChildren } from "react"
import { Film, Type } from "lucide-react"
import {
	ContextMenu,
	ContextMenuContent,
	ContextMenuTrigger,
} from "../../primitives/shadcn/context-menu"
import { ImageSparkles } from "../../primitives/icons"
import { useCanvasEvent } from "../../../app/hooks/canvas"
import { useCanvas } from "../../../app/providers/CanvasProvider"
import { useMagic } from "../../../app/providers/MagicProvider"
import { useCanvasDesignI18n } from "../../../app/providers/I18nProvider"
import type { LayerElement } from "../../../runtime/document/types"
import { MenuItemRenderer } from "./MenuItemRenderer"
import type { MenuItem } from "./types"

type ConnectionMenuCreateKind = "text" | "image-generator" | "video-generator"

interface ConnectionMenuContext {
	connectionId?: string
	originElementId?: string
	originSide?: "left" | "right"
	canvasX: number
	canvasY: number
	source: "handle" | "drag-empty"
}

const MENU_WIDTH = 220
const CREATE_ELEMENT_GAP_MIN_CANVAS_PX = 1024
const CREATE_ELEMENT_GAP_MAX_CANVAS_PX = 2048
const CREATE_ELEMENT_GAP_SIZE_RATIO = 0.7

function clampCreateElementGap(gap: number): number {
	return Math.min(
		CREATE_ELEMENT_GAP_MAX_CANVAS_PX,
		Math.max(CREATE_ELEMENT_GAP_MIN_CANVAS_PX, gap),
	)
}

function getConnectionMenuTriggerAxisSize(
	element: LayerElement | undefined,
	side: NonNullable<ConnectionMenuContext["originSide"]>,
): number | null {
	const size = side === "left" || side === "right" ? element?.width : element?.height
	const scale = side === "left" || side === "right" ? element?.scaleX : element?.scaleY
	const scaledSize = Math.abs((size ?? 0) * (scale ?? 1))
	return Number.isFinite(scaledSize) && scaledSize > 0 ? scaledSize : null
}

export function ConnectionMenuProvider(props: PropsWithChildren<unknown>) {
	const { children } = props
	const { canvas } = useCanvas()
	const { imageModelList, videoModelList } = useMagic()
	const { t } = useCanvasDesignI18n()
	const triggerRef = useRef<HTMLDivElement>(null)
	const [menuKey, setMenuKey] = useState(0)
	const [isMenuOpen, setIsMenuOpen] = useState(false)
	const [isClickEnabled, setIsClickEnabled] = useState(false)
	const connectionMenuContextRef = useRef<ConnectionMenuContext | null>(null)
	const [connectionMenuContext, setConnectionMenuContext] =
		useState<ConnectionMenuContext | null>(null)

	const triggerMenuDisplay = useCallback((x: number, y: number) => {
		requestAnimationFrame(() => {
			const trigger = triggerRef.current
			if (!trigger) return

			trigger.dispatchEvent(
				new MouseEvent("contextmenu", {
					bubbles: true,
					cancelable: true,
					clientX: x,
					clientY: y,
				}),
			)
		})
	}, [])

	const resolveCreateGap = useCallback(
		(context: ConnectionMenuContext): number => {
			if (!canvas || !context.originElementId || !context.originSide) {
				return CREATE_ELEMENT_GAP_MIN_CANVAS_PX
			}

			const originElement = canvas.elementManager.getElementData(context.originElementId)
			const triggerAxisSize = getConnectionMenuTriggerAxisSize(
				originElement,
				context.originSide,
			)
			if (!triggerAxisSize) {
				return CREATE_ELEMENT_GAP_MIN_CANVAS_PX
			}

			return clampCreateElementGap(triggerAxisSize * CREATE_ELEMENT_GAP_SIZE_RATIO)
		},
		[canvas],
	)

	const resolveCreateAnchorPoint = useCallback(
		(context: ConnectionMenuContext): { x: number; y: number } => {
			if (context.source === "drag-empty") {
				return {
					x: context.canvasX,
					y: context.canvasY,
				}
			}

			const direction = context.originSide === "left" ? -1 : 1
			const gap = resolveCreateGap(context)
			return {
				x: context.canvasX + gap * direction,
				y: context.canvasY,
			}
		},
		[resolveCreateGap],
	)

	const resolveCreateCenterPoint = useCallback(
		(
			context: ConnectionMenuContext,
			size: { width: number; height: number },
		): { x: number; y: number } => {
			const anchor = resolveCreateAnchorPoint(context)
			const direction =
				context.source === "drag-empty" && context.originSide === "left" ? -1 : 1
			return {
				x: anchor.x + (size.width / 2) * direction,
				y: anchor.y,
			}
		},
		[resolveCreateAnchorPoint],
	)

	const resolveCreateTopLeftPoint = useCallback(
		(
			context: ConnectionMenuContext,
			size: { width: number; height: number },
		): { x: number; y: number } => {
			const anchor = resolveCreateAnchorPoint(context)
			return {
				x:
					context.source === "drag-empty" && context.originSide === "left"
						? anchor.x - size.width
						: anchor.x,
				y: anchor.y - size.height / 2,
			}
		},
		[resolveCreateAnchorPoint],
	)

	const connectCreatedElement = useCallback(
		(context: ConnectionMenuContext, createdElementId: string) => {
			if (!canvas || !context.originElementId || !context.originSide) return

			const sourceElementId =
				context.originSide === "right" ? context.originElementId : createdElementId
			const targetElementId =
				context.originSide === "right" ? createdElementId : context.originElementId
			canvas.connectionManager.connectElements({
				sourceElementId,
				targetElementId,
			})
		},
		[canvas],
	)

	const createElementAndConnect = useCallback(
		(kind: ConnectionMenuCreateKind, context: ConnectionMenuContext) => {
			if (!canvas || !context.originElementId || !context.originSide) {
				return
			}

			let createdElementId: string | null = null
			let point: { x: number; y: number } | null = null
			if (kind === "text") {
				const size = canvas.textEditingManager.getInitialTextElementSize()
				point = resolveCreateTopLeftPoint(context, size)
				createdElementId = canvas.textEditingManager.startCreatingAt(point.x, point.y)
			} else if (kind === "image-generator") {
				const imageGeneratorTool = canvas.toolManager.getImageGeneratorTool()
				const size = imageGeneratorTool.getImageElementSizeForModelList(imageModelList)
				point = resolveCreateCenterPoint(context, size)
				createdElementId = imageGeneratorTool.createImageAtCanvasPoint(
					point.x,
					point.y,
					imageModelList,
				)
			} else if (kind === "video-generator") {
				const videoGeneratorTool = canvas.toolManager.getVideoGeneratorTool()
				const size = videoGeneratorTool.getVideoElementSizeForModelList(videoModelList)
				point = resolveCreateCenterPoint(context, size)
				createdElementId = videoGeneratorTool.createVideoAtCanvasPoint(
					point.x,
					point.y,
					videoModelList,
				)
			}

			if (!createdElementId || !point) return
			connectCreatedElement(context, createdElementId)
		},
		[
			canvas,
			connectCreatedElement,
			imageModelList,
			resolveCreateCenterPoint,
			resolveCreateTopLeftPoint,
			videoModelList,
		],
	)

	const menuItems = useMemo<MenuItem[]>(() => {
		if (!connectionMenuContext) return []
		const translate = (key: string, fallback: string) => {
			return t ? t(key, fallback) : fallback
		}

		return [
			{
				id: "connection-add-text",
				label: translate("tools.text", "文本"),
				icon: Type,
				onClick: () => {
					createElementAndConnect("text", connectionMenuContext)
				},
			},
			{
				id: "connection-add-image-generator",
				label: translate("tools.imageGenerator", "图像生成"),
				icon: ImageSparkles,
				onClick: () => {
					createElementAndConnect("image-generator", connectionMenuContext)
				},
			},
			{
				id: "connection-add-video-generator",
				label: translate("tools.videoGenerator", "视频生成"),
				icon: Film,
				onClick: () => {
					createElementAndConnect("video-generator", connectionMenuContext)
				},
			},
		]
	}, [connectionMenuContext, createElementAndConnect, t])

	const handleMenuOpenChange = useCallback(
		(open: boolean) => {
			setIsMenuOpen(open)
			if (open) {
				setIsClickEnabled(false)
				setTimeout(() => {
					setIsClickEnabled(true)
				}, 150)
				return
			}

			const closingContext = connectionMenuContextRef.current
			if (canvas && closingContext) {
				canvas.eventEmitter.emit({
					type: "connection:menu:close",
					data: {
						connectionId: closingContext.connectionId,
						originElementId: closingContext.originElementId,
						originSide: closingContext.originSide,
						source: closingContext.source,
					},
				})
			}
			connectionMenuContextRef.current = null
			setConnectionMenuContext(null)
			setIsClickEnabled(false)
		},
		[canvas],
	)

	useEffect(() => {
		if (!canvas) return
		if (isMenuOpen) {
			canvas.viewportController.disablePanZoom()
			return
		}

		canvas.viewportController.enablePanZoom()
	}, [canvas, isMenuOpen])

	useCanvasEvent(
		"connection:menu:open",
		useCallback(
			({ data }) => {
				const nextContext = {
					connectionId: data.connectionId,
					originElementId: data.originElementId,
					originSide: data.originSide,
					canvasX: data.canvasX,
					canvasY: data.canvasY,
					source: data.source,
				}
				connectionMenuContextRef.current = nextContext
				setConnectionMenuContext(nextContext)
				setMenuKey((prev) => prev + 1)
				triggerMenuDisplay(data.x, data.y)
			},
			[triggerMenuDisplay],
		),
		[triggerMenuDisplay],
	)

	return (
		<>
			<ContextMenu key={menuKey} onOpenChange={handleMenuOpenChange}>
				<ContextMenuTrigger asChild>
					<div
						ref={triggerRef}
						style={{
							position: "absolute",
							width: 0,
							height: 0,
							pointerEvents: "none",
							visibility: "hidden",
						}}
					/>
				</ContextMenuTrigger>
				<ContextMenuContent
					className="box-border data-[state=closed]:hidden data-[state=closed]:!animate-none data-[state=closed]:!transition-none data-[state=closed]:!duration-0"
					style={{ width: MENU_WIDTH, minWidth: MENU_WIDTH }}
					data-canvas-ui-component
					onCloseAutoFocus={(event) => {
						event.preventDefault()
					}}
				>
					{!!menuItems.length && (
						<MenuItemRenderer
							menuWidth={MENU_WIDTH}
							items={menuItems}
							isClickEnabled={isClickEnabled}
						/>
					)}
				</ContextMenuContent>
			</ContextMenu>
			{children}
		</>
	)
}
