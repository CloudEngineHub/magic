import { useCallback, useLayoutEffect, useRef, useState } from "react"
import { Pencil } from "lucide-react"
import MagicTooltip from "@/components/base/MagicTooltip"
import { useCanvas } from "../../../app/providers/CanvasProvider"
import { useCanvasDesignI18n } from "../../../app/providers/I18nProvider"
import { useCanvasEvents } from "../../../app/hooks/canvas/useCanvasEvent"
import { useFloatingComponent } from "../../../app/hooks/layout/useFloatingComponent"

interface RenameButtonTarget {
	elementId: string
	x: number
	y: number
}

/** 复用名称管理器的布局与改名入口，DOM 按钮提供键盘、触摸与操作提示。 */
export default function NameLabelRenameButton() {
	const { canvas } = useCanvas()
	const { t } = useCanvasDesignI18n()
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
		const layout = id ? canvas.nameLabelManager.getRenameButtonLayout(id) : null
		setTarget((previous) => {
			if (!id || !layout) return null
			return previous?.elementId === id && previous.x === layout.x && previous.y === layout.y
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
	if (!target) return null
	return (
		<div
			ref={containerRef}
			data-canvas-ui-component
			className="absolute left-0 top-0 z-20"
			style={{ transform: `translate(${target.x}px, ${target.y}px)` }}
		>
			<MagicTooltip title={t("contextMenu.rename", "重命名")}>
				<button
					type="button"
					aria-label={t("contextMenu.rename", "重命名")}
					className="flex size-6 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
		</div>
	)
}
