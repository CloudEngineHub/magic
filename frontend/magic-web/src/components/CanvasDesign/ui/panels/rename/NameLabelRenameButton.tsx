import { useCallback, useLayoutEffect, useRef, useState } from "react"
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

interface RenameButtonTarget {
	elementId: string
	x: number
	y: number
	width: number
	height: number
	text: string
	fontSize: number
	fontFamily: string
	color: string
}

/** 复用名称管理器的布局与改名入口，DOM 按钮提供键盘、触摸与操作提示。 */
export default function NameLabelRenameButton() {
	const { canvas } = useCanvas()
	const { t } = useCanvasDesignI18n()
	const { methods } = useMagic()
	const portalContainer = usePortalContainer()
	const [target, setTarget] = useState<RenameButtonTarget | null>(null)
	const heldTarget = useRef<string | null>(null)
	const { containerRef } = useFloatingComponent({
		id: "name-label-rename-button",
		enableWheelForwarding: true,
	})
	const refresh = useCallback(() => {
		if (!canvas) return
		const selected = canvas.selectionManager.getSelectedIds()
		const id =
			heldTarget.current ||
			canvas.hoverManager.getHoveredElementId() ||
			(selected.length === 1 ? selected[0] : null)
		const layout = id ? canvas.nameLabelManager.getImageNameLabelLayout(id) : null
		setTarget((previous) => {
			if (!id || !layout) return null
			return previous?.elementId === id &&
				previous.x === layout.x &&
				previous.y === layout.y &&
				previous.width === layout.width &&
				previous.text === layout.text
				? previous
				: { elementId: id, ...layout }
		})
	}, [canvas])
	useCanvasEvents(
		[
			"element:hover",
			"element:select",
			"element:deselect",
			"element:updated",
			"element:deleted",
			"element:rerendered",
			"viewport:scale",
			"viewport:pan",
			"elements:transform:dragmove",
			"elements:transform:anchorDragmove",
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
	useLayoutEffect(refresh, [refresh])
	useLayoutEffect(() => {
		canvas?.nameLabelManager.setDOMLabelElementId(target?.elementId ?? null)
		return () => canvas?.nameLabelManager.setDOMLabelElementId(null)
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
	const canRename = Boolean(canvas?.nameLabelManager.getRenameButtonLayout(target.elementId))
	const tooltip = fileName || expectedName
	return (
		<div
			ref={containerRef}
			data-canvas-ui-component
			className="absolute left-0 top-0 z-20 flex h-6 items-center"
			style={{
				transform: `translate(${target.x}px, ${target.y - (24 - target.height) / 2}px)`,
			}}
			onPointerEnter={() => {
				heldTarget.current = target.elementId
			}}
			onPointerLeave={(event) => {
				if (event.buttons || event.currentTarget.contains(document.activeElement)) return
				heldTarget.current = null
				refresh()
			}}
			onFocus={() => {
				heldTarget.current = target.elementId
			}}
			onBlur={(event) => {
				if (
					event.relatedTarget instanceof Node &&
					event.currentTarget.contains(event.relatedTarget)
				)
					return
				heldTarget.current = null
				refresh()
			}}
			onPointerDown={(event) => event.stopPropagation()}
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
					data-canvas-name-label
					tabIndex={0}
					className="block min-w-0 cursor-text select-text truncate focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
					style={{
						width: target.width,
						fontSize: target.fontSize,
						fontFamily: target.fontFamily,
						color: target.color,
					}}
					onKeyDown={(event) => event.stopPropagation()}
				>
					{target.text}
				</span>
			</MagicTooltip>
			{canRename && (
				<MagicTooltip title={t("contextMenu.rename", "重命名")}>
					<button
						type="button"
						aria-label={t("contextMenu.rename", "重命名")}
						className="flex size-6 cursor-pointer items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
						onPointerEnter={() => {
							heldTarget.current = target.elementId
						}}
						onPointerLeave={(event) => {
							if (event.currentTarget === document.activeElement) return
							heldTarget.current = null
							refresh()
						}}
						onFocus={() => {
							heldTarget.current = target.elementId
						}}
						onBlur={() => {
							heldTarget.current = null
							refresh()
						}}
						onPointerDown={(event) => event.stopPropagation()}
						onClick={() => canvas?.elementRenameManager.startRename(target.elementId)}
					>
						<Pencil size={16} />
					</button>
				</MagicTooltip>
			)}
		</div>
	)
}
