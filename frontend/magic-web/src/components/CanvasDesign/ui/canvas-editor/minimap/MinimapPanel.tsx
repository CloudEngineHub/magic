import { useCallback, useEffect, useRef } from "react"
import { useCanvas } from "../../../app/providers/CanvasProvider"
import { useCanvasDesignI18n } from "../../../app/providers/I18nProvider"
import type { CanvasEventMap } from "../../../runtime/core/EventEmitter"
import type { Rect } from "../../../runtime/shared/ids"
import { getViewportCanvasRect } from "../../../runtime/shared/placement/elementUtils"
import { MINIMAP_PANEL_SIZE, MINIMAP_RENDER_CONFIG } from "./constants"
import { drawMinimap, type MinimapTheme } from "./minimapRenderer"
import {
	collectMinimapScene,
	getMinimapSceneSubtreeIds,
	getMinimapSceneStationaryBounds,
	refreshMinimapSceneItems,
	translateMinimapSceneItems,
	type MinimapScene,
} from "./minimapScene"

interface MinimapPanelProps {
	id: string
}

const FULL_SCENE_CHANGE_EVENTS = [
	"element:batchupdated",
	"element:batchdeleted",
	"document:loaded",
	"document:restored",
	"canvas:clear",
] as const satisfies readonly (keyof CanvasEventMap)[]

interface MinimapDragState {
	elementIds: string[]
	lastBounds: Rect | null
	pendingBounds: Rect | null
	stationaryContentBounds: Rect | null | undefined
}

interface MinimapAnchorState {
	elementIds: string[]
	stationaryContentBounds: Rect | null | undefined
}

type MinimapSpecialEditingMode = "crop" | "extend" | "eraser"

const VIEWPORT_CHANGE_EVENTS = [
	"viewport:scale",
	"viewport:pan",
	"canvas:resize",
] as const satisfies readonly (keyof CanvasEventMap)[]

function resolveComputedColor(element: HTMLElement, color: string, fallback: string): string {
	const probe = document.createElement("span")
	probe.style.position = "absolute"
	probe.style.visibility = "hidden"
	probe.style.pointerEvents = "none"
	probe.style.color = fallback
	probe.style.color = color
	element.appendChild(probe)
	const resolvedColor = getComputedStyle(probe).color || fallback
	probe.remove()
	return resolvedColor
}

function readTheme(element: HTMLElement): MinimapTheme {
	const style = getComputedStyle(element)
	const getColor = (name: string, fallback: string) =>
		style.getPropertyValue(name).trim() || fallback
	const mutedForeground = getColor("--base-muted-foreground", "#737373")
	const popover =
		style.backgroundColor && style.backgroundColor !== "rgba(0, 0, 0, 0)"
			? style.backgroundColor
			: getColor("--base-popover", "#ffffff")
	const mixedElementColor = `color-mix(in srgb, ${mutedForeground} ${MINIMAP_RENDER_CONFIG.elementColorWeight}%, ${popover})`

	return {
		elementFill: resolveComputedColor(element, mixedElementColor, "#a3a3a3"),
		containerFill: getColor("--base-foreground", "#0a0a0a"),
		selectedFill: getColor("--tailwind-colors-blue-500", "#3b82f6"),
		viewportStroke: mutedForeground,
	}
}

function getPanelSize(element: HTMLElement): { width: number; height: number } {
	const rect = element.getBoundingClientRect()
	return {
		width: rect.width || MINIMAP_PANEL_SIZE.width,
		height: rect.height || MINIMAP_PANEL_SIZE.height,
	}
}

