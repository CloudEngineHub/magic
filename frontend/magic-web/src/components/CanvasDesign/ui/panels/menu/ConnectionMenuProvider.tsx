import { useCallback, useEffect, useMemo, useRef, useState, type PropsWithChildren } from "react"
import { Film, Type, Workflow } from "lucide-react"
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
import { MenuItemRenderer } from "./MenuItemRenderer"
import type { MenuItem } from "./types"
import {
	canCreateStoryboardVideosFromConnection,
	createStoryboardVideosFromConnection,
	getStoryboardVideoMenuLabel,
} from "../../../runtime/interaction/connection/imageVideoBatchCreation"
import {
	canCreateStoryboardFromConnection,
	createStoryboardFromConnection,
	getStoryboardConnectionCreateSize,
} from "../../../runtime/interaction/connection/storyboardConnectionCreation"
import { createElementFromElementConnection } from "../../../runtime/interaction/connection/elementConnectionCreation"
import { createElementFromSelectionConnection } from "../../../runtime/interaction/connection/selectionConnectionCreation"
import {
	getConnectionAssociationTargetKind,
	registerConnectionMenuAssociationSeed,
} from "../../../runtime/interaction/connection/connectionMenuAssociationSeed"
import {
	collectSelectionContentSnapshot,
	createSelectionRevision,
} from "../../../runtime/interaction/selection/selectionContentCollector"
import { getConnectionMenuActionRecipes } from "../../../runtime/interaction/selection/connectionMenuActionRecipes"
import { getSelectionCreateRecipes } from "../../../runtime/interaction/selection/selectionCreationRecipes"
import {
	cloneConnectionOrigin,
	type ConnectionOrigin,
} from "../../../runtime/shared/connectionOrigin"
import {
	CREATE_ELEMENT_GAP_MIN_CANVAS_PX,
	collectConnectedElementSiblingRects,
	collectConnectionCreateObstacleRects,
	resolveConnectionCreateContextWithOriginRect,
	resolveConnectionCreateGapForElement,
	resolveConnectedElementCreateCenterPoint,
	resolveConnectedElementCreateTopLeftPoint,
	type ConnectionCreatePlacementContext,
} from "../../../runtime/shared/placement/connectionCreatePlacement"

type DefaultConnectionMenuCreateKind = "text" | "image-generator" | "video-generator"
type ConnectionMenuCreateKind = DefaultConnectionMenuCreateKind | "storyboard"

interface ConnectionMenuContext extends Omit<ConnectionCreatePlacementContext, "originSide"> {
	origin: ConnectionOrigin
}

const MENU_WIDTH = 220

