import { Plugin, PluginKey, TextSelection } from "@/infrastructure/editors/tiptap/pm-state"
import type { Node as ProseMirrorNode } from "prosemirror-model"
import type { EditorView } from "prosemirror-view"

export const MAGIC_NODE_DRAG_MIME = "application/x-magic-editor-node+json"
const MAGIC_NODE_DRAG_VERSION = 1
const nodeDragPluginKey = new PluginKey("magicNodeDrag")
const DROP_CURSOR_CLASS = "magic-node-dropcursor"
const POINTER_DRAG_THRESHOLD = 4

interface MagicNodeDragPayload {
	version: number
	node: {
		type: string
		attrs: Record<string, unknown>
	}
	sourceEditorId?: string
	sourcePosition?: number
	sourceDragId?: string
	text: string
}

interface MagicNodeDragSource {
	view: EditorView
	element: HTMLElement
}

interface MagicNodePointerDragSession {
	payload: MagicNodeDragPayload
	sourceView?: EditorView
	sourceElement: HTMLElement
	pointerId: number
	startX: number
	startY: number
	active: boolean
}

interface MagicNodeDropTarget {
	view: EditorView
	position: number
}

export function setMagicNodeDragData(
	event: DragEvent,
	type: string,
	attrs: Record<string, unknown>,
	source?: { editorId: string; position: number; dragId?: string },
	previewElement?: HTMLElement | null,
) {
	if (!event.dataTransfer) return false

	const payload = createDragPayload(type, attrs, source?.editorId, source?.position, source?.dragId)

	event.dataTransfer.effectAllowed = source ? "move" : "copy"
	event.dataTransfer.setData(MAGIC_NODE_DRAG_MIME, JSON.stringify(payload))
	if (typeof document !== "undefined") {
		const transparentImage = document.createElement("div")
		transparentImage.setAttribute("aria-hidden", "true")
		transparentImage.style.width = "2px"
		transparentImage.style.height = "2px"
		transparentImage.style.position = "fixed"
		transparentImage.style.left = "0"
		transparentImage.style.top = "0"
		transparentImage.style.background = "transparent"
		transparentImage.style.border = "0"
		transparentImage.style.opacity = "0"
		transparentImage.style.overflow = "hidden"
		transparentImage.style.pointerEvents = "none"
		document.body.appendChild(transparentImage)
		activeNativeDragImage = transparentImage
		if (typeof event.dataTransfer.setDragImage === "function") {
			event.dataTransfer.setDragImage(transparentImage, 0, 0)
		}
		createDragPreview(payload.text, previewElement)
		hideNativeDragCursor()
		updateDragPreviewPosition(event)
	}
	return true
}

const editorViews = new Map<string, EditorView>()
const activeDragSources = new Map<string, MagicNodeDragSource>()
let activeDragPreview: HTMLElement | null = null
let activeNativeDragImage: HTMLElement | null = null
let dragPreviewListenersInstalled = false
let nativeDragCursorStyle: HTMLStyleElement | null = null
let pointerDragListenersInstalled = false
let removePointerDragListeners: (() => void) | null = null
let pointerDragSession: MagicNodePointerDragSession | null = null
let suppressClickTarget: HTMLElement | null = null