/** 使用轻量 Canvas 2D 绘制元素、Frame/Group 和当前视口，不复制主 Konva 场景。 */
export default function MinimapPanel({ id }: MinimapPanelProps) {
	const { t } = useCanvasDesignI18n()
	const { canvas: canvasInstance } = useCanvas()
	const panelRef = useRef<HTMLDivElement | null>(null)
	const drawingCanvasRef = useRef<HTMLCanvasElement | null>(null)
	const sceneRef = useRef<MinimapScene | null>(null)
	const shouldRefreshSceneRef = useRef(true)
	const pendingSceneElementIdsRef = useRef(new Set<string>())
	const dragStateRef = useRef<MinimapDragState | null>(null)
	const anchorStateRef = useRef<MinimapAnchorState | null>(null)
	const animationFrameRef = useRef<number | null>(null)
	const panelSizeRef = useRef({ ...MINIMAP_PANEL_SIZE })
	const themeRef = useRef<MinimapTheme | null>(null)
	const selectedRootElementIdsRef = useRef(new Set<string>())
	const specialEditingElementIdsRef = useRef(new Map<MinimapSpecialEditingMode, string>())
	const selectedSceneElementIdsRef = useRef(new Set<string>())
	const shouldRefreshSelectionRef = useRef(true)

	const draw = useCallback(() => {
		animationFrameRef.current = null
		const panel = panelRef.current
		const drawingCanvas = drawingCanvasRef.current
		if (!panel || !drawingCanvas) return

		let context: CanvasRenderingContext2D | null = null
		try {
			context = drawingCanvas.getContext("2d")
		} catch {
			return
		}
		if (!context) return

		const panelSize = panelSizeRef.current
		const devicePixelRatio = Math.min(
			window.devicePixelRatio || 1,
			MINIMAP_RENDER_CONFIG.maximumDevicePixelRatio,
		)
		const backingWidth = Math.max(1, Math.round(panelSize.width * devicePixelRatio))
		const backingHeight = Math.max(1, Math.round(panelSize.height * devicePixelRatio))
		if (drawingCanvas.width !== backingWidth || drawingCanvas.height !== backingHeight) {
			drawingCanvas.width = backingWidth
			drawingCanvas.height = backingHeight
		}
		context.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0)

		if (!canvasInstance) {
			context.clearRect(0, 0, panelSize.width, panelSize.height)
			return
		}

		if (shouldRefreshSceneRef.current || !sceneRef.current) {
			sceneRef.current = collectMinimapScene(canvasInstance)
			shouldRefreshSceneRef.current = false
			pendingSceneElementIdsRef.current.clear()
		} else {
			const dragState = dragStateRef.current
			if (dragState?.pendingBounds) {
				if (dragState.lastBounds) {
					translateMinimapSceneItems(
						sceneRef.current,
						dragState.elementIds,
						dragState.pendingBounds.x - dragState.lastBounds.x,
						dragState.pendingBounds.y - dragState.lastBounds.y,
						dragState.stationaryContentBounds,
					)
				}
				dragState.lastBounds = dragState.pendingBounds
				dragState.pendingBounds = null
			}

			if (pendingSceneElementIdsRef.current.size > 0) {
				const anchorState = anchorStateRef.current
				const stationaryContentBounds =
					anchorState &&
					anchorState.elementIds.every((elementId) =>
						pendingSceneElementIdsRef.current.has(elementId),
					)
						? anchorState.stationaryContentBounds
						: undefined
				refreshMinimapSceneItems(
					canvasInstance,
					sceneRef.current,
					Array.from(pendingSceneElementIdsRef.current),
					stationaryContentBounds,
				)
				pendingSceneElementIdsRef.current.clear()
			}
		}

		const scene = sceneRef.current
		if (shouldRefreshSelectionRef.current) {
			const selectedRootElementIds = new Set([
				...selectedRootElementIdsRef.current,
				...specialEditingElementIdsRef.current.values(),
			])
			selectedSceneElementIdsRef.current = new Set(
				getMinimapSceneSubtreeIds(scene, Array.from(selectedRootElementIds)),
			)
			shouldRefreshSelectionRef.current = false
		}

		drawMinimap({
			context,
			panelSize,
			items: scene.items,
			selectedElementIds: selectedSceneElementIdsRef.current,
			contentBounds: scene.contentBounds,
			viewportRect: getViewportCanvasRect(canvasInstance),
			theme: themeRef.current ?? readTheme(panel),
		})
	}, [canvasInstance])

	const scheduleDraw = useCallback(() => {
		if (animationFrameRef.current !== null) return
		animationFrameRef.current = window.requestAnimationFrame(draw)
	}, [draw])

	const scheduleFullSceneDraw = useCallback(() => {
		shouldRefreshSceneRef.current = true
		shouldRefreshSelectionRef.current = true
		pendingSceneElementIdsRef.current.clear()
		scheduleDraw()
	}, [scheduleDraw])

	const scheduleSceneElementDraw = useCallback(
		(elementIds: readonly string[]) => {
			elementIds.forEach((elementId) => pendingSceneElementIdsRef.current.add(elementId))
			scheduleDraw()
		},
		[scheduleDraw],
	)

	useEffect(() => {
		const panel = panelRef.current
		if (!panel) {
			scheduleFullSceneDraw()
			return
		}
		if (animationFrameRef.current !== null) {
			window.cancelAnimationFrame(animationFrameRef.current)
			animationFrameRef.current = null
		}

		panelSizeRef.current = getPanelSize(panel)
		themeRef.current = readTheme(panel)
		scheduleFullSceneDraw()

		const resizeObserver =
			typeof ResizeObserver === "undefined"
				? null
				: new ResizeObserver(() => {
						panelSizeRef.current = getPanelSize(panel)
						scheduleDraw()
					})
		resizeObserver?.observe(panel)

		const themeObserver =
			typeof MutationObserver === "undefined"
				? null
				: new MutationObserver(() => {
						themeRef.current = readTheme(panel)
						scheduleDraw()
					})
		let ancestor: HTMLElement | null = panel
		while (ancestor && themeObserver) {
			themeObserver.observe(ancestor, {
				attributes: true,
				attributeFilter: ["class", "style"],
			})
			ancestor = ancestor.parentElement
		}

		return () => {
			resizeObserver?.disconnect()
			themeObserver?.disconnect()
		}
	}, [scheduleDraw, scheduleFullSceneDraw])

	useEffect(() => {
		if (!canvasInstance) return
		selectedRootElementIdsRef.current = new Set(
			canvasInstance.selectionManager.getSelectedIds(),
		)
		specialEditingElementIdsRef.current.clear()
		const initialSpecialEditingElements = [
			["crop", canvasInstance.cropManager.getCroppingElementId()],
			["extend", canvasInstance.extendManager.getExtendingElementId()],
			["eraser", canvasInstance.eraserManager.getErasingElementId()],
		] as const
		initialSpecialEditingElements.forEach(([mode, elementId]) => {
			if (elementId) specialEditingElementIdsRef.current.set(mode, elementId)
		})
		shouldRefreshSelectionRef.current = true
		const scheduleSelectionDraw = () => {
			selectedRootElementIdsRef.current = new Set(
				canvasInstance.selectionManager.getSelectedIds(),
			)
			shouldRefreshSelectionRef.current = true
			scheduleDraw()
		}
		const scheduleSpecialEditingEnter = (
			mode: MinimapSpecialEditingMode,
			elementId: string,
		) => {
			specialEditingElementIdsRef.current.set(mode, elementId)
			shouldRefreshSelectionRef.current = true
			scheduleDraw()
		}
		const scheduleSpecialEditingExit = (mode: MinimapSpecialEditingMode) => {
			specialEditingElementIdsRef.current.delete(mode)
			shouldRefreshSelectionRef.current = true
			scheduleDraw()
		}

		const unsubscribes = [
			...FULL_SCENE_CHANGE_EVENTS.map((eventName) =>
				canvasInstance.eventEmitter.on(eventName, scheduleFullSceneDraw),
			),
			...VIEWPORT_CHANGE_EVENTS.map((eventName) =>
				canvasInstance.eventEmitter.on(eventName, () => scheduleDraw()),
			),
			canvasInstance.eventEmitter.on("element:select", scheduleSelectionDraw),
			canvasInstance.eventEmitter.on("element:deselect", scheduleSelectionDraw),
			canvasInstance.eventEmitter.on("crop:enter", ({ data }) => {
				scheduleSpecialEditingEnter("crop", data.elementId)
			}),
			canvasInstance.eventEmitter.on("crop:exit", () => {
				scheduleSpecialEditingExit("crop")
			}),
			canvasInstance.eventEmitter.on("extend:enter", ({ data }) => {
				scheduleSpecialEditingEnter("extend", data.elementId)
			}),
			canvasInstance.eventEmitter.on("extend:exit", () => {
				scheduleSpecialEditingExit("extend")
			}),
			canvasInstance.eventEmitter.on("eraser:enter", ({ data }) => {
				scheduleSpecialEditingEnter("eraser", data.elementId)
			}),
			canvasInstance.eventEmitter.on("eraser:exit", () => {
				scheduleSpecialEditingExit("eraser")
			}),
			canvasInstance.eventEmitter.on("element:rerendered", ({ data }) => {
				scheduleSceneElementDraw([data.elementId])
			}),
			canvasInstance.eventEmitter.on("element:change", ({ data }) => {
				if (data?.phase === "transient" && data.elementIds?.length) {
					scheduleSceneElementDraw(data.elementIds)
					return
				}
				scheduleFullSceneDraw()
			}),
			canvasInstance.eventEmitter.on("elements:transform:dragstart", ({ data }) => {
				dragStateRef.current = {
					elementIds: [...data.elementIds],
					lastBounds: canvasInstance.geometryCacheManager.getElementsBounds(
						data.elementIds,
					),
					pendingBounds: null,
					stationaryContentBounds: sceneRef.current
						? getMinimapSceneStationaryBounds(sceneRef.current, data.elementIds)
						: undefined,
				}
			}),
			canvasInstance.eventEmitter.on("elements:transform:dragmove", ({ data }) => {
				let dragState = dragStateRef.current
				const hasSameElements =
					dragState?.elementIds.length === data.elementIds.length &&
					dragState.elementIds.every(
						(elementId, index) => elementId === data.elementIds[index],
					)
				if (!dragState || !hasSameElements) {
					dragState = {
						elementIds: [...data.elementIds],
						lastBounds: canvasInstance.geometryCacheManager.getElementsBounds(
							data.elementIds,
						),
						pendingBounds: null,
						stationaryContentBounds: sceneRef.current
							? getMinimapSceneStationaryBounds(sceneRef.current, data.elementIds)
							: undefined,
					}
					dragStateRef.current = dragState
				}
				dragState.pendingBounds = data.boundingRect ?? null
				scheduleDraw()
			}),
			canvasInstance.eventEmitter.on("elements:transform:dragend", () => {
				dragStateRef.current = null
				scheduleFullSceneDraw()
			}),
			canvasInstance.eventEmitter.on("element:dragend", () => {
				dragStateRef.current = null
				scheduleFullSceneDraw()
			}),
			canvasInstance.eventEmitter.on("elements:transform:anchorDragStart", ({ data }) => {
				anchorStateRef.current = {
					elementIds: [...data.elementIds],
					stationaryContentBounds: sceneRef.current
						? getMinimapSceneStationaryBounds(sceneRef.current, data.elementIds)
						: undefined,
				}
			}),
			canvasInstance.eventEmitter.on("elements:transform:anchorDragmove", ({ data }) => {
				const anchorState = anchorStateRef.current
				const hasSameElements =
					anchorState?.elementIds.length === data.elementIds.length &&
					anchorState.elementIds.every(
						(elementId, index) => elementId === data.elementIds[index],
					)
				if (!anchorState || !hasSameElements) {
					anchorStateRef.current = {
						elementIds: [...data.elementIds],
						stationaryContentBounds: sceneRef.current
							? getMinimapSceneStationaryBounds(sceneRef.current, data.elementIds)
							: undefined,
					}
				}
				scheduleSceneElementDraw(data.elementIds)
			}),
			canvasInstance.eventEmitter.on("elements:transform:anchorDragend", () => {
				anchorStateRef.current = null
				scheduleFullSceneDraw()
			}),
		]
		return () => unsubscribes.forEach((unsubscribe) => unsubscribe())
	}, [canvasInstance, scheduleDraw, scheduleFullSceneDraw, scheduleSceneElementDraw])

	useEffect(() => {
		return () => {
			if (animationFrameRef.current !== null) {
				window.cancelAnimationFrame(animationFrameRef.current)
				animationFrameRef.current = null
			}
		}
	}, [])

	return (
		<div
			ref={panelRef}
			id={id}
			className="relative max-w-full overflow-hidden rounded-2xl border border-border bg-popover shadow-lg"
			style={{
				width: MINIMAP_PANEL_SIZE.width,
				aspectRatio: `${MINIMAP_PANEL_SIZE.width} / ${MINIMAP_PANEL_SIZE.height}`,
			}}
			role="region"
			aria-label={t("zoom.minimap", "小地图")}
		>
			<canvas ref={drawingCanvasRef} className="block size-full" aria-hidden="true" />
		</div>
	)
}
