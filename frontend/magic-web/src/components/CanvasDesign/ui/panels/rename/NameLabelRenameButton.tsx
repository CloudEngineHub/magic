import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react"
import { Pencil } from "lucide-react"
import MagicTooltip from "@/components/base/MagicTooltip"
import { useCanvas } from "../../../app/providers/CanvasProvider"
import { useCanvasDesignI18n } from "../../../app/providers/I18nProvider"
import { useCanvasEvents } from "../../../app/hooks/canvas/useCanvasEvent"
import { useFloatingComponent } from "../../../app/hooks/layout/useFloatingComponent"
import { useCanvasElement } from "../../../app/hooks/canvas"
import { useGenerationRuntime } from "../../../app/hooks/canvas/useGenerationRuntime"
import { useMagic } from "../../../app/providers/MagicProvider"
import {
	getActiveImageContent,
	isImageElementContent,
} from "../../../runtime/document/elementContent"
import { usePortalContainer } from "../../primitives/custom/PortalContainerContext"
import { GenerationStatus } from "../../../public/magic-types"
import type { ImageNameLabelLayout } from "../../../runtime/interaction/labels/NameLabelManager"

interface RenameButtonTarget extends ImageNameLabelLayout {
	elementId: string
}

function areTargetsEqual(
	previous: RenameButtonTarget | null,
	next: RenameButtonTarget | null,
): boolean {
	if (previous === next) return true
	if (!previous || !next) return false
	return (
		previous.elementId === next.elementId &&
		previous.x === next.x &&
		previous.y === next.y &&
		previous.width === next.width &&
		previous.rowWidth === next.rowWidth &&
		previous.height === next.height &&
		previous.text === next.text &&
		previous.fontSize === next.fontSize &&
		previous.fontFamily === next.fontFamily &&
		previous.color === next.color &&
		previous.canRename === next.canRename &&
		previous.showRenameButton === next.showRenameButton &&
		previous.renameButtonGap === next.renameButtonGap &&
		previous.hitPadding === next.hitPadding
	)
}

