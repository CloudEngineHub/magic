import { Plugin, PluginKey, TextSelection } from "@/infrastructure/editors/tiptap/pm-state"
import type { EditorView } from "prosemirror-view"

export const MAGIC_NODE_DRAG_MIME = "application/x-magic-editor-node+json"
const MAGIC_NODE_DRAG_VERSION = 1
const nodeDragPluginKey = new PluginKey("magicNodeDrag")
const DROP_CURSOR_CLASS = "magic-node-dropcursor"

interface MagicNodeDragPayload {
	version: number
	node: {
		type: string
		attrs: Record<string, unknown>
	}
	sourceEditorId?: string
	sourcePosition?: number
	text: string
}

export function setMagicNodeDragData(
	event: DragEvent,
	type: string,
	attrs: Record<string, unknown>,
	source?: { editorId: string; position: number },
	previewElement?: HTMLElement | null,
) {
	if (!event.dataTransfer) return false

	const payload: MagicNodeDragPayload = {
		version: MAGIC_NODE_DRAG_VERSION,
		node: { type, attrs },
		sourceEditorId: source?.editorId,
		sourcePosition: source?.position,
		text: getDragText(type, attrs),
	}

	event.dataTransfer.effectAllowed = source ? "move" : "copy"
	event.dataTransfer.setData(MAGIC_NODE_DRAG_MIME, JSON.stringify(payload))
	if (typeof document !== "undefined") {
		const transparentImage = document.createElement("canvas")
		transparentImage.width = 1
		transparentImage.height = 1
		transparentImage.style.position = "fixed"
		transparentImage.style.left = "-9999px"
		transparentImage.style.top = "-9999px"
		transparentImage.style.pointerEvents = "none"
		transparentImage.setAttribute("aria-hidden", "true")
		document.body.appendChild(transparentImage)
		activeNativeDragImage = transparentImage
		if (typeof event.dataTransfer.setDragImage === "function") {
			event.dataTransfer.setDragImage(transparentImage, 0, 0)
		}
		createDragPreview(payload.text, previewElement)
		updateDragPreviewPosition(event)
	}
	return true
}

const editorViews = new Map<string, EditorView>()
let activeDragPreview: HTMLElement | null = null
let activeNativeDragImage: HTMLCanvasElement | null = null
let dragPreviewListenersInstalled = false

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
}

function updateDragPreviewPosition(event: DragEvent) {
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
	document.addEventListener("drop", clearDragPreview, true)
	document.addEventListener("dragend", clearDragPreview, true)
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
			"[draggable], [contenteditable], [data-magic-editor-node], [data-testid], [data-drag-preview-hidden]",
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

	return setMagicNodeDragData(
		event,
		dragged.node.type.name,
		dragged.node.attrs,
		{
			editorId,
			position: dragged.position,
		},
		dragged.element,
	)
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

				const caret = view.coordsAtPos(coords.pos)
				dropCursor.style.left = `${Math.min(caret.left, caret.right)}px`
				dropCursor.style.top = `${caret.top - 2}px`
				dropCursor.style.height = `${Math.max(24, caret.bottom - caret.top + 4)}px`
				dropCursor.hidden = false
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
			const handleDrop = () => hideDropCursor()
			const handleDragEnd = () => hideDropCursor()
			view.dom.addEventListener("dragover", handleDragOver, true)
			view.dom.addEventListener("dragleave", handleDragLeave, true)
			view.dom.addEventListener("drop", handleDrop, true)
			view.dom.addEventListener("dragend", handleDragEnd, true)
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
					view.dom.removeEventListener("dragstart", handleDragStart, true)
					editorViews.delete(editorId)
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
					const nodeType = view.state.schema.nodes[payload.node.type]
					if (!nodeType) return false

					const sourceView = payload.sourceEditorId
						? editorViews.get(payload.sourceEditorId)
						: undefined
					const isSameEditor = sourceView === view
					const sourceNode =
						sourceView && payload.sourcePosition !== undefined
							? sourceView.state.doc.nodeAt(payload.sourcePosition)
							: undefined

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
						payload.sourcePosition !== undefined &&
						payload.sourcePosition <= coords.pos &&
						coords.pos <= payload.sourcePosition + sourceNode.nodeSize
					) {
						event.preventDefault()
						return true
					}

					let tr = view.state.tr
					let insertPosition = coords.pos
					if (isSameEditor && sourceNode && payload.sourcePosition !== undefined) {
						tr = tr.delete(
							payload.sourcePosition,
							payload.sourcePosition + sourceNode.nodeSize,
						)
						insertPosition = tr.mapping.map(insertPosition)
					}

					try {
						tr = tr.replaceRangeWith(insertPosition, insertPosition, node)
						tr = tr.setSelection(
							TextSelection.near(tr.doc.resolve(insertPosition + node.nodeSize)),
						)
						view.dispatch(tr)
						if (
							!isSameEditor &&
							sourceView &&
							sourceNode &&
							payload.sourcePosition !== undefined
						) {
							sourceView.dispatch(
								sourceView.state.tr.delete(
									payload.sourcePosition,
									payload.sourcePosition + sourceNode.nodeSize,
								),
							)
						}
						event.preventDefault()
						return true
					} catch {
						return false
					}
				},
			},
		},
	})
}