function getPlacementContext(context: ConnectionMenuContext): ConnectionCreatePlacementContext {
	return {
		canvasX: context.canvasX,
		canvasY: context.canvasY,
		source: context.source,
		originSide: context.origin.side,
	}
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
			if (!canvas) return CREATE_ELEMENT_GAP_MIN_CANVAS_PX
			if (context.origin.kind === "selection") {
				return Math.min(
					2048,
					Math.max(
						CREATE_ELEMENT_GAP_MIN_CANVAS_PX,
						context.origin.boundingRect.width * 0.7,
					),
				)
			}

			const originElement = canvas.elementManager.getElementData(context.origin.elementId)
			return resolveConnectionCreateGapForElement(originElement, context.origin.side)
		},
		[canvas],
	)

	const resolveCreatePlacementContext = useCallback(
		(context: ConnectionMenuContext): ConnectionCreatePlacementContext => {
			const placementContext = getPlacementContext(context)
			if (!canvas || context.source !== "handle") return placementContext
			if (context.origin.kind === "selection") {
				return resolveConnectionCreateContextWithOriginRect(
					placementContext,
					context.origin.boundingRect,
				)
			}

			return resolveConnectionCreateContextWithOriginRect(
				placementContext,
				canvas.geometryCacheManager.getElementBounds(context.origin.elementId),
			)
		},
		[canvas],
	)

	const resolveCreateCenterPoint = useCallback(
		(
			context: ConnectionMenuContext,
			size: { width: number; height: number },
		): { x: number; y: number } => {
			const placementContext = resolveCreatePlacementContext(context)
			return resolveConnectedElementCreateCenterPoint(
				placementContext,
				size,
				resolveCreateGap(context),
				{
					obstacleRects: canvas ? collectConnectionCreateObstacleRects(canvas) : [],
					siblingRects:
						canvas && context.origin.kind === "element"
							? collectConnectedElementSiblingRects(canvas, {
									originElementId: context.origin.elementId,
									originSide: context.origin.side,
								})
							: [],
				},
			)
		},
		[canvas, resolveCreateGap, resolveCreatePlacementContext],
	)

	const resolveCreateTopLeftPoint = useCallback(
		(
			context: ConnectionMenuContext,
			size: { width: number; height: number },
		): { x: number; y: number } => {
			const placementContext = resolveCreatePlacementContext(context)
			return resolveConnectedElementCreateTopLeftPoint(
				placementContext,
				size,
				resolveCreateGap(context),
				{
					obstacleRects: canvas ? collectConnectionCreateObstacleRects(canvas) : [],
					siblingRects:
						canvas && context.origin.kind === "element"
							? collectConnectedElementSiblingRects(canvas, {
									originElementId: context.origin.elementId,
									originSide: context.origin.side,
								})
							: [],
				},
			)
		},
		[canvas, resolveCreateGap, resolveCreatePlacementContext],
	)

	const createDefaultElement = useCallback(
		(kind: DefaultConnectionMenuCreateKind, context: ConnectionMenuContext): string | null => {
			if (!canvas) return null
			let createdElementId: string | null = null
			if (kind === "text") {
				const size = canvas.textEditingManager.getInitialTextElementSize()
				const point = resolveCreateTopLeftPoint(context, size)
				createdElementId = canvas.textEditingManager.startCreatingAt(point.x, point.y)
			} else if (kind === "image-generator") {
				const imageGeneratorTool = canvas.toolManager.getImageGeneratorTool()
				const size = imageGeneratorTool.getImageElementSizeForModelList(imageModelList)
				const point = resolveCreateCenterPoint(context, size)
				createdElementId = imageGeneratorTool.createImageAtCanvasPoint(
					point.x,
					point.y,
					imageModelList,
					{ select: false, ensureInViewport: false, completeTask: false },
				)
			} else if (kind === "video-generator") {
				const videoGeneratorTool = canvas.toolManager.getVideoGeneratorTool()
				const size = videoGeneratorTool.getVideoElementSizeForModelList(videoModelList)
				const point = resolveCreateCenterPoint(context, size)
				createdElementId = videoGeneratorTool.createVideoAtCanvasPoint(
					point.x,
					point.y,
					videoModelList,
					{ select: false, ensureInViewport: false, completeTask: false },
				)
			}

			return createdElementId
		},
		[
			canvas,
			imageModelList,
			resolveCreateCenterPoint,
			resolveCreateTopLeftPoint,
			videoModelList,
		],
	)

	const completeCreatedGenerator = useCallback(
		(elementId: string) => {
			if (!canvas) return
			canvas.toolManager.switchToSelection()
			canvas.selectionManager.select(elementId)
			requestAnimationFrame(() => {
				if (!canvas.elementManager.hasElement(elementId)) return
				if (canvas.viewportController.isElementInViewport([elementId])) return
				canvas.viewportController.moveElementToViewport([elementId], {
					animated: true,
					padding: { top: 50, right: 50, bottom: 50, left: 100 },
				})
			})
		},
		[canvas],
	)

	const rollbackDefaultElement = useCallback(
		(kind: DefaultConnectionMenuCreateKind, elementId: string, selectedIds: string[]) => {
			if (!canvas) return
			// 文本创建会立即进入编辑态，先取消选中以完成编辑器自身清理。
			if (kind === "text" && canvas.textEditingManager.getEditingElementId() === elementId) {
				canvas.selectionManager.deselect(elementId)
			}
			if (canvas.elementManager.hasElement(elementId)) {
				canvas.elementManager.delete(elementId)
			}
			if (selectedIds.length > 0) {
				canvas.selectionManager.selectMultiple(selectedIds)
			} else {
				canvas.selectionManager.deselectAll()
			}
		},
		[canvas],
	)

	const createElementAndConnect = useCallback(
		(kind: ConnectionMenuCreateKind, context: ConnectionMenuContext) => {
			if (!canvas || context.origin.kind !== "element") return

			if (kind === "storyboard") {
				const size = getStoryboardConnectionCreateSize()
				const point = resolveCreateTopLeftPoint(context, size)
				createStoryboardFromConnection(canvas, {
					origin: context.origin,
					x: point.x,
					y: point.y,
					imageModelList,
				})
				return
			}

			const previousSelectedIds = [...canvas.selectionManager.getSelectedIds()]
			const associationSnapshot = collectSelectionContentSnapshot(canvas, [
				context.origin.elementId,
			])
			createElementFromElementConnection({
				canvas,
				origin: context.origin,
				createElement: () => createDefaultElement(kind, context),
				rollbackElement: (elementId) => {
					rollbackDefaultElement(kind, elementId, previousSelectedIds)
				},
				afterConnect: ({ createdElementId }) => {
					registerConnectionMenuAssociationSeed({
						canvas,
						kind,
						originSide: context.origin.side,
						snapshot: associationSnapshot,
						targetElementId: createdElementId,
					})
					if (getConnectionAssociationTargetKind(kind)) {
						completeCreatedGenerator(createdElementId)
					}
				},
			})
		},
		[
			canvas,
			completeCreatedGenerator,
			createDefaultElement,
			imageModelList,
			resolveCreateTopLeftPoint,
			rollbackDefaultElement,
		],
	)

	const resolveSelectionSnapshot = useCallback(
		(context: ConnectionMenuContext) => {
			if (!canvas || context.origin.kind !== "selection") return null
			if (
				createSelectionRevision(canvas.selectionManager.getSelectedIds()) !==
				context.origin.selectionRevision
			) {
				return null
			}

			const snapshot = collectSelectionContentSnapshot(
				canvas,
				context.origin.elementIds,
				context.origin.boundingRect,
			)
			return snapshot.selectionRevision === context.origin.selectionRevision &&
				snapshot.allRootsCanConnect
				? snapshot
				: null
		},
		[canvas],
	)

	const resolveOriginSnapshot = useCallback(
		(context: ConnectionMenuContext) => {
			if (!canvas) return null
			if (context.origin.kind === "selection") return resolveSelectionSnapshot(context)

			const snapshot = collectSelectionContentSnapshot(canvas, [context.origin.elementId])
			return snapshot.rootElementIds.length === 1 && snapshot.allRootsCanConnect
				? snapshot
				: null
		},
		[canvas, resolveSelectionSnapshot],
	)

	const createDefaultFromSelection = useCallback(
		(kind: DefaultConnectionMenuCreateKind, context: ConnectionMenuContext) => {
			if (!canvas || context.origin.kind !== "selection") return
			const snapshot = resolveSelectionSnapshot(context)
			if (!snapshot) return

			createElementFromSelectionConnection({
				canvas,
				snapshot,
				originSide: context.origin.side,
				createElement: () => createDefaultElement(kind, context),
				rollbackElement: (elementId) => {
					rollbackDefaultElement(kind, elementId, snapshot.rootElementIds)
				},
				afterConnect: ({ createdElementId }) => {
					registerConnectionMenuAssociationSeed({
						canvas,
						kind,
						originSide: context.origin.side,
						snapshot,
						targetElementId: createdElementId,
					})
					if (getConnectionAssociationTargetKind(kind)) {
						completeCreatedGenerator(createdElementId)
					}
				},
			})
		},
		[
			canvas,
			completeCreatedGenerator,
			createDefaultElement,
			resolveSelectionSnapshot,
			rollbackDefaultElement,
		],
	)

	const createFromSelectionRecipe = useCallback(
		(recipeId: string, context: ConnectionMenuContext) => {
			if (!canvas || context.origin.kind !== "selection") return
			const snapshot = resolveSelectionSnapshot(context)
			if (!snapshot) return

			const recipe = getSelectionCreateRecipes(snapshot, context.origin.side).find(
				(item) => item.id === recipeId,
			)
			if (!recipe) return

			const point = resolveCreateTopLeftPoint(context, recipe.getSize())
			recipe.create({
				canvas,
				snapshot,
				imageModelList,
				originSide: context.origin.side,
				x: point.x,
				y: point.y,
			})
		},
		[canvas, imageModelList, resolveCreateTopLeftPoint, resolveSelectionSnapshot],
	)

	const closeConnectionMenu = useCallback(() => {
		const closingContext = connectionMenuContextRef.current
		if (canvas && closingContext) {
			canvas.eventEmitter.emit({
				type: "connection:menu:close",
				data: {
					origin: cloneConnectionOrigin(closingContext.origin),
					source: closingContext.source,
				},
			})
		}
		connectionMenuContextRef.current = null
		setConnectionMenuContext(null)
		setIsClickEnabled(false)
		setIsMenuOpen(false)
	}, [canvas])

	const executeConnectionMenuAction = useCallback(
		(recipeId: string, context: ConnectionMenuContext) => {
			if (!canvas) return
			const snapshot = resolveOriginSnapshot(context)
			if (!snapshot) return
			const recipe = getConnectionMenuActionRecipes({
				canvas,
				snapshot,
				originSide: context.origin.side,
				originKind: context.origin.kind,
				videoModelList,
			}).find((item) => item.id === recipeId)
			if (!recipe) return

			closeConnectionMenu()
			void recipe.execute({
				canvas,
				snapshot,
				originSide: context.origin.side,
				originKind: context.origin.kind,
				videoModelList,
			})
		},
		[canvas, closeConnectionMenu, resolveOriginSnapshot, videoModelList],
	)

	const menuItems = useMemo<MenuItem[]>(() => {
		if (!connectionMenuContext) return []
		const translate = (key: string, fallback: string) => {
			return t ? t(key, fallback) : fallback
		}
		const createDefaultMenuItems = (
			onCreate: (kind: DefaultConnectionMenuCreateKind) => void,
		): MenuItem[] => [
			{
				id: "connection-add-text",
				label: translate("tools.text", "文本"),
				icon: Type,
				onClick: () => onCreate("text"),
			},
			{
				id: "connection-add-image-generator",
				label: translate("tools.imageGenerator", "图像生成"),
				icon: ImageSparkles,
				onClick: () => onCreate("image-generator"),
			},
			{
				id: "connection-add-video-generator",
				label: translate("tools.videoGenerator", "视频生成"),
				icon: Film,
				onClick: () => onCreate("video-generator"),
			},
		]
		const createActionMenuItems = (
			snapshot: ReturnType<typeof collectSelectionContentSnapshot>,
		): MenuItem[] => {
			if (!canvas) return []
			return getConnectionMenuActionRecipes({
				canvas,
				snapshot,
				originSide: connectionMenuContext.origin.side,
				originKind: connectionMenuContext.origin.kind,
				videoModelList,
			}).map((recipe) => {
				const label = recipe.getLabel(snapshot)
				return {
					id: `connection-action-${recipe.id}`,
					label: translate(label.key, label.fallback),
					icon: Film,
					onClick: () => executeConnectionMenuAction(recipe.id, connectionMenuContext),
				}
			})
		}

		if (connectionMenuContext.origin.kind === "selection") {
			const snapshot = resolveSelectionSnapshot(connectionMenuContext)
			if (!snapshot) return []
			const items = createDefaultMenuItems((kind) =>
				createDefaultFromSelection(kind, connectionMenuContext),
			)
			items.push(...createActionMenuItems(snapshot))
			items.push(
				...getSelectionCreateRecipes(snapshot, connectionMenuContext.origin.side).map(
					(recipe) => ({
						id: `connection-add-${recipe.id}`,
						label: translate(recipe.label, recipe.fallbackLabel),
						icon: recipe.icon === "workflow" ? Workflow : Film,
						onClick: () => createFromSelectionRecipe(recipe.id, connectionMenuContext),
					}),
				),
			)
			return items
		}

		const items = createDefaultMenuItems((kind) =>
			createElementAndConnect(kind, connectionMenuContext),
		)
		const snapshot = resolveOriginSnapshot(connectionMenuContext)
		if (snapshot) items.push(...createActionMenuItems(snapshot))
		if (canCreateStoryboardFromConnection(canvas, connectionMenuContext.origin)) {
			items.push({
				id: "connection-add-storyboard",
				label: translate("storyboard.menuName", "制作分镜"),
				icon: Workflow,
				onClick: () => {
					createElementAndConnect("storyboard", connectionMenuContext)
				},
			})
		}
		if (
			canCreateStoryboardVideosFromConnection(
				canvas,
				connectionMenuContext.origin,
				videoModelList,
			)
		) {
			const imageCount =
				resolveOriginSnapshot(connectionMenuContext)?.imageSequence.length ?? 0
			const storyboardVideoLabel = getStoryboardVideoMenuLabel(imageCount)
			items.push({
				id: "connection-add-storyboard-video",
				label: translate(storyboardVideoLabel.key, storyboardVideoLabel.fallback).replace(
					"{{count}}",
					String(imageCount),
				),
				icon: Film,
				onClick: () => {
					if (!canvas || connectionMenuContext.origin.kind !== "element") return
					closeConnectionMenu()
					createStoryboardVideosFromConnection({
						canvas,
						origin: connectionMenuContext.origin,
						videoModelList,
					})
				},
			})
		}
		return items
	}, [
		canvas,
		closeConnectionMenu,
		connectionMenuContext,
		createDefaultFromSelection,
		createElementAndConnect,
		createFromSelectionRecipe,
		executeConnectionMenuAction,
		resolveOriginSnapshot,
		resolveSelectionSnapshot,
		t,
		videoModelList,
	])

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

			closeConnectionMenu()
		},
		[closeConnectionMenu],
	)

	const invalidateSelectionMenu = useCallback(() => {
		const context = connectionMenuContextRef.current
		if (!canvas || !context || context.origin.kind !== "selection") return
		if (
			createSelectionRevision(canvas.selectionManager.getSelectedIds()) !==
			context.origin.selectionRevision
		) {
			closeConnectionMenu()
		}
	}, [canvas, closeConnectionMenu])

	useCanvasEvent("element:select", invalidateSelectionMenu)
	useCanvasEvent("element:deselect", invalidateSelectionMenu)

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
					origin: cloneConnectionOrigin(data.origin),
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