/** 复用名称管理器的布局与改名入口，DOM 按钮提供键盘、触摸与操作提示。 */
export default function NameLabelRenameButton() {
	const { canvas } = useCanvas()
	const { t } = useCanvasDesignI18n()
	const { methods } = useMagic()
	const portalContainer = usePortalContainer()
	const [target, setTarget] = useState<RenameButtonTarget | null>(null)
	const targetRef = useRef<RenameButtonTarget | null>(null)
	const heldTarget = useRef<string | null>(null)
	const labelRef = useRef<HTMLSpanElement | null>(null)
	const renameButtonRef = useRef<HTMLButtonElement | null>(null)
	const motionFrameRef = useRef<number | null>(null)
	const { containerRef } = useFloatingComponent({
		id: "name-label-rename-button",
		enableWheelForwarding: true,
	})
	/** Keep motion frames outside React and reuse the label layout already produced by Konva. */
	const applyLayout = useCallback(
		(layout: RenameButtonTarget | ImageNameLabelLayout | null) => {
			const root = containerRef.current
			const label = labelRef.current
			if (!root || !label) return
			// 显式控制显示，避免 hidden 属性被根节点或按钮的 flex 类覆盖。
			root.style.display = layout ? "flex" : "none"
			if (!layout) return
			const showButton = layout.showRenameButton
			const buttonWidth = showButton ? layout.renameButtonGap + layout.height : 0
			// 按管理器分配的宽度布局，禁止 Flex 为按钮再次压缩文字。
			// DOM 接管原透明命中内边距；铅笔与文字等高，悬浮不向图片扩张。
			root.style.padding = `${layout.hitPadding}px`
			root.style.width = `${(showButton ? layout.width + buttonWidth : layout.rowWidth) + layout.hitPadding * 2}px`
			root.style.height = `${layout.height + layout.hitPadding * 2}px`
			root.style.transform = `translate(${layout.x - layout.hitPadding}px, ${layout.y - layout.hitPadding}px)`
			label.style.width = `${layout.width}px`
			label.style.fontSize = `${layout.fontSize}px`
			label.style.lineHeight = `${layout.height}px`
			label.style.fontFamily = layout.fontFamily
			label.style.color = layout.color
			// Konva 的宽度度量不含页面字间距，DOM 必须使用相同的文字样式。
			label.style.letterSpacing = "0"
			if (renameButtonRef.current) {
				renameButtonRef.current.style.display = showButton ? "flex" : "none"
				renameButtonRef.current.style.width = `${layout.height}px`
				renameButtonRef.current.style.height = `${layout.height}px`
				renameButtonRef.current.style.marginLeft =
					showButton && layout.renameButtonGap > 0 ? `${layout.renameButtonGap}px` : ""
			}
		},
		[containerRef],
	)
	const getTargetElementId = useCallback(() => {
		if (!canvas) return null
		const selected = canvas.selectionManager.getSelectedIds()
		return (
			heldTarget.current ||
			canvas.hoverManager.getHoveredElementId() ||
			(selected.length === 1 ? selected[0] : null)
		)
	}, [canvas])
	const refreshElement = useCallback(
		(id: string | null) => {
			if (!canvas) return
			const layout = id ? canvas.nameLabelManager.getImageNameLabelLayout(id) : null
			const next = id && layout ? { elementId: id, ...layout } : null
			// A motion frame can hide the DOM without changing React state. Apply the cold-path
			// result even when its values equal the last render so the element is restored.
			applyLayout(next)
			setTarget((previous) => {
				return areTargetsEqual(previous, next) ? previous : next
			})
		},
		[applyLayout, canvas],
	)
	const refresh = useCallback(() => {
		refreshElement(getTargetElementId())
	}, [getTargetElementId, refreshElement])
	const setRenameButtonTarget = useCallback(
		(elementId: string | null) => {
			canvas?.nameLabelManager.setRenameButtonElementId(elementId)
			refresh()
		},
		[canvas, refresh],
	)

	const syncCachedMotionLayout = useCallback(() => {
		const elementId = targetRef.current?.elementId
		if (!canvas || !elementId) return
		applyLayout(canvas.nameLabelManager.getCachedImageNameLabelLayout(elementId))
	}, [applyLayout, canvas])

	const scheduleMotionLayoutSync = useCallback(() => {
		if (motionFrameRef.current !== null) return
		const schedule =
			typeof requestAnimationFrame === "function"
				? requestAnimationFrame
				: (callback: FrameRequestCallback) =>
						globalThis.setTimeout(
							() => callback(performance.now()),
							16,
						) as unknown as number
		motionFrameRef.current = schedule(() => {
			motionFrameRef.current = null
			syncCachedMotionLayout()
		})
	}, [syncCachedMotionLayout])
	const cancelMotionLayoutSync = useCallback(() => {
		if (motionFrameRef.current === null) return
		const cancel =
			typeof cancelAnimationFrame === "function"
				? cancelAnimationFrame
				: (frameId: number) => globalThis.clearTimeout(frameId)
		cancel(motionFrameRef.current)
		motionFrameRef.current = null
	}, [])

	useCanvasEvents(
		[
			"element:hover",
			"element:select",
			"element:deselect",
			"tool:change",
			"permission:changed",
			"crop:enter",
			"crop:exit",
			"extend:enter",
			"extend:exit",
			"eraser:enter",
			"eraser:exit",
			"text:editing-state-change",
		] as const,
		refresh,
		[refresh],
	)
	useCanvasEvents(
		["element:updated", "element:deleted", "element:rerendered"] as const,
		(updatedEvent, deletedEvent, rerenderedEvent) => {
			const changedElementId =
				updatedEvent?.data.elementId ||
				deletedEvent?.data.elementId ||
				rerenderedEvent?.data.elementId
			if (!changedElementId) return
			const renderedElementId = targetRef.current?.elementId
			if (changedElementId === renderedElementId) {
				refreshElement(renderedElementId)
				return
			}
			// Hover/selection events normally establish the target. Resolve it here only
			// while no DOM label exists, avoiding selection reads for unrelated updates.
			if (!renderedElementId && changedElementId === getTargetElementId()) refresh()
		},
		[getTargetElementId, refresh, refreshElement],
	)
	useCanvasEvents(
		[
			"canvas:resize",
			"viewport:scale",
			"viewport:pan",
			"elements:transform:dragmove",
			"elements:transform:anchorDragmove",
		] as const,
		(resizeEvent, scaleEvent, panEvent, dragMoveEvent, anchorDragMoveEvent) => {
			void resizeEvent
			void scaleEvent
			void panEvent
			const elementId = targetRef.current?.elementId
			if (!elementId) return
			const transformEvent = dragMoveEvent || anchorDragMoveEvent
			if (transformEvent && !transformEvent.data.elementIds.includes(elementId)) return
			scheduleMotionLayoutSync()
		},
		[scheduleMotionLayoutSync],
	)
	useCanvasEvents(
		[
			"viewport:changed",
			"elements:transform:dragend",
			"elements:transform:anchorDragend",
		] as const,
		(viewportChangedEvent, dragEndEvent, anchorDragEndEvent) => {
			if (viewportChangedEvent && viewportChangedEvent.data.phase !== "end") return
			const transformEndEvent = dragEndEvent || anchorDragEndEvent
			const activeElementId = targetRef.current?.elementId
			if (
				transformEndEvent &&
				transformEndEvent.data.elementIds.length > 0 &&
				(!activeElementId || !transformEndEvent.data.elementIds.includes(activeElementId))
			)
				return

			// The label manager reconciles its final geometry on the end event. Cancel a
			// queued motion read so an older cached layout cannot overwrite that result.
			cancelMotionLayoutSync()
			refreshElement(transformEndEvent ? (activeElementId ?? null) : getTargetElementId())
		},
		[cancelMotionLayoutSync, getTargetElementId, refreshElement],
	)
	useLayoutEffect(refresh, [refresh])
	useLayoutEffect(() => {
		targetRef.current = target
		applyLayout(target)
	}, [applyLayout, target])
	useEffect(() => cancelMotionLayoutSync, [cancelMotionLayoutSync])
	useLayoutEffect(() => {
		canvas?.nameLabelManager.setDOMLabelElementId(target?.elementId ?? null)
		return () => {
			canvas?.nameLabelManager.setRenameButtonElementId(null)
			canvas?.nameLabelManager.setDOMLabelElementId(null)
		}
	}, [canvas, target?.elementId])
	const element = useCanvasElement(target?.elementId ?? null)
	const content =
		element && isImageElementContent(element) ? getActiveImageContent(element) : undefined
	const runtime = useGenerationRuntime(target?.elementId ?? null, content?.contentId)
	const expectedName = runtime?.generateImageRequest?.name || content?.generateImageRequest?.name
	const processing =
		Boolean(runtime) ||
		content?.status === GenerationStatus.Pending ||
		content?.status === GenerationStatus.Processing
	const fileName =
		!processing && content?.src
			? methods?.imageRename?.resolveImageRenameFile(content.src)?.fileName ||
				content.src.split("/").pop()?.split("?")[0]
			: undefined
	if (!target) return null
	const tooltip = fileName || expectedName
	return (
		// 标题与铅笔沿用画布内容层；工具面板和菜单应遮住相交区域。
		<div
			ref={containerRef}
			data-canvas-ui-component
			className="absolute left-0 top-0 z-[1] flex cursor-text items-center"
			onPointerEnter={(event) => {
				heldTarget.current = target.elementId
				if (event.pointerType === "mouse") setRenameButtonTarget(target.elementId)
			}}
			onPointerLeave={(event) => {
				if (event.currentTarget.querySelector(":focus-visible")) return
				setRenameButtonTarget(null)
				if (event.buttons) return
				heldTarget.current = null
				refresh()
			}}
			onFocus={(event) => {
				heldTarget.current = target.elementId
				if (event.target.matches(":focus-visible")) setRenameButtonTarget(target.elementId)
			}}
			onBlur={(event) => {
				if (
					event.relatedTarget instanceof Node &&
					event.currentTarget.contains(event.relatedTarget)
				)
					return
				if (event.currentTarget.matches(":hover")) return
				heldTarget.current = null
				setRenameButtonTarget(null)
			}}
			onPointerDown={(event) => {
				event.stopPropagation()
				if (event.button === 0)
					canvas?.nameLabelManager.selectElementFromLabel(target.elementId, false)
			}}
			onContextMenu={(event) => event.stopPropagation()}
		>
			<MagicTooltip
				placement="topLeft"
				getPopupContainer={() => portalContainer}
				title={
					tooltip ? (
						<>
							<div className="text-xs opacity-70">
								{fileName
									? t("rename.fileNameLabel", "文件名")
									: t("rename.expectedFile", "预计文件名")}
							</div>
							<div className="mt-1 break-all">{tooltip}</div>
						</>
					) : undefined
				}
			>
				<span
					ref={labelRef}
					data-canvas-name-label
					tabIndex={0}
					className="block min-w-0 shrink-0 cursor-text select-text truncate focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
					onKeyDown={(event) => event.stopPropagation()}
				>
					{target.text}
				</span>
			</MagicTooltip>
			{target.canRename && (
				<MagicTooltip title={t("contextMenu.rename", "重命名")}>
					<button
						ref={renameButtonRef}
						type="button"
						style={{ display: target.showRenameButton ? "flex" : "none" }}
						aria-label={t("contextMenu.rename", "重命名")}
						className="flex shrink-0 cursor-pointer items-center justify-center text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
						onPointerDown={(event) => event.stopPropagation()}
						onClick={() => canvas?.elementRenameManager.startRename(target.elementId)}
					>
						<Pencil size={target.height} />
					</button>
				</MagicTooltip>
			)}
		</div>
	)
}