function createEditorId() {
	if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
		return crypto.randomUUID()
	}
	return `magic-editor-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

function getDragText(type: string, attrs: Record<string, unknown>) {
	if (type === "mention") {
		const data = (attrs.data ?? {}) as Record<string, unknown>
		const name = data.name ?? data.file_name ?? data.title ?? data.label ?? ""
		return `@${String(name)}`
	}

	if (type === "inspector-detail") {
		return attrs.selector ? `selector: ${String(attrs.selector)}` : "[Element Inspector Detail]"
	}

	return ""
}

function clearDragPreview() {
	activeDragPreview?.remove()
	activeDragPreview = null
	activeNativeDragImage?.remove()
	activeNativeDragImage = null
	if (typeof document !== "undefined") {
		document.documentElement.classList.remove("magic-node-dragging")
	}
}

function clearDragSources() {
	activeDragSources.clear()
}

function clearPointerDragSession() {
	if (pointerDragSession?.payload.sourceDragId) {
		activeDragSources.delete(pointerDragSession.payload.sourceDragId)
	}
	clearAllDropCursors()
	clearDragPreview()
	if (typeof document !== "undefined") {
		document.documentElement.classList.remove("magic-node-pointer-pending")
	}
	pointerDragSession = null
}

function clearAllDropCursors() {
	for (const view of editorViews.values()) {
		// Pointer drag does not emit the native dragend event, so explicitly tell
		// every editor to remove its落位 marker before clearing the preview.
		view.dom.dispatchEvent(
			new CustomEvent("magic-node-pointer-dragover", {
				detail: null,
			}),
		)
	}
}

function hideNativeDragCursor() {
	if (typeof document === "undefined") return
	ensurePointerDragStyle()
	document.documentElement.classList.add("magic-node-dragging")
}

function ensurePointerDragStyle() {
	if (typeof document === "undefined" || nativeDragCursorStyle) return
	nativeDragCursorStyle = document.createElement("style")
	nativeDragCursorStyle.textContent =
		"html.magic-node-dragging, html.magic-node-dragging * { cursor: none !important; }" +
		"html.magic-node-pointer-pending, html.magic-node-pointer-pending * { user-select: none !important; }"
	document.head.appendChild(nativeDragCursorStyle)
}

function updateDragPreviewPosition(event: Pick<MouseEvent, "clientX" | "clientY">) {
	if (!activeDragPreview) return
	if (!Number.isFinite(event.clientX) || !Number.isFinite(event.clientY)) return

	const gap = 12
	const rect = activeDragPreview.getBoundingClientRect()
	const viewportWidth = typeof window !== "undefined" ? window.innerWidth : 0
	const viewportHeight = typeof window !== "undefined" ? window.innerHeight : 0
	const preferredLeft = event.clientX + gap
	const preferredTop = event.clientY + gap
	const left =
		viewportWidth > 0 && rect.width > 0 && preferredLeft + rect.width > viewportWidth - 8
			? event.clientX - rect.width - gap
			: preferredLeft
	const top =
		viewportHeight > 0 && rect.height > 0 && preferredTop + rect.height > viewportHeight - 8
			? event.clientY - rect.height - gap
			: preferredTop

	activeDragPreview.style.setProperty("left", `${Math.max(8, left)}px`, "important")
	activeDragPreview.style.setProperty("top", `${Math.max(8, top)}px`, "important")
}

function getPointerDragTarget(target: EventTarget | null) {
	if (!(target instanceof Element)) return null
	const element = target.closest<HTMLElement>("[data-magic-editor-node]")
	if (!element) return null

	for (const view of editorViews.values()) {
		if (view.dom.contains(element)) {
			const dragged = findDraggedNode(view, element)
			if (dragged) {
				return {
					payload: createDragPayload(
						dragged.node.type.name,
						dragged.node.attrs,
						undefined,
						dragged.position,
					),
					sourceView: view,
					sourceElement: dragged.element,
				}
			}
		}
	}

	const type = element.dataset.magicNodeType
	const rawAttrs = element.dataset.magicNodeAttrs
	if (!type || !rawAttrs) return null
	try {
		return {
			payload: createDragPayload(type, JSON.parse(rawAttrs)),
			sourceElement: element,
		}
	} catch {
		return null
	}
}

function createDragPayload(
	type: string,
	attrs: Record<string, unknown>,
	sourceEditorId?: string,
	sourcePosition?: number,
	sourceDragId?: string,
): MagicNodeDragPayload {
	return {
		version: MAGIC_NODE_DRAG_VERSION,
		node: { type, attrs },
		sourceEditorId,
		sourcePosition,
		sourceDragId,
		text: getDragText(type, attrs),
	}
}

function findDropTarget(clientX: number, clientY: number): MagicNodeDropTarget | null {
	for (const view of editorViews.values()) {
		const rect = view.dom.getBoundingClientRect()
		if (
			clientX < rect.left ||
			clientX > rect.right ||
			clientY < rect.top ||
			clientY > rect.bottom
		) {
			continue
		}
		const coords = view.posAtCoords({ left: clientX, top: clientY })
		if (coords) return { view, position: coords.pos }
	}
	return null
}

function nodeMatchesDragSnapshot(node: ProseMirrorNode, payload: MagicNodeDragPayload) {
	if (node.type.name !== payload.node.type) return false
	try {
		// The live DOM identity narrows where to look, but the complete attrs
		// snapshot still has to match before a node can be deleted as the source.
		return JSON.stringify(node.attrs) === JSON.stringify(payload.node.attrs)
	} catch {
		return false
	}
}

function resolveSourceNode(
	view: EditorView,
	payload: MagicNodeDragPayload,
	registeredSource?: MagicNodeDragSource,
) {
	const candidates: number[] = []
	if (registeredSource?.view === view) {
		try {
			candidates.push(view.posAtDOM(registeredSource.element, 0))
		} catch {
			// The source NodeView may have been recreated during the drag.
		}
	}
	// A position is only a compatibility fallback for old payloads. New drags
	// carry a sourceDragId and must resolve through the live DOM identity or a
	// unique snapshot match instead of trusting the stale captured position.
	if (!payload.sourceDragId && payload.sourcePosition !== undefined) {
		candidates.push(payload.sourcePosition)
	}

	for (const position of candidates) {
		const node = view.state.doc.nodeAt(position)
		if (node && nodeMatchesDragSnapshot(node, payload)) return { view, node, position }
	}

	const matches: Array<{ node: ProseMirrorNode; position: number }> = []
	view.state.doc.descendants((node, position) => {
		if (nodeMatchesDragSnapshot(node, payload)) matches.push({ node, position })
		return matches.length < 2
	})
	return matches.length === 1 ? { view, ...matches[0] } : null
}

function updateDropCursorAtPosition(dropCursor: HTMLElement, view: EditorView, position: number) {
	const caret = view.coordsAtPos(position)
	dropCursor.style.left = `${Math.min(caret.left, caret.right)}px`
	dropCursor.style.top = `${caret.top - 2}px`
	dropCursor.style.height = `${Math.max(24, caret.bottom - caret.top + 4)}px`
	dropCursor.hidden = false
}

function applyNodeDrop(target: MagicNodeDropTarget, payload: MagicNodeDragPayload) {
	const { view, position } = target
	const nodeType = view.state.schema.nodes[payload.node.type]
	if (!nodeType) return false

	const sourceView = payload.sourceEditorId ? editorViews.get(payload.sourceEditorId) : undefined
	const sourceSource = payload.sourceDragId
		? activeDragSources.get(payload.sourceDragId)
		: undefined
	const resolvedSource = sourceView ? resolveSourceNode(sourceView, payload, sourceSource) : null
	if (payload.sourceEditorId && (!sourceView || !resolvedSource)) return false
	const isSameEditor = resolvedSource?.view === view
	const sourceNode = resolvedSource?.node
	const sourcePosition = resolvedSource?.position

	const node = (() => {
		try {
			return nodeType.create(payload.node.attrs)
		} catch {
			return null
		}
	})()
	if (!node) return false
	if (
		isSameEditor &&
		sourceNode?.type.name === node.type.name &&
		sourcePosition !== undefined &&
		sourcePosition <= position &&
		position <= sourcePosition + sourceNode.nodeSize
	) {
		return true
	}

	let tr = view.state.tr
	let insertPosition = position
	if (isSameEditor && sourceNode && sourcePosition !== undefined) {
		tr = tr.delete(sourcePosition, sourcePosition + sourceNode.nodeSize)
		insertPosition = tr.mapping.map(insertPosition)
	}

	try {
		tr = tr.replaceRangeWith(insertPosition, insertPosition, node)
		tr = tr.setSelection(TextSelection.near(tr.doc.resolve(insertPosition + node.nodeSize)))
		view.dispatch(tr)
	} catch {
		return false
	}

	if (!isSameEditor && sourceView) {
		// The destination dispatch may synchronously trigger source-editor updates.
		// Resolve the source again against its current document before deleting it.
		// If identity is no longer provable, keep the source and degrade to a copy.
		const currentSource = resolveSourceNode(sourceView, payload, sourceSource)
		if (currentSource) {
			try {
				sourceView.dispatch(
					sourceView.state.tr.delete(
						currentSource.position,
						currentSource.position + currentSource.node.nodeSize,
					),
				)
			} catch {
				// The target insert already succeeded; preserving the source avoids data loss.
			}
		}
	}

	// A cross-editor move can leave focus on the source editor. Focus the
	// destination after best-effort source cleanup so the caret remains usable.
	view.focus()
	return true
}

function installPointerDragListeners() {
	if (pointerDragListenersInstalled || typeof document === "undefined") return

	const handlePointerDown = (event: Event) => {
		const pointerEvent = event as PointerEvent
		if (pointerEvent.button !== 0 || pointerDragSession) return
		const target = getPointerDragTarget(pointerEvent.target)
		if (!target) return
		const sourceEditorId = [...editorViews.entries()].find(
			([, view]) => view === target.sourceView,
		)?.[0]
		if (sourceEditorId && target.sourceView && target.payload.sourcePosition !== undefined) {
			target.payload.sourceEditorId = sourceEditorId
			target.payload.sourceDragId = createEditorId()
			activeDragSources.set(target.payload.sourceDragId, {
				view: target.sourceView,
				element: target.sourceElement,
			})
		}
		pointerDragSession = {
			...target,
			pointerId: pointerEvent.pointerId,
			startX: pointerEvent.clientX,
			startY: pointerEvent.clientY,
			active: false,
		}
		if (typeof target.sourceElement.setPointerCapture === "function") {
			target.sourceElement.setPointerCapture(pointerEvent.pointerId)
		}
		ensurePointerDragStyle()
		document.documentElement.classList.add("magic-node-pointer-pending")
	}

	const handlePointerMove = (event: Event) => {
		const pointerEvent = event as PointerEvent
		const session = pointerDragSession
		if (!session || session.pointerId !== pointerEvent.pointerId) return
		const movedX = pointerEvent.clientX - session.startX
		const movedY = pointerEvent.clientY - session.startY
		// Prevent the browser from selecting text while the pointer crosses the
		// drag threshold. A normal click still works because no click is canceled.
		pointerEvent.preventDefault()
		if (!session.active && Math.hypot(movedX, movedY) < POINTER_DRAG_THRESHOLD) return

		if (!session.active) {
			session.active = true
			createDragPreview(session.payload.text, session.sourceElement)
			window.getSelection()?.removeAllRanges()
		}
		updateDragPreviewPosition(pointerEvent)
		const target = findDropTarget(pointerEvent.clientX, pointerEvent.clientY)
		for (const view of editorViews.values()) {
			view.dom.dispatchEvent(
				new CustomEvent("magic-node-pointer-dragover", {
					detail: target?.view === view ? target.position : null,
				}),
			)
		}
	}

	const finishPointerDrag = (event: Event) => {
		const pointerEvent = event as PointerEvent
		const session = pointerDragSession
		if (!session || session.pointerId !== pointerEvent.pointerId) return
		if (session.active) {
			pointerEvent.preventDefault()
			const target = findDropTarget(pointerEvent.clientX, pointerEvent.clientY)
			if (target) applyNodeDrop(target, session.payload)
			// Pointer capture can still produce a click on the source node after a
			// successful drag. Suppress only that source click, not the next global
			// click, so unrelated controls remain interactive.
			suppressClickTarget = session.sourceElement
		}
		if (
			session.sourceElement.hasPointerCapture?.(pointerEvent.pointerId) &&
			session.sourceElement.releasePointerCapture
		) {
			session.sourceElement.releasePointerCapture(pointerEvent.pointerId)
		}
		clearPointerDragSession()
	}

	const handleWindowBlur = () => {
		if (!pointerDragSession) return
		clearPointerDragSession()
	}
	const handleVisibilityChange = () => {
		if (document.visibilityState === "hidden") handleWindowBlur()
	}

	const handleDragStart = (event: Event) => {
		const target = (event.target as Element | null)?.closest?.("[data-magic-editor-node]")
		if (target) event.preventDefault()
	}
	const handleClick = (event: Event) => {
		if (!suppressClickTarget) return
		const target = event.target
		if (!(target instanceof Node) || !suppressClickTarget.contains(target)) return
		suppressClickTarget = null
		event.preventDefault()
		event.stopPropagation()
	}

	document.addEventListener("pointerdown", handlePointerDown, true)
	document.addEventListener("pointermove", handlePointerMove, true)
	document.addEventListener("pointerup", finishPointerDrag, true)
	document.addEventListener("pointercancel", finishPointerDrag, true)
	window.addEventListener("blur", handleWindowBlur)
	document.addEventListener("visibilitychange", handleVisibilityChange)
	document.addEventListener("dragstart", handleDragStart, true)
	document.addEventListener("click", handleClick, true)
	pointerDragListenersInstalled = true
	removePointerDragListeners = () => {
		document.removeEventListener("pointerdown", handlePointerDown, true)
		document.removeEventListener("pointermove", handlePointerMove, true)
		document.removeEventListener("pointerup", finishPointerDrag, true)
		document.removeEventListener("pointercancel", finishPointerDrag, true)
		window.removeEventListener("blur", handleWindowBlur)
		document.removeEventListener("visibilitychange", handleVisibilityChange)
		document.removeEventListener("dragstart", handleDragStart, true)
		document.removeEventListener("click", handleClick, true)
		pointerDragListenersInstalled = false
		removePointerDragListeners = null
		clearPointerDragSession()
	}
}

function ensureDragPreviewListeners() {
	if (dragPreviewListenersInstalled || typeof document === "undefined") return
	const handleDragOver = (event: Event) => {
		const dragEvent = event as DragEvent
		if (!dragEvent.dataTransfer?.types.includes(MAGIC_NODE_DRAG_MIME)) return
		updateDragPreviewPosition(dragEvent)
	}
	document.addEventListener("dragover", handleDragOver, true)
	window.addEventListener("dragover", handleDragOver, true)
	document.addEventListener("drag", handleDragOver, true)
	document.addEventListener(
		"drop",
		() => {
			clearAllDropCursors()
			clearDragPreview()
			// The editor's drop handler runs later in this event dispatch. Keep the
			// source identity available until it has finished resolving the live node.
			queueMicrotask(clearDragSources)
		},
		true,
	)
	document.addEventListener(
		"dragend",
		() => {
			clearAllDropCursors()
			clearDragPreview()
			clearDragSources()
		},
		true,
	)
	dragPreviewListenersInstalled = true
}

const DRAG_PREVIEW_MAX_WIDTH = 360
const DRAG_PREVIEW_MAX_HEIGHT = 260

function copyComputedStyles(source: Element, target: Element) {
	if (typeof window === "undefined") return

	const computedStyle = window.getComputedStyle(source)
	for (let index = 0; index < computedStyle.length; index += 1) {
		const property = computedStyle.item(index)
		if (target instanceof HTMLElement || target instanceof SVGElement) {
			target.style.setProperty(
				property,
				computedStyle.getPropertyValue(property),
				computedStyle.getPropertyPriority(property),
			)
		}
	}

	const sourceChildren = Array.from(source.children)
	const targetChildren = Array.from(target.children)
	sourceChildren.forEach((child, index) => {
		const targetChild = targetChildren[index]
		if (targetChild) copyComputedStyles(child, targetChild)
	})
}

function prepareDragPreview(source: HTMLElement) {
	const preview = source.cloneNode(true) as HTMLElement
	copyComputedStyles(source, preview)
	preview
		.querySelectorAll<Element>(
			"[draggable], [contenteditable], [data-magic-editor-node], [data-testid], [data-drag-preview-hidden], [data-drag-preview-icon]",
		)
		.forEach((element) => {
			if (element.hasAttribute("data-drag-preview-hidden")) {
				element.remove()
				return
			}
			element.removeAttribute("draggable")
			element.removeAttribute("contenteditable")
			element.removeAttribute("data-magic-editor-node")
			element.removeAttribute("data-testid")
			// Keep the semantic icon in the preview, but remove the marker used
			// only to distinguish it from elements that should be omitted.
			element.removeAttribute("data-drag-preview-icon")
			element.removeAttribute("data-drag-preview-hidden")
		})
	preview.removeAttribute("draggable")
	preview.removeAttribute("contenteditable")
	preview.removeAttribute("data-magic-editor-node")
	preview.removeAttribute("data-testid")

	const sourceRect = source.getBoundingClientRect()
	const width = Math.min(sourceRect.width, DRAG_PREVIEW_MAX_WIDTH)
	if (width > 0) preview.style.width = `${width}px`

	preview.style.setProperty("position", "fixed", "important")
	preview.style.setProperty("left", "12px", "important")
	preview.style.setProperty("top", "12px", "important")
	// The source node can be transparent. The detached preview needs its own
	// opaque surface so editor text never shows through while dragging.
	preview.style.setProperty("background-color", "#fff", "important")
	preview.style.maxWidth = `min(${DRAG_PREVIEW_MAX_WIDTH}px, calc(100vw - 24px))`
	preview.style.maxHeight = `min(${DRAG_PREVIEW_MAX_HEIGHT}px, calc(100vh - 24px))`
	preview.style.margin = "0"
	preview.style.overflow = "hidden"
	preview.style.pointerEvents = "none"
	preview.style.opacity = "0.96"
	preview.style.boxShadow = "0 2px 8px rgb(0 0 0 / 0.18)"
	preview.style.zIndex = "2147483647"
	preview.setAttribute("aria-hidden", "true")

	return preview
}

function createDragPreview(text: string, source?: HTMLElement | null) {
	if (typeof document === "undefined") return
	clearDragPreview()
	const preview = source ? prepareDragPreview(source) : document.createElement("span")
	if (!source) {
		preview.textContent = text || "节点"
		preview.style.setProperty("position", "fixed", "important")
		preview.style.setProperty("left", "12px", "important")
		preview.style.setProperty("top", "12px", "important")
		preview.style.maxWidth = "220px"
		preview.style.padding = "3px 7px"
		preview.style.border = "1px solid #000"
		preview.style.borderRadius = "6px"
		preview.style.background = "rgb(255 255 255 / 0.94)"
		preview.style.color = "#000"
		preview.style.fontSize = "12px"
		preview.style.lineHeight = "18px"
		preview.style.whiteSpace = "nowrap"
		preview.style.overflow = "hidden"
		preview.style.textOverflow = "ellipsis"
		preview.style.pointerEvents = "none"
		preview.style.zIndex = "2147483647"
	}
	document.body.appendChild(preview)
	activeDragPreview = preview
	ensureDragPreviewListeners()
}

function readPayload(event: DragEvent): MagicNodeDragPayload | null {
	const raw = event.dataTransfer?.getData(MAGIC_NODE_DRAG_MIME)
	if (!raw) return null

	try {
		const payload = JSON.parse(raw) as MagicNodeDragPayload
		if (
			payload.version !== MAGIC_NODE_DRAG_VERSION ||
			!payload.node?.type ||
			!payload.node.attrs ||
			(payload.sourceEditorId && !Number.isInteger(payload.sourcePosition)) ||
			(!payload.sourceEditorId && payload.sourcePosition !== undefined)
		) {
			return null
		}
		return payload
	} catch {
		return null
	}
}

function writeDragData(view: EditorView, editorId: string, event: DragEvent) {
	if (!event.dataTransfer) return false
	const dragged = findDraggedNode(view, event.target)
	if (!dragged) return false

	const dragId = createEditorId()
	const written = setMagicNodeDragData(
		event,
		dragged.node.type.name,
		dragged.node.attrs,
		{
			editorId,
			position: dragged.position,
			dragId,
		},
		dragged.element,
	)
	if (written) activeDragSources.set(dragId, { view, element: dragged.element })
	return written
}

function findDraggedNode(view: EditorView, target: EventTarget | null) {
	if (!(target instanceof Element)) return null
	const element = target.closest<HTMLElement>("[data-magic-editor-node]")
	if (!element) return null

	try {
		const position = view.posAtDOM(element, 0)
		const node = view.state.doc.nodeAt(position)
		if (!node || (node.type.name !== "mention" && node.type.name !== "inspector-detail")) {
			return null
		}
		return { node, position, element }
	} catch {
		return null
	}
}

export function createMagicNodeDragPlugin() {
	return new Plugin({
		key: nodeDragPluginKey,
		view(view) {
			installPointerDragListeners()
			const editorId = createEditorId()
			const dropCursor = document.createElement("span")
			const dropPointer = document.createElement("span")
			dropCursor.className = DROP_CURSOR_CLASS
			dropPointer.setAttribute("aria-hidden", "true")
			dropCursor.setAttribute("aria-hidden", "true")
			dropCursor.hidden = true
			dropCursor.style.position = "fixed"
			dropCursor.style.width = "1px"
			dropCursor.style.borderRadius = "999px"
			// The marker is mounted on body, so use concrete colors instead of editor theme variables.
			dropCursor.style.background = "#111"
			dropCursor.style.boxShadow =
				"0 0 0 1px rgb(255 255 255 / 0.9), 0 1px 3px rgb(0 0 0 / 0.22)"
			dropCursor.style.pointerEvents = "none"
			dropCursor.style.zIndex = "2147483647"
			dropPointer.style.position = "absolute"
			dropPointer.style.left = "-3px"
			dropPointer.style.top = "-3px"
			dropPointer.style.width = "0"
			dropPointer.style.height = "0"
			dropPointer.style.borderLeft = "3px solid transparent"
			dropPointer.style.borderRight = "3px solid transparent"
			dropPointer.style.borderTop = "5px solid #111"
			dropPointer.style.filter = "drop-shadow(0 0 1px rgb(255 255 255 / 0.9))"
			dropCursor.appendChild(dropPointer)
			document.body.appendChild(dropCursor)

			const hideDropCursor = () => {
				dropCursor.hidden = true
			}
			const updateDropCursor = (event: DragEvent) => {
				if (!event.dataTransfer?.types.includes(MAGIC_NODE_DRAG_MIME)) return false
				const coords = view.posAtCoords({ left: event.clientX, top: event.clientY })
				if (!coords) {
					hideDropCursor()
					return false
				}

				updateDropCursorAtPosition(dropCursor, view, coords.pos)
				return true
			}
			const handleDragOver = (event: Event) => {
				if (!updateDropCursor(event as DragEvent)) return
				event.preventDefault()
			}
			const handleDragLeave = (event: Event) => {
				const dragEvent = event as DragEvent
				if (
					dragEvent.relatedTarget instanceof Node &&
					view.dom.contains(dragEvent.relatedTarget)
				) {
					return
				}
				hideDropCursor()
			}
			const handlePointerDragOver = (event: Event) => {
				const position = (event as CustomEvent<number | null>).detail
				if (position === null) {
					hideDropCursor()
					return
				}
				updateDropCursorAtPosition(dropCursor, view, position)
			}
			const handleDrop = () => hideDropCursor()
			const handleDragEnd = () => hideDropCursor()
			view.dom.addEventListener("dragover", handleDragOver, true)
			view.dom.addEventListener("dragleave", handleDragLeave, true)
			view.dom.addEventListener("drop", handleDrop, true)
			view.dom.addEventListener("dragend", handleDragEnd, true)
			view.dom.addEventListener("magic-node-pointer-dragover", handlePointerDragOver)
			const handleDragStart = (event: Event) => {
				// Capture before React's parent upload handlers so node drags are
				// identified before the upload overlay sees dragenter/dragover.
				writeDragData(view, editorId, event as DragEvent)
			}
			view.dom.addEventListener("dragstart", handleDragStart, true)
			editorViews.set(editorId, view)

			return {
				destroy() {
					hideDropCursor()
					dropCursor.remove()
					view.dom.removeEventListener("dragover", handleDragOver, true)
					view.dom.removeEventListener("dragleave", handleDragLeave, true)
					view.dom.removeEventListener("drop", handleDrop, true)
					view.dom.removeEventListener("dragend", handleDragEnd, true)
					view.dom.removeEventListener(
						"magic-node-pointer-dragover",
						handlePointerDragOver,
					)
					view.dom.removeEventListener("dragstart", handleDragStart, true)
					editorViews.delete(editorId)
					for (const [dragId, source] of activeDragSources) {
						if (source.view === view) activeDragSources.delete(dragId)
					}
					if (editorViews.size === 0) removePointerDragListeners?.()
				},
			}
		},
		props: {
			handleDOMEvents: {
				dragstart(view, event) {
					writeDragData(
						view,
						[...editorViews.entries()].find(([, item]) => item === view)?.[0] ?? "",
						event,
					)
					return false
				},
				dragover(_view, event) {
					if (!event.dataTransfer?.types.includes(MAGIC_NODE_DRAG_MIME)) return false
					event.preventDefault()
					event.dataTransfer.dropEffect = "move"
					return true
				},
				drop(view, event) {
					const payload = readPayload(event)
					if (!payload) return false

					const coords = view.posAtCoords({ left: event.clientX, top: event.clientY })
					if (!coords) return false
					const didDrop = applyNodeDrop({ view, position: coords.pos }, payload)
					if (didDrop) event.preventDefault()
					return didDrop
				},
			},
		},
	})
}
