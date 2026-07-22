import Konva from "konva"
import type { CursorManager, CursorType } from "../cursor/CursorManager"

const EXTEND_CURSOR_ATTR = "extendResizeCursor"
const EXTEND_CURSOR_EVENT_NAMESPACE = "extendResizeCursor"

const EXTEND_RESIZE_CURSOR_BY_ANCHOR: Record<string, CursorType> = {
	"top-center": "n-resize",
	"middle-right": "e-resize",
	"bottom-center": "s-resize",
	"middle-left": "w-resize",
	"top-left": "nw-resize",
	"top-right": "ne-resize",
	"bottom-right": "se-resize",
	"bottom-left": "sw-resize",
}

function normalizeAnchorName(anchorName?: string | null): string {
	return anchorName?.split(/\s+/)[0] ?? ""
}

export function getExtendResizeCursor(anchorName?: string | null): CursorType | null {
	return EXTEND_RESIZE_CURSOR_BY_ANCHOR[normalizeAnchorName(anchorName)] ?? null
}

export function applyExtendTransformerActiveCursor(
	transformer: Konva.Transformer | undefined,
	cursorManager: CursorManager,
): void {
	const cursor = getExtendResizeCursor(transformer?.getActiveAnchor())
	if (cursor) cursorManager.setTemporary(cursor)
}

export function applyExtendAnchorCursor(anchor: Konva.Rect, cursorManager: CursorManager): void {
	const cursor = getExtendResizeCursor(anchor.name())
	if (!cursor) return
	if (anchor.getAttr(EXTEND_CURSOR_ATTR) === cursor) return

	anchor.off(`mouseenter.${EXTEND_CURSOR_EVENT_NAMESPACE}`)
	anchor.off(`mouseout.${EXTEND_CURSOR_EVENT_NAMESPACE}`)
	anchor.setAttr(EXTEND_CURSOR_ATTR, cursor)

	anchor.on(`mouseenter.${EXTEND_CURSOR_EVENT_NAMESPACE}`, () => {
		cursorManager.setTemporary(cursor)
	})

	anchor.on(`mouseout.${EXTEND_CURSOR_EVENT_NAMESPACE}`, () => {
		const parent = anchor.getParent()
		if (parent instanceof Konva.Transformer && parent.isTransforming()) {
			applyExtendTransformerActiveCursor(parent, cursorManager)
			return
		}
		cursorManager.restoreToolCursor()
	})
}
