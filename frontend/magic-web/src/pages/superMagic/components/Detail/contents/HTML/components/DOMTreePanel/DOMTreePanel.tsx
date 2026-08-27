import * as React from "react"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import {
	Ban,
	AlertTriangle,
	ChevronRight,
	ChevronsDownUp,
	ChevronsUpDown,
	CornerDownRight,
	FolderPlus,
	ImagePlus,
	Image as ImageIcon,
	ListPlus,
	Plus,
	Trash2,
	ArrowDown,
	ArrowUp,
	RefreshCw,
	GripVertical,
	Layers3,
	X,
} from "lucide-react"
import { Button } from "@/components/shadcn-ui/button"
import { ScrollArea } from "@/components/shadcn-ui/scroll-area"
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/shadcn-ui/dialog"
import { Input } from "@/components/shadcn-ui/input"
import { ContextMenu, ContextMenuTrigger } from "@/components/shadcn-ui/context-menu"
import {
	DropdownMenu,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/shadcn-ui/dropdown-menu"
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from "@/components/shadcn-ui/tooltip"
import { Popover, PopoverTrigger } from "@/components/shadcn-ui/popover"
import { useTranslation } from "react-i18next"
import { cn } from "@/utils/cn"
import magicToast from "@/components/base/MagicToaster/utils"
import type { DomTreeNode, DomTreeResponse } from "../../iframe-bridge/types/messages"
import type { HTMLEditorV2Ref } from "../../iframe-bridge/types/props"
import { HTML_EDITOR_Z_INDEX } from "../../constants/z-index"
import { DOMTreeContextMenu } from "./DOMTreeContextMenu"
import { EditorDropdownMenuContent, EditorPopoverContent } from "../EditorFloating"

interface Props {
	editorRef: React.RefObject<HTMLEditorV2Ref>
	visible: boolean
	onClose?: () => void
	selectedSelector?: string
	contentRevision?: number
}

const DOM_TREE_FALLBACK_REFRESH_INTERVAL = 10_000
const DOM_TREE_CONTENT_REFRESH_DELAY = 120
const DOM_TREE_INDENT_STEP = 16

function flattenParents(
	node: DomTreeNode,
	parent?: DomTreeNode,
	map = new Map<string, DomTreeNode>(),
) {
	if (parent) map.set(node.nodeId, parent)
	node.children.forEach((child) => flattenParents(child, node, map))
	return map
}

function collectNodeIds(node: DomTreeNode, result = new Set<string>()) {
	result.add(node.nodeId)
	node.children.forEach((child) => collectNodeIds(child, result))
	return result
}

function collectVisibleNodeIds(
	node: DomTreeNode,
	expanded: Set<string>,
	result: string[] = [],
): string[] {
	result.push(node.nodeId)
	if (expanded.has(node.nodeId)) {
		node.children.forEach((child) => collectVisibleNodeIds(child, expanded, result))
	}
	return result
}

type DropPosition = "before" | "inside" | "after"
type InsertPlacement = "before" | "inside" | "after"

interface TextInsertRequest {
	parentNodeId: string
	index?: number
	targetLabel: string
}

interface DeleteRequest {
	selector: string
	targetLabel: string
}

function createDragPreview(label: string): HTMLElement {
	const preview = document.createElement("div")
	preview.textContent = label
	preview.className =
		"pointer-events-none fixed -left-[1000px] -top-[1000px] z-[2147483647] max-w-60 overflow-hidden text-ellipsis whitespace-nowrap rounded-[3px] border border-primary/70 bg-popover px-3 py-2 text-xs font-semibold leading-4 text-popover-foreground shadow-[0_8px_24px_rgba(15,23,42,0.2)]"
	document.body.appendChild(preview)
	return preview
}

function getSemanticKey(tagName: string): string {
	const tag = tagName.toLowerCase()
	if (["br", "wbr"].includes(tag)) return "lineBreak"
	if (tag === "hr") return "divider"
	if (["img", "picture", "source"].includes(tag)) return "image"
	if (
		[
			"input",
			"button",
			"select",
			"textarea",
			"option",
			"optgroup",
			"output",
			"progress",
			"meter",
		].includes(tag)
	)
		return "control"
	if (["video", "audio", "canvas", "svg"].includes(tag)) return "media"
	if (["iframe", "object", "embed"].includes(tag)) return "embed"
	if (["a", "area"].includes(tag)) return "link"
	if (["blockquote", "q", "cite"].includes(tag)) return "quote"
	if (["code", "pre", "kbd", "samp", "var"].includes(tag)) return "code"
	if (["details", "summary"].includes(tag)) return "disclosure"
	if (
		["p", "span", "strong", "em", "b", "i", "u", "small", "mark", "del", "ins", "s"].includes(
			tag,
		)
	)
		return "text"
	if (["h1", "h2", "h3", "h4", "h5", "h6"].includes(tag)) return "heading"
	if (["ul", "ol", "li", "dl", "dt", "dd"].includes(tag)) return "list"
	if (["table", "thead", "tbody", "tr", "th", "td"].includes(tag)) return "table"
	if (["form", "fieldset", "legend"].includes(tag)) return "form"
	if (
		[
			"html",
			"body",
			"main",
			"section",
			"article",
			"header",
			"footer",
			"nav",
			"aside",
			"div",
			"figure",
			"figcaption",
		].includes(tag)
	)
		return "container"
	return "element"
}

function getSemanticTone(semanticKey: string): string {
	switch (semanticKey) {
		case "container":
			return "border-sky-500/25 bg-sky-500/10 text-sky-700 dark:text-sky-300"
		case "text":
		case "heading":
		case "link":
		case "quote":
		case "code":
			return "border-violet-500/25 bg-violet-500/10 text-violet-700 dark:text-violet-300"
		case "image":
		case "media":
			return "border-emerald-500/25 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
		case "control":
			return "border-amber-500/25 bg-amber-500/10 text-amber-700 dark:text-amber-300"
		case "form":
		case "disclosure":
			return "border-amber-500/25 bg-amber-500/10 text-amber-700 dark:text-amber-300"
		case "list":
		case "table":
		case "divider":
			return "border-orange-500/25 bg-orange-500/10 text-orange-700 dark:text-orange-300"
		case "lineBreak":
			return "border-slate-500/25 bg-slate-500/10 text-slate-700 dark:text-slate-300"
		case "embed":
			return "border-cyan-500/25 bg-cyan-500/10 text-cyan-700 dark:text-cyan-300"
		default:
			return "border-border/70 bg-muted/55 text-foreground/80"
	}
}

function isSelectableNode(node: DomTreeNode): boolean {
	if (node.canSelect !== undefined) return node.canSelect
	// Older runtimes did not send canSelect. Keep root nodes selectable while
	// preserving the previous editable/non-unique behavior for other nodes.
	return (
		node.editable ||
		node.disabledReason === "根节点不可移动或删除" ||
		["html", "body"].includes(node.tagName.toLowerCase())
	)
}

const ActionTooltip = React.forwardRef<
	HTMLElement,
	{
		label: React.ReactNode
		children: React.ReactElement
		side?: "top" | "right" | "bottom" | "left"
	}
>(({ label, children, side = "top" }, ref) => {
	if (label == null || label === "") return children
	const isDisabled =
		React.isValidElement<{ disabled?: boolean }>(children) && children.props.disabled === true
	const trigger = isDisabled ? (
		<span className="inline-flex min-w-0" tabIndex={0} aria-disabled="true">
			{children}
		</span>
	) : (
		React.cloneElement(children, { ref })
	)

	return (
		<Tooltip>
			<TooltipTrigger asChild>{trigger}</TooltipTrigger>
			<TooltipContent
				side={side}
				sideOffset={6}
				className="z-[10060] max-w-72 whitespace-normal break-words"
				zIndex={HTML_EDITOR_Z_INDEX.EDITOR_FLOATING.TOOLTIP}
			>
				{label}
			</TooltipContent>
		</Tooltip>
	)
})
ActionTooltip.displayName = "ActionTooltip"

function NodeDetailsPopover({
	children,
	content,
}: {
	children: React.ReactElement
	content: React.ReactNode
}) {
	return (
		<Popover>
			<PopoverTrigger asChild>
				<span
					className="inline-flex min-w-0 max-w-[34%] shrink-0 cursor-help"
					onClick={(event) => event.stopPropagation()}
				>
					{children}
				</span>
			</PopoverTrigger>
			<EditorPopoverContent
				side="top"
				align="start"
				sideOffset={6}
				className={cn(
					"!z-[10060] w-fit max-w-72 border-0 bg-foreground px-3 py-2 text-background shadow-lg",
				)}
			>
				{content}
			</EditorPopoverContent>
		</Popover>
	)
}

interface AddNodeMenuProps {
	mode: "inside" | "sibling"
	open: boolean
	disabled: boolean
	onOpenChange: (open: boolean) => void
	onAddText: (placement: InsertPlacement) => void
	onAddImage: (placement: InsertPlacement) => void
	label: string
	testId: string
}

function AddNodeMenu({
	mode,
	open,
	disabled,
	onOpenChange,
	onAddText,
	onAddImage,
	label,
	testId,
}: AddNodeMenuProps) {
	const { t } = useTranslation("super")
	const isInside = mode === "inside"
	const Icon = isInside ? FolderPlus : ListPlus

	return (
		<DropdownMenu open={open} onOpenChange={onOpenChange}>
			<span className="inline-flex" tabIndex={disabled ? 0 : undefined}>
				<DropdownMenuTrigger asChild>
					<Button
						size="icon"
						variant="ghost"
						className="h-5 w-5 rounded-sm active:scale-[0.96]"
						disabled={disabled}
						aria-label={label}
						data-testid={testId}
						onPointerDown={(event) => event.stopPropagation()}
						onClick={(event) => {
							event.stopPropagation()
							// Radix opens from pointerdown. Keep a click fallback for
							// programmatic and keyboard activation without toggling twice.
							if (!open) onOpenChange(true)
						}}
					>
						<Icon className="h-3 w-3" />
					</Button>
				</DropdownMenuTrigger>
			</span>
			<EditorDropdownMenuContent align="end" className="w-56">
				<DropdownMenuLabel>{label}</DropdownMenuLabel>
				{isInside ? (
					<>
						<DropdownMenuItem onSelect={() => onAddText("inside")}>
							<Plus className="h-4 w-4" />
							{t("stylePanel.domTree.addText")}
						</DropdownMenuItem>
						<DropdownMenuItem onSelect={() => onAddImage("inside")}>
							<ImagePlus className="h-4 w-4" />
							{t("stylePanel.domTree.addImage")}
						</DropdownMenuItem>
					</>
				) : (
					<>
						<DropdownMenuLabel className="px-2 py-1 text-[10px] font-semibold text-muted-foreground">
							{t("stylePanel.domTree.insertBefore")}
						</DropdownMenuLabel>
						<DropdownMenuItem onSelect={() => onAddText("before")}>
							<Plus className="h-4 w-4" />
							{t("stylePanel.domTree.addTextBefore")}
						</DropdownMenuItem>
						<DropdownMenuItem onSelect={() => onAddImage("before")}>
							<ImagePlus className="h-4 w-4" />
							{t("stylePanel.domTree.addImageBefore")}
						</DropdownMenuItem>
						<DropdownMenuSeparator />
						<DropdownMenuLabel className="px-2 py-1 text-[10px] font-semibold text-muted-foreground">
							{t("stylePanel.domTree.insertAfter")}
						</DropdownMenuLabel>
						<DropdownMenuItem onSelect={() => onAddText("after")}>
							<Plus className="h-4 w-4" />
							{t("stylePanel.domTree.addTextAfter")}
						</DropdownMenuItem>
						<DropdownMenuItem onSelect={() => onAddImage("after")}>
							<ImagePlus className="h-4 w-4" />
							{t("stylePanel.domTree.addImageAfter")}
						</DropdownMenuItem>
					</>
				)}
			</EditorDropdownMenuContent>
		</DropdownMenu>
	)
}

function DOMTreePanelInner({
	editorRef,
	visible,
	onClose,
	selectedSelector,
	contentRevision = 0,
}: Props) {
	const { t } = useTranslation("super")
	const [tree, setTree] = useState<DomTreeResponse | null>(null)
	const [loadState, setLoadState] = useState<"loading" | "ready" | "error">("loading")
	const [expanded, setExpanded] = useState<Set<string>>(new Set())
	const [width, setWidth] = useState(360)
	const [draggedNodeId, setDraggedNodeId] = useState<string | null>(null)
	const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
	const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null)
	const [dropTarget, setDropTarget] = useState<{
		nodeId: string
		position: DropPosition
	} | null>(null)
	const [invalidDropTargetId, setInvalidDropTargetId] = useState<string | null>(null)
	const [actionError, setActionError] = useState<string | null>(null)
	const [isBusy, setIsBusy] = useState(false)
	const [isResizing, setIsResizing] = useState(false)
	const [textInsertRequest, setTextInsertRequest] = useState<TextInsertRequest | null>(null)
	const [textInput, setTextInput] = useState("")
	const [openAddMenuKey, setOpenAddMenuKey] = useState<string | null>(null)
	const [deleteRequest, setDeleteRequest] = useState<DeleteRequest | null>(null)
	const [clipboardNodeId, setClipboardNodeId] = useState<string | null>(null)
	const [clipboardMode, setClipboardMode] = useState<"copy" | "cut" | null>(null)
	const requestInFlightRef = useRef(false)
	const interactionLockedRef = useRef(false)
	const treeViewportRef = useRef<HTMLDivElement>(null)
	const autoScrollFrameRef = useRef<number | null>(null)
	const previousContentRevisionRef = useRef(contentRevision)
	const nodeButtonRefs = useRef(new Map<string, HTMLButtonElement>())
	const resetDragState = useCallback(() => {
		interactionLockedRef.current = false
		setDraggedNodeId(null)
		setDropTarget(null)
		setInvalidDropTargetId(null)
		if (autoScrollFrameRef.current !== null) {
			window.cancelAnimationFrame(autoScrollFrameRef.current)
			autoScrollFrameRef.current = null
		}
		void editorRef.current?.clearHoveredDomNode?.()
	}, [editorRef])
	const parentMap = useMemo(() => (tree ? flattenParents(tree.root) : new Map()), [tree])
	const nodeMap = useMemo(() => {
		const result = new Map<string, DomTreeNode>()
		const visit = (node: DomTreeNode) => {
			result.set(node.nodeId, node)
			node.children.forEach(visit)
		}
		if (tree) visit(tree.root)
		return result
	}, [tree])
	const allNodesExpanded = Boolean(tree && expanded.size >= nodeMap.size)
	const visibleNodeIds = useMemo(
		() => (tree ? collectVisibleNodeIds(tree.root, expanded) : []),
		[expanded, tree],
	)
	const focusableNodeIds = useMemo(
		() =>
			visibleNodeIds.filter((nodeId) => {
				const node = nodeMap.get(nodeId)
				return node ? isSelectableNode(node) : false
			}),
		[nodeMap, visibleNodeIds],
	)
	const draggedNode = draggedNodeId ? nodeMap.get(draggedNodeId) : undefined
	const dropTargetNode = dropTarget ? nodeMap.get(dropTarget.nodeId) : undefined
	const invalidDropTarget = invalidDropTargetId ? nodeMap.get(invalidDropTargetId) : undefined
	const toggleExpanded = useCallback((nodeId: string) => {
		setExpanded((current) => {
			const next = new Set(current)
			if (next.has(nodeId)) next.delete(nodeId)
			else next.add(nodeId)
			return next
		})
	}, [])
	const expandAll = useCallback(() => {
		if (tree) setExpanded(collectNodeIds(tree.root))
	}, [tree])
	const collapseAll = useCallback(() => {
		if (tree) setExpanded(new Set([tree.root.nodeId]))
	}, [tree])
	const getNodeHint = useCallback(
		(node: DomTreeNode) => {
			const reasonKey =
				node.disabledReason === "运行时或非可视节点"
					? "excluded"
					: node.disabledReason === "根节点不可移动或删除"
						? "root"
						: node.disabledReason === "节点定位不唯一"
							? "nonUnique"
							: null
			const reason =
				reasonKey === "excluded"
					? t("stylePanel.domTree.disabledReasons.excluded")
					: reasonKey === "root"
						? t("stylePanel.domTree.disabledReasons.root")
						: reasonKey === "nonUnique"
							? t("stylePanel.domTree.disabledReasons.nonUnique")
							: node.disabledReason
			const warning = node.dynamicWarning
				? node.dynamicWarning === "该节点可能由脚本重新渲染，修改后可能被覆盖"
					? t("stylePanel.domTree.dynamicWarning")
					: node.dynamicWarning
				: undefined
			return [reason, warning, node.selector].filter(Boolean).join(" · ")
		},
		[t],
	)

	const refresh = useCallback(
		async (force = false) => {
			// The bridge request can take several seconds while the iframe runtime activates.
			// Ignore a tick while one request is pending so polling cannot create a timeout queue.
			if (requestInFlightRef.current || (!force && interactionLockedRef.current)) return
			requestInFlightRef.current = true
			setLoadState((current) => (current === "ready" ? current : "loading"))
			try {
				const next = await editorRef.current?.getDomTree()
				if (!force && interactionLockedRef.current) return
				// A null result means the host bridge is not ready yet. Keep the loading
				// state so the next scheduled retry can render the tree without flashing an error.
				if (!next?.root) {
					setLoadState("loading")
					return
				}
				setTree(next)
				setLoadState("ready")
				if (next.clipboard) {
					if (next.clipboard.hasContent) {
						// The source node may have been cut and no longer exist in the tree.
						// A sentinel is enough here because the bridge owns the actual HTML.
						setClipboardNodeId("__runtime_clipboard__")
						setClipboardMode(next.clipboard.mode ?? "copy")
					} else {
						setClipboardNodeId(null)
						setClipboardMode(null)
					}
				}
				const nextNodeIds = collectNodeIds(next.root)
				setExpanded((current) => {
					// Expand the initial tree by default, then preserve the user's
					// disclosure choices while polling or after a structure edit.
					if (current.size === 0) return nextNodeIds
					const preserved = new Set(
						[...current].filter((nodeId) => nextNodeIds.has(nodeId)),
					)
					return preserved.size > 0 ? preserved : nextNodeIds
				})
				setSelectedNodeId((current) =>
					current && nextNodeIds.has(current) ? current : null,
				)
				setHoveredNodeId((current) =>
					current && nextNodeIds.has(current) ? current : null,
				)
			} catch (error) {
				console.warn("读取 DOM 树失败", error)
				setLoadState("error")
			} finally {
				requestInFlightRef.current = false
			}
		},
		[editorRef],
	)

	useEffect(() => {
		const editor = editorRef.current
		if (!visible) {
			setHoveredNodeId(null)
			resetDragState()
			void editor?.clearHoveredDomNode?.()
			return
		}
		setTree(null)
		setLoadState("loading")
		void refresh()
		const timer = window.setInterval(() => void refresh(), DOM_TREE_FALLBACK_REFRESH_INTERVAL)
		return () => {
			window.clearInterval(timer)
			resetDragState()
			void editor?.clearHoveredDomNode?.()
		}
	}, [editorRef, refresh, resetDragState, visible])

	useEffect(() => {
		if (!visible) {
			previousContentRevisionRef.current = contentRevision
			return
		}
		if (previousContentRevisionRef.current === contentRevision) return
		previousContentRevisionRef.current = contentRevision
		const timer = window.setTimeout(() => void refresh(), DOM_TREE_CONTENT_REFRESH_DELAY)
		return () => window.clearTimeout(timer)
	}, [contentRevision, refresh, visible])

	useEffect(() => {
		if (!selectedSelector) {
			setSelectedNodeId(null)
			return
		}
		const selectedNode = [...nodeMap.values()].find(
			(node) => node.selector === selectedSelector,
		)
		setSelectedNodeId(selectedNode?.nodeId ?? null)
	}, [nodeMap, selectedSelector])

	useEffect(() => {
		if (!draggedNodeId) return
		const handleKeyDown = (event: KeyboardEvent) => {
			if (event.key === "Escape") resetDragState()
		}
		const handleDragEnd = () => resetDragState()
		const handleWindowBlur = () => resetDragState()
		window.addEventListener("keydown", handleKeyDown)
		window.addEventListener("dragend", handleDragEnd)
		window.addEventListener("blur", handleWindowBlur)
		return () => {
			window.removeEventListener("keydown", handleKeyDown)
			window.removeEventListener("dragend", handleDragEnd)
			window.removeEventListener("blur", handleWindowBlur)
		}
	}, [draggedNodeId, resetDragState])

	const selectNode = async (node: DomTreeNode) => {
		if (!isSelectableNode(node)) return
		setSelectedNodeId(node.nodeId)
		try {
			await editorRef.current?.selectDomNode(node.nodeId)
			await editorRef.current?.scrollToDomNode(node.nodeId)
		} catch (error) {
			setSelectedNodeId(null)
			setActionError(
				error instanceof Error ? error.message : t("stylePanel.domTree.actionFailed"),
			)
		}
	}

	const isInvalidDrop = useCallback(
		(sourceId: string, targetId: string) => {
			if (sourceId === targetId) return true
			let current = nodeMap.get(targetId)
			while (current) {
				const parent = parentMap.get(current.nodeId)
				if (!parent) return false
				if (parent.nodeId === sourceId) return true
				current = parent
			}
			return false
		},
		[nodeMap, parentMap],
	)
	const scheduleAutoScroll = useCallback((direction: -1 | 1) => {
		if (autoScrollFrameRef.current !== null) return
		autoScrollFrameRef.current = window.requestAnimationFrame(() => {
			autoScrollFrameRef.current = null
			treeViewportRef.current?.scrollBy({ top: direction * 12, behavior: "auto" })
		})
	}, [])

	const runAction = useCallback(
		async (action: () => Promise<void>): Promise<boolean> => {
			if (isBusy) return false
			setActionError(null)
			setOpenAddMenuKey(null)
			setIsBusy(true)
			try {
				await action()
				await refresh(true)
				return true
			} catch (error) {
				setActionError(
					error instanceof Error ? error.message : t("stylePanel.domTree.actionFailed"),
				)
				return false
			} finally {
				setIsBusy(false)
			}
		},
		[isBusy, refresh, t],
	)

	const getInsertionTarget = (node: DomTreeNode, placement: InsertPlacement) => {
		if (placement === "inside") {
			return node.canHaveChildren ? { parent: node, index: undefined } : null
		}

		const parent = parentMap.get(node.nodeId)
		if (!parent) return null
		return {
			parent,
			index:
				parent.children.findIndex((child) => child.nodeId === node.nodeId) +
				(placement === "after" ? 1 : 0),
		}
	}

	const getPasteTarget = useCallback(
		(node: DomTreeNode) => {
			if (node.canHaveChildren && (node.editable || tree?.root.nodeId === node.nodeId)) {
				return { parentNodeId: node.nodeId, index: undefined }
			}
			const parent = parentMap.get(node.nodeId)
			if (!parent) return null
			const index = parent.children.findIndex((child) => child.nodeId === node.nodeId)
			return index < 0 ? null : { parentNodeId: parent.nodeId, index: index + 1 }
		},
		[parentMap, tree],
	)

	const addText = (node: DomTreeNode, placement: InsertPlacement) => {
		const target = getInsertionTarget(node, placement)
		if (!target) return
		setTextInput("")
		setTextInsertRequest({
			parentNodeId: target.parent.nodeId,
			index: target.index,
			targetLabel: node.label,
		})
	}

	const submitTextInsert = async () => {
		const request = textInsertRequest
		const text = textInput.trim()
		if (!request || !text) return
		setTextInsertRequest(null)
		await runAction(
			() =>
				editorRef.current?.insertTextNode(request.parentNodeId, text, request.index) ??
				Promise.resolve(),
		)
	}

	const addImage = async (node: DomTreeNode, placement: InsertPlacement) => {
		const target = getInsertionTarget(node, placement)
		if (!target) return
		await runAction(
			() =>
				editorRef.current?.insertImageNode(target.parent.nodeId, target.index) ??
				Promise.resolve(),
		)
	}

	const deleteNode = async (request: DeleteRequest) => {
		setDeleteRequest(null)
		await runAction(
			() => editorRef.current?.deleteElement(request.selector) ?? Promise.resolve(),
		)
	}

	const copyNode = async (node: DomTreeNode) => {
		if (!node.canMove) return
		const succeeded = await runAction(async () => {
			const editor = editorRef.current
			if (!editor?.copyDomNode) {
				throw new Error(t("stylePanel.domTree.bridgeUnavailable"))
			}
			await editor.copyDomNode(node.nodeId)
			setClipboardNodeId(node.nodeId)
			setClipboardMode("copy")
		})
		if (succeeded) magicToast.success(t("stylePanel.domTree.copySuccess"))
	}

	const cutNode = async (node: DomTreeNode) => {
		if (!node.canMove) return
		const succeeded = await runAction(async () => {
			const editor = editorRef.current
			if (!editor?.cutDomNode) {
				throw new Error(t("stylePanel.domTree.bridgeUnavailable"))
			}
			await editor.cutDomNode(node.nodeId)
			setClipboardNodeId(node.nodeId)
			setClipboardMode("cut")
		})
		if (succeeded) magicToast.success(t("stylePanel.domTree.cutSuccess"))
	}

	const pasteNode = async (node: DomTreeNode) => {
		if (!clipboardNodeId) return
		const target = getPasteTarget(node)
		if (!target) return
		const succeeded = await runAction(async () => {
			const editor = editorRef.current
			if (!editor?.pasteDomNode) {
				throw new Error(t("stylePanel.domTree.bridgeUnavailable"))
			}
			await editor.pasteDomNode(target.parentNodeId, target.index)
		})
		if (succeeded && clipboardMode === "cut") {
			setClipboardNodeId(null)
			setClipboardMode(null)
		}
		if (succeeded) magicToast.success(t("stylePanel.domTree.pasteSuccess"))
	}

	const getShortcutModifier = () =>
		typeof navigator !== "undefined" && navigator.platform.toUpperCase().includes("MAC")
			? "metaKey"
			: "ctrlKey"

	const handleNodeShortcut = async (
		event: React.KeyboardEvent<HTMLButtonElement>,
		node: DomTreeNode,
	) => {
		if (event.altKey || event.isComposing) return
		const modifier = getShortcutModifier()
		const hasModifier = modifier === "metaKey" ? event.metaKey : event.ctrlKey
		if (hasModifier && !event.shiftKey) {
			switch (event.key.toLowerCase()) {
				case "c":
					event.preventDefault()
					await copyNode(node)
					return
				case "x":
					event.preventDefault()
					await cutNode(node)
					return
				case "v":
					event.preventDefault()
					await pasteNode(node)
					return
			}
		}
	}

	const remove = async (node: DomTreeNode) => {
		if (!node.canDelete || !node.selector) return
		if (node.children.length > 0) {
			setDeleteRequest({ selector: node.selector, targetLabel: node.label })
			return
		}
		await deleteNode({ selector: node.selector, targetLabel: node.label })
	}

	const duplicate = async (node: DomTreeNode) => {
		if (!node.editable) return
		await runAction(
			() =>
				editorRef.current?.duplicateDomNode?.(node.nodeId) ??
				editorRef.current?.duplicateElement(node.selector) ??
				Promise.resolve(),
		)
	}

	const moveToAdjacent = async (node: DomTreeNode, direction: -1 | 1) => {
		const parent = parentMap.get(node.nodeId)
		if (!parent || !node.canMove) return
		const index = parent.children.findIndex((child) => child.nodeId === node.nodeId)
		// The runtime index is the insertion point before a child. Moving down
		// therefore skips both the current node and the next sibling.
		const targetIndex = direction < 0 ? index - 1 : index + 2
		if (targetIndex < 0 || targetIndex > parent.children.length) return
		await runAction(
			() =>
				editorRef.current?.moveDomNode(node.nodeId, parent.nodeId, targetIndex) ??
				Promise.resolve(),
		)
	}

	const dropNode = async (event: React.DragEvent, target: DomTreeNode) => {
		event.preventDefault()
		if (
			!draggedNodeId ||
			!dropTarget ||
			dropTarget.nodeId !== target.nodeId ||
			isInvalidDrop(draggedNodeId, target.nodeId)
		) {
			resetDragState()
			return
		}
		const position = dropTarget.position
		if (position === "inside") {
			if (
				!target.canHaveChildren ||
				(!target.editable && target.nodeId !== tree?.root.nodeId)
			) {
				resetDragState()
				return
			}
			await runAction(
				() =>
					editorRef.current?.moveDomNode(
						draggedNodeId,
						target.nodeId,
						target.children.length,
					) ?? Promise.resolve(),
			)
		} else {
			const parent = parentMap.get(target.nodeId)
			if (!parent) {
				resetDragState()
				return
			}
			const index = parent.children.findIndex((child) => child.nodeId === target.nodeId)
			await runAction(
				() =>
					editorRef.current?.moveDomNode(
						draggedNodeId,
						parent.nodeId,
						index + (position === "after" ? 1 : 0),
					) ?? Promise.resolve(),
			)
		}
		resetDragState()
	}

	const startResize = (event: React.PointerEvent<HTMLDivElement>) => {
		event.preventDefault()
		interactionLockedRef.current = true
		const resizeHandle = event.currentTarget
		resizeHandle.setPointerCapture?.(event.pointerId)
		setIsResizing(true)
		const startX = event.clientX
		const startWidth = width
		const move = (moveEvent: PointerEvent) => {
			setWidth(Math.min(440, Math.max(260, startWidth + startX - moveEvent.clientX)))
		}
		const stop = () => {
			interactionLockedRef.current = false
			setIsResizing(false)
			if (resizeHandle.hasPointerCapture?.(event.pointerId)) {
				resizeHandle.releasePointerCapture?.(event.pointerId)
			}
			window.removeEventListener("pointermove", move)
			window.removeEventListener("pointerup", stop)
			window.removeEventListener("pointercancel", stop)
			window.removeEventListener("blur", stop)
		}
		window.addEventListener("pointermove", move)
		window.addEventListener("pointerup", stop)
		window.addEventListener("pointercancel", stop)
		window.addEventListener("blur", stop)
	}

	if (!visible) return null
	const getSemanticLabel = (node?: DomTreeNode) =>
		node ? t(`stylePanel.domTree.semantic.${getSemanticKey(node.tagName)}`) : ""
	const getNodeDisplayLabel = (node?: DomTreeNode) =>
		node ? `${getSemanticLabel(node)} · ${node.label}` : ""
	const getDragStatus = () => {
		if (!draggedNode) return t("stylePanel.domTree.dragHint")
		if (invalidDropTarget) {
			return t("stylePanel.domTree.dropInvalid", {
				node: getNodeDisplayLabel(invalidDropTarget),
			})
		}
		if (!dropTarget || !dropTargetNode) {
			return t("stylePanel.domTree.dragging", {
				node: getNodeDisplayLabel(draggedNode),
			})
		}
		const key =
			dropTarget.position === "inside"
				? "dropInside"
				: dropTarget.position === "before"
					? "dropBefore"
					: "dropAfter"
		return t(`stylePanel.domTree.${key}`, {
			node: getNodeDisplayLabel(dropTargetNode),
		})
	}
	const dragStatusIcon = invalidDropTarget ? (
		<Ban className="h-3.5 w-3.5 shrink-0" />
	) : dropTarget?.position === "before" ? (
		<ArrowUp className="h-3.5 w-3.5 shrink-0" />
	) : dropTarget?.position === "after" ? (
		<ArrowDown className="h-3.5 w-3.5 shrink-0" />
	) : dropTarget?.position === "inside" ? (
		<CornerDownRight className="h-3.5 w-3.5 shrink-0" />
	) : (
		<GripVertical className="h-3.5 w-3.5 shrink-0" />
	)
	const renderNode = (node: DomTreeNode, depth = 0): React.ReactNode => {
		const isExpanded = expanded.has(node.nodeId)
		const semanticKey = getSemanticKey(node.tagName)
		const semanticLabel = t(`stylePanel.domTree.semantic.${semanticKey}`)
		const isRootNode =
			tree?.root.nodeId === node.nodeId || node.tagName.toLowerCase() === "body"
		const canInsertInside = node.canHaveChildren && (node.editable || isRootNode)
		const canInsertSibling = parentMap.has(node.nodeId) && node.editable
		const isDragged = draggedNodeId === node.nodeId
		const activeDropPosition = dropTarget?.nodeId === node.nodeId ? dropTarget.position : null
		const isInvalidDropTarget = invalidDropTargetId === node.nodeId
		const handleDragOver = (event: React.DragEvent<HTMLDivElement>) => {
			event.preventDefault()
			setHoveredNodeId(null)
			event.dataTransfer.dropEffect = "move"
			const viewport = treeViewportRef.current
			if (viewport && typeof viewport.scrollBy === "function") {
				const viewportRect = viewport.getBoundingClientRect()
				const edgeDistance = 28
				if (event.clientY < viewportRect.top + edgeDistance) {
					scheduleAutoScroll(-1)
				} else if (event.clientY > viewportRect.bottom - edgeDistance) {
					scheduleAutoScroll(1)
				}
			}
			const isInvalidTarget =
				!draggedNodeId ||
				isInvalidDrop(draggedNodeId, node.nodeId) ||
				(!node.canHaveChildren && !node.editable)
			if (isInvalidTarget) {
				event.dataTransfer.dropEffect = "none"
				setDropTarget(null)
				setInvalidDropTargetId((current) =>
					current === (draggedNodeId ? node.nodeId : null)
						? current
						: draggedNodeId
							? node.nodeId
							: null,
				)
				return
			}
			setInvalidDropTargetId(null)
			const rect = event.currentTarget.getBoundingClientRect()
			const ratio = rect.height > 0 ? (event.clientY - rect.top) / rect.height : 0
			const position: DropPosition =
				(tree?.root.nodeId === node.nodeId && node.canHaveChildren) ||
				(node.canHaveChildren && ratio >= 0.25 && ratio <= 0.75)
					? "inside"
					: ratio < 0.5
						? "before"
						: "after"
			if (
				(position === "inside" && !canInsertInside) ||
				(position !== "inside" && !canInsertSibling)
			) {
				setDropTarget(null)
				setInvalidDropTargetId(node.nodeId)
				event.dataTransfer.dropEffect = "none"
				return
			}
			setDropTarget((current) =>
				current?.nodeId === node.nodeId && current.position === position
					? current
					: { nodeId: node.nodeId, position },
			)
		}
		const handleDragEnd = () => {
			resetDragState()
		}
		return (
			<div key={node.nodeId} className="relative w-full min-w-0 max-w-full">
				<ContextMenu>
					<ContextMenuTrigger asChild>
						<div
							onDragOver={handleDragOver}
							onDragEnter={handleDragOver}
							onDragLeave={(event) => {
								if (
									event.relatedTarget instanceof Node &&
									event.currentTarget.contains(event.relatedTarget)
								)
									return
								if (dropTarget?.nodeId === node.nodeId) setDropTarget(null)
								if (invalidDropTargetId === node.nodeId)
									setInvalidDropTargetId(null)
							}}
							onDragEnd={handleDragEnd}
							onDrop={(event) => void dropNode(event, node)}
							className={cn(
								"group relative box-border grid h-8 max-h-8 min-h-8 w-full min-w-0 max-w-full select-none grid-cols-[20px_20px_minmax(0,1fr)] items-center gap-1 overflow-hidden whitespace-nowrap rounded-none border border-transparent bg-card/45 px-1.5 pr-1 text-[11px] leading-none shadow-[inset_0_-1px_0_hsl(var(--border)/0.14)] transition-[background-color,border-color,box-shadow,opacity] duration-150 ease-out motion-reduce:transition-none",
								node.canMove
									? "cursor-grab active:cursor-grabbing"
									: "cursor-default",
								"focus-within:border-border focus-within:bg-muted/75 hover:border-border/60 hover:bg-muted/55",
								hoveredNodeId === node.nodeId &&
									selectedNodeId !== node.nodeId &&
									"border-primary/35 bg-accent/60 text-foreground shadow-[inset_3px_0_0_hsl(var(--primary)/0.85)]",
								selectedNodeId === node.nodeId &&
									"border-sky-400/70 bg-sky-50/80 text-foreground shadow-[inset_2px_0_0_rgb(14_165_233),inset_0_0_0_1px_rgb(14_165_233_/_0.18)] dark:border-sky-500/60 dark:bg-sky-950/25",
								isDragged &&
									"z-20 cursor-grabbing border-dashed border-primary/80 bg-primary/20 opacity-60 ring-2 ring-inset ring-primary/65",
								isBusy && "cursor-wait",
								draggedNodeId && !isDragged && !activeDropPosition && "opacity-85",
								!node.editable && !node.canHaveChildren && "opacity-50",
								activeDropPosition === "inside" &&
									"z-10 border-primary/70 bg-primary/15 ring-2 ring-inset ring-primary/75",
								isInvalidDropTarget &&
									"z-10 border-destructive/65 bg-destructive/10 text-destructive ring-2 ring-inset ring-destructive/70",
							)}
							style={{ paddingLeft: depth * DOM_TREE_INDENT_STEP + 3 }}
							data-node-id={node.nodeId}
							data-testid={`dom-tree-node-${node.nodeId}`}
							role="treeitem"
							aria-level={depth + 1}
							aria-expanded={node.children.length > 0 ? isExpanded : undefined}
							data-dragging={isDragged ? "true" : undefined}
							data-drop-position={activeDropPosition ?? undefined}
							data-drop-invalid={isInvalidDropTarget ? "true" : undefined}
							data-state={
								isDragged
									? "dragging"
									: isInvalidDropTarget
										? "drop-invalid"
										: activeDropPosition
											? `drop-${activeDropPosition}`
											: selectedNodeId === node.nodeId
												? "selected"
												: hoveredNodeId === node.nodeId
													? "hovered"
													: "idle"
							}
							aria-selected={selectedNodeId === node.nodeId}
							aria-grabbed={isDragged}
							onMouseEnter={() => {
								setHoveredNodeId(node.nodeId)
								if (!draggedNodeId && isSelectableNode(node)) {
									void editorRef.current?.hoverDomNode?.(node.nodeId)
								} else if (!draggedNodeId) {
									void editorRef.current?.clearHoveredDomNode?.()
								}
							}}
							onMouseLeave={() => {
								setHoveredNodeId((current) =>
									current === node.nodeId ? null : current,
								)
								void editorRef.current?.clearHoveredDomNode?.()
							}}
						>
							{Array.from({ length: depth }).map((_, index) => (
								<span
									key={`guide-${index}`}
									className="pointer-events-none absolute inset-y-0 w-px bg-border/35"
									style={{ left: index * DOM_TREE_INDENT_STEP + 15 }}
								/>
							))}
							{activeDropPosition === "before" ? (
								<span className="pointer-events-none absolute inset-x-2 top-0 z-10 flex h-0.5 items-center justify-end bg-primary shadow-[0_0_0_1px_hsl(var(--primary)/0.15)] transition-[box-shadow] duration-150 motion-reduce:transition-none">
									<span className="absolute right-0 top-0 flex items-center gap-1 border border-primary/40 bg-primary px-1.5 py-0.5 text-[9px] font-medium text-primary-foreground shadow-md">
										<ArrowUp className="h-2.5 w-2.5" />
										{t("stylePanel.domTree.dropBeforeShort")}
									</span>
								</span>
							) : null}
							{activeDropPosition === "after" ? (
								<span className="pointer-events-none absolute inset-x-2 bottom-0 z-10 flex h-0.5 items-center justify-end bg-primary shadow-[0_0_0_1px_hsl(var(--primary)/0.15)] transition-[box-shadow] duration-150 motion-reduce:transition-none">
									<span className="absolute bottom-0 right-0 flex items-center gap-1 border border-primary/40 bg-primary px-1.5 py-0.5 text-[9px] font-medium text-primary-foreground shadow-md">
										<ArrowDown className="h-2.5 w-2.5" />
										{t("stylePanel.domTree.dropAfterShort")}
									</span>
								</span>
							) : null}
							{activeDropPosition === "inside" ? (
								<span className="pointer-events-none absolute inset-0.5 z-10 flex items-center justify-end border-2 border-dashed border-primary/70 bg-primary/10 px-2 shadow-[inset_0_0_0_1px_hsl(var(--primary)/0.15)] transition-[background-color,box-shadow] duration-150 motion-reduce:transition-none">
									<span className="flex items-center gap-1 border border-primary/40 bg-primary px-1.5 py-0.5 text-[9px] font-medium text-primary-foreground shadow-md">
										<ArrowDown className="h-2.5 w-2.5" />
										{t("stylePanel.domTree.dropInsideShort")}
									</span>
								</span>
							) : null}
							{isInvalidDropTarget ? (
								<span className="pointer-events-none absolute inset-x-1 inset-y-0.5 z-10 flex min-w-0 items-center justify-center gap-1 rounded-none border border-destructive/45 bg-destructive/15 px-2 text-[9px] font-semibold text-destructive shadow-sm backdrop-blur-sm">
									<Ban className="h-2.5 w-2.5 shrink-0" />
									<span className="truncate">
										{t("stylePanel.domTree.dropInvalid", {
											node: getNodeDisplayLabel(node),
										})}
									</span>
								</span>
							) : null}
							{node.children.length > 0 ? (
								<ActionTooltip
									label={
										isExpanded
											? t("stylePanel.domTree.collapseNode")
											: t("stylePanel.domTree.expand")
									}
								>
									<button
										type="button"
										className="z-10 flex h-full w-5 shrink-0 items-center justify-center rounded-none text-muted-foreground transition-[background-color,color,transform] duration-150 hover:bg-background hover:text-foreground active:scale-[0.96]"
										onClick={() => toggleExpanded(node.nodeId)}
										aria-label={
											isExpanded
												? t("stylePanel.domTree.collapseNode")
												: t("stylePanel.domTree.expand")
										}
										data-testid={`dom-tree-toggle-${node.nodeId}`}
									>
										<span
											className={cn(
												"inline-flex transition-transform duration-200 ease-out motion-reduce:transition-none",
												isExpanded && "rotate-90",
											)}
										>
											<ChevronRight className="h-3.5 w-3.5" />
										</span>
									</button>
								</ActionTooltip>
							) : (
								<span className="h-full w-5 shrink-0" aria-hidden="true" />
							)}
							<ActionTooltip
								label={node.canMove ? t("stylePanel.domTree.dragHandle") : ""}
								side="left"
							>
								<span
									className={cn(
										"flex h-full w-5 shrink-0 items-center justify-center rounded-none text-muted-foreground/45 transition-[background-color,color,transform] duration-150 motion-reduce:transition-none",
										node.canMove &&
											"group-hover:bg-muted/70 group-hover:text-muted-foreground",
										node.canMove && "cursor-grab active:cursor-grabbing",
									)}
									draggable={node.canMove}
									onDragStart={(event) => {
										if (!node.canMove) return
										interactionLockedRef.current = true
										setActionError(null)
										setOpenAddMenuKey(null)
										setHoveredNodeId(null)
										setInvalidDropTargetId(null)
										setDropTarget(null)
										setDraggedNodeId(node.nodeId)
										event.dataTransfer.effectAllowed = "move"
										event.dataTransfer.setData("text/plain", node.nodeId)
										if (event.dataTransfer.setDragImage) {
											const preview = createDragPreview(
												`${semanticLabel} · ${node.label}`,
											)
											event.dataTransfer.setDragImage(preview, 12, 16)
											window.requestAnimationFrame(() => preview.remove())
										}
									}}
									aria-label={
										node.canMove
											? t("stylePanel.domTree.dragHandle")
											: undefined
									}
									aria-hidden={node.canMove ? undefined : true}
									data-testid={`dom-tree-drag-handle-${node.nodeId}`}
								>
									<GripVertical className="h-3.5 w-3.5" />
								</span>
							</ActionTooltip>
							<button
								type="button"
								disabled={!isSelectableNode(node) || isBusy}
								ref={(element) => {
									if (element) nodeButtonRefs.current.set(node.nodeId, element)
									else nodeButtonRefs.current.delete(node.nodeId)
								}}
								className="col-start-3 flex h-full min-h-0 min-w-0 items-center gap-1 overflow-hidden whitespace-nowrap rounded-none text-left leading-none outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary/50"
								onClick={() => void selectNode(node)}
								onKeyDown={(event) => {
									if (
										(event.metaKey || event.ctrlKey) &&
										!event.shiftKey &&
										!event.altKey &&
										["c", "x", "v"].includes(event.key.toLowerCase())
									) {
										event.preventDefault()
										void handleNodeShortcut(event, node)
										return
									}
									if (
										event.key === "ArrowUp" ||
										event.key === "ArrowDown" ||
										event.key === "Home" ||
										event.key === "End"
									) {
										event.preventDefault()
										const currentIndex = focusableNodeIds.indexOf(node.nodeId)
										const nextIndex =
											event.key === "Home"
												? 0
												: event.key === "End"
													? focusableNodeIds.length - 1
													: currentIndex +
														(event.key === "ArrowDown" ? 1 : -1)
										const nextNodeId = focusableNodeIds[nextIndex]
										if (nextNodeId)
											nodeButtonRefs.current.get(nextNodeId)?.focus()
										return
									}
									if (event.key === "ArrowRight" && node.children.length > 0) {
										event.preventDefault()
										if (!isExpanded) toggleExpanded(node.nodeId)
										return
									}
									if (event.key === "ArrowLeft" && node.children.length > 0) {
										event.preventDefault()
										if (isExpanded) toggleExpanded(node.nodeId)
										return
									}
									if (
										(event.key === "Delete" || event.key === "Backspace") &&
										node.canDelete
									) {
										event.preventDefault()
										void remove(node)
										return
									}
									if (
										(event.metaKey || event.ctrlKey) &&
										event.key.toLowerCase() === "d" &&
										node.editable &&
										node.selector
									) {
										event.preventDefault()
										void duplicate(node)
									}
								}}
								data-testid={`dom-tree-node-content-${node.nodeId}`}
							>
								<NodeDetailsPopover
									content={
										<div className="flex max-w-72 flex-col gap-1">
											<span className="font-mono text-xs font-semibold text-background">
												{node.label}
											</span>
											{node.textContent ? (
												<span className="max-w-72 whitespace-normal break-words text-[11px] text-background/80">
													{node.textContent}
												</span>
											) : null}
											{getNodeHint(node) ? (
												<span className="max-w-72 whitespace-normal break-words text-[10px] leading-4 text-background/70">
													{getNodeHint(node)}
												</span>
											) : null}
										</div>
									}
								>
									<span
										className={cn(
											"inline-flex h-5 min-h-5 min-w-0 max-w-full shrink-0 items-center truncate rounded-sm border px-1.5 text-[10px] font-medium leading-4 transition-colors duration-150 motion-reduce:transition-none",
											getSemanticTone(semanticKey),
										)}
										data-testid={`dom-tree-node-tag-${node.nodeId}`}
									>
										<span className="truncate">{semanticLabel}</span>
									</span>
								</NodeDetailsPopover>
								{node.dynamicWarning ? (
									<ActionTooltip label={getNodeHint(node)}>
										<span
											className="inline-flex h-5 w-5 shrink-0 items-center justify-center text-amber-600 dark:text-amber-400"
											aria-label={getNodeHint(node)}
										>
											<AlertTriangle className="h-3 w-3" />
										</span>
									</ActionTooltip>
								) : null}
								{node.textContent ? (
									<span className="min-w-0 flex-1 truncate text-[11px] text-muted-foreground">
										· {node.textContent}
									</span>
								) : null}
								{node.tagName.toLowerCase() === "img" && node.resource ? (
									<span className="flex min-w-0 max-w-[42%] flex-1 items-center gap-1 overflow-hidden text-[10px] text-muted-foreground/75">
										<ImageIcon className="h-3 w-3 shrink-0" />
										<span className="min-w-0 flex-1 truncate">
											{node.resource}
										</span>
									</span>
								) : null}
							</button>
							<span
								className={cn(
									"pointer-events-none absolute inset-y-1 right-1 z-20 flex h-auto w-[128px] min-w-0 max-w-[calc(100%_-_8px)] items-center justify-end gap-1 overflow-hidden rounded-md border border-border/70 bg-background/95 px-1 opacity-0 shadow-sm transition-[opacity,transform,background-color] duration-150 group-focus-within:pointer-events-auto group-focus-within:translate-x-0 group-focus-within:opacity-100 group-hover:pointer-events-auto group-hover:translate-x-0 group-hover:opacity-100",
									"translate-x-1",
									selectedNodeId === node.nodeId &&
										"bg-sky-50/95 dark:bg-sky-950/95",
									isBusy && "pointer-events-none",
									draggedNodeId && "pointer-events-none opacity-0",
								)}
								aria-hidden={
									node.editable || canInsertInside || canInsertSibling
										? undefined
										: true
								}
								data-testid={`dom-tree-actions-${node.nodeId}`}
							>
								{node.editable || canInsertInside || canInsertSibling ? (
									<>
										{parentMap.has(node.nodeId) ? (
											<>
												<ActionTooltip
													label={t("stylePanel.domTree.moveUp")}
												>
													<Button
														size="icon"
														variant="ghost"
														className="h-5 w-5 rounded-sm active:scale-[0.96]"
														disabled={
															isBusy ||
															parentMap.get(node.nodeId)?.children[0]
																?.nodeId === node.nodeId
														}
														onClick={() =>
															void moveToAdjacent(node, -1)
														}
														aria-label={t("stylePanel.domTree.moveUp")}
													>
														<ArrowUp className="h-3 w-3" />
													</Button>
												</ActionTooltip>
												<ActionTooltip
													label={t("stylePanel.domTree.moveDown")}
												>
													<Button
														size="icon"
														variant="ghost"
														className="h-5 w-5 rounded-sm active:scale-[0.96]"
														disabled={
															isBusy ||
															parentMap
																.get(node.nodeId)
																?.children.at(-1)?.nodeId ===
																node.nodeId
														}
														onClick={() => void moveToAdjacent(node, 1)}
														aria-label={t(
															"stylePanel.domTree.moveDown",
														)}
													>
														<ArrowDown className="h-3 w-3" />
													</Button>
												</ActionTooltip>
											</>
										) : null}
										{canInsertInside ? (
											<AddNodeMenu
												mode="inside"
												open={openAddMenuKey === `${node.nodeId}:inside`}
												onOpenChange={(open) =>
													setOpenAddMenuKey(
														open ? `${node.nodeId}:inside` : null,
													)
												}
												onAddText={(placement) =>
													void addText(node, placement)
												}
												onAddImage={(placement) =>
													void addImage(node, placement)
												}
												label={t("stylePanel.domTree.addInsideAction")}
												testId={`dom-tree-add-${node.nodeId}`}
												disabled={isBusy}
											/>
										) : null}
										{canInsertSibling ? (
											<AddNodeMenu
												mode="sibling"
												open={openAddMenuKey === `${node.nodeId}:sibling`}
												onOpenChange={(open) =>
													setOpenAddMenuKey(
														open ? `${node.nodeId}:sibling` : null,
													)
												}
												onAddText={(placement) =>
													void addText(node, placement)
												}
												onAddImage={(placement) =>
													void addImage(node, placement)
												}
												label={t("stylePanel.domTree.addSiblingAction")}
												testId={`dom-tree-add-sibling-${node.nodeId}`}
												disabled={isBusy}
											/>
										) : null}
										{node.canDelete ? (
											<ActionTooltip label={t("stylePanel.domTree.delete")}>
												<Button
													size="icon"
													variant="ghost"
													className="h-5 w-5 rounded-sm text-destructive active:scale-[0.96]"
													disabled={isBusy}
													onClick={() => void remove(node)}
													aria-label={t("stylePanel.domTree.delete")}
												>
													<Trash2 className="h-3 w-3" />
												</Button>
											</ActionTooltip>
										) : null}
									</>
								) : null}
							</span>
						</div>
					</ContextMenuTrigger>
					<DOMTreeContextMenu
						node={node}
						semanticLabel={semanticLabel}
						nodeHint={getNodeHint(node)}
						isExpanded={isExpanded}
						isBusy={isBusy}
						canInsertInside={canInsertInside}
						canInsertSibling={canInsertSibling}
						canMoveBefore={
							node.canMove &&
							parentMap.get(node.nodeId)?.children[0]?.nodeId !== node.nodeId
						}
						canMoveAfter={
							node.canMove &&
							parentMap.get(node.nodeId)?.children.at(-1)?.nodeId !== node.nodeId
						}
						onSelect={() => void selectNode(node)}
						onCopy={() => void copyNode(node)}
						onCut={() => void cutNode(node)}
						onPaste={() => void pasteNode(node)}
						onDuplicate={() => void duplicate(node)}
						onToggleExpanded={() => toggleExpanded(node.nodeId)}
						onMoveBefore={() => void moveToAdjacent(node, -1)}
						onMoveAfter={() => void moveToAdjacent(node, 1)}
						onAddText={(placement) => void addText(node, placement)}
						onAddImage={(placement) => void addImage(node, placement)}
						onDelete={() => void remove(node)}
						canPaste={Boolean(clipboardNodeId && getPasteTarget(node))}
					/>
				</ContextMenu>
				{node.children.length > 0 ? (
					<div
						data-testid={`dom-tree-children-${node.nodeId}`}
						role="group"
						aria-hidden={!isExpanded}
						data-inert={!isExpanded ? "true" : undefined}
						ref={(element) => {
							if (!element) return
							const inertElement = element as HTMLDivElement & { inert?: boolean }
							if ("inert" in inertElement) inertElement.inert = !isExpanded
							else if (!isExpanded) inertElement.setAttribute("inert", "")
							else inertElement.removeAttribute("inert")
						}}
						className={cn(
							"grid transition-[grid-template-rows,opacity,filter] duration-200 ease-out motion-reduce:transition-none",
							isExpanded
								? "grid-rows-[1fr] opacity-100 blur-0"
								: "pointer-events-none grid-rows-[0fr] opacity-0 blur-[2px]",
						)}
					>
						<div className="min-h-0 overflow-hidden">
							{node.children.map((child) => renderNode(child, depth + 1))}
						</div>
					</div>
				) : null}
			</div>
		)
	}

	return (
		<TooltipProvider delayDuration={200}>
			<aside
				className="relative my-2 flex h-[calc(100%_-_1rem)] min-h-0 min-w-[260px] max-w-[520px] shrink-0 flex-col overflow-hidden rounded-xl border border-border/80 bg-background/95 shadow-[-10px_0_24px_-18px_rgba(15,23,42,0.5)] backdrop-blur supports-[backdrop-filter]:bg-background/85"
				style={{
					width,
					minWidth: "min(260px, 100%)",
					maxWidth: "min(520px, 100%)",
				}}
				data-testid="html-dom-tree-panel"
				aria-label={t("stylePanel.domTree.title")}
				aria-busy={isBusy || loadState === "loading"}
				data-resizing={isResizing ? "true" : undefined}
			>
				<ActionTooltip label={t("stylePanel.domTree.resize")} side="left">
					<div
						className={cn(
							"group absolute inset-y-0 left-0 z-30 w-1 cursor-col-resize bg-transparent transition-colors hover:bg-primary/60",
							isResizing && "bg-primary",
						)}
						onPointerDown={startResize}
						role="separator"
						aria-label={t("stylePanel.domTree.resize")}
						aria-valuemin={260}
						aria-valuemax={520}
						aria-valuenow={width}
					/>
				</ActionTooltip>
				<div className="flex h-11 shrink-0 items-center gap-2 border-b border-border/80 bg-card/95 px-3 text-sm font-medium">
					<div className="flex min-w-0 flex-1 items-center gap-2">
						<span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-primary/25 bg-primary/10 text-primary">
							<Layers3 className="h-4 w-4" />
						</span>
						<div className="flex min-w-0 items-center gap-2">
							<span className="min-w-0 truncate text-[13px] font-semibold tracking-tight">
								{t("stylePanel.domTree.title")}
							</span>
							{tree && loadState === "ready" ? (
								<span className="shrink-0 rounded-md border border-border/80 bg-muted/55 px-1.5 py-0.5 text-[10px] font-medium tabular-nums text-muted-foreground">
									{t("stylePanel.domTree.nodeCount", { count: nodeMap.size })}
								</span>
							) : null}
						</div>
					</div>
					<ActionTooltip
						label={t(
							allNodesExpanded
								? "stylePanel.domTree.collapseAll"
								: "stylePanel.domTree.expandAll",
						)}
					>
						<Button
							size="icon"
							variant="ghost"
							className="h-7 w-7 shrink-0 rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
							disabled={!tree || loadState !== "ready" || Boolean(draggedNodeId)}
							onClick={allNodesExpanded ? collapseAll : expandAll}
							aria-label={t(
								allNodesExpanded
									? "stylePanel.domTree.collapseAll"
									: "stylePanel.domTree.expandAll",
							)}
						>
							{allNodesExpanded ? (
								<ChevronsUpDown className="h-3.5 w-3.5" />
							) : (
								<ChevronsDownUp className="h-3.5 w-3.5" />
							)}
						</Button>
					</ActionTooltip>
					<ActionTooltip label={t("stylePanel.domTree.refresh")}>
						<Button
							size="icon"
							variant="ghost"
							className="h-7 w-7 shrink-0 rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
							disabled={
								loadState === "loading" || Boolean(draggedNodeId) || isResizing
							}
							onClick={() => void refresh()}
							aria-label={t("stylePanel.domTree.refresh")}
						>
							<RefreshCw className="h-3.5 w-3.5" />
						</Button>
					</ActionTooltip>
					<ActionTooltip label={t("stylePanel.domTree.close")}>
						<button
							type="button"
							onClick={onClose}
							aria-label={t("stylePanel.domTree.close")}
							className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
						>
							<X className="h-3.5 w-3.5" />
						</button>
					</ActionTooltip>
				</div>
				<div
					className={cn(
						"flex h-8 min-h-8 shrink-0 items-center gap-2 border-b px-3 text-[11px] font-medium transition-[background-color,border-color,color] duration-150 ease-out motion-reduce:transition-none",
						draggedNodeId
							? invalidDropTargetId
								? "border-destructive/30 bg-destructive/10 text-destructive"
								: dropTarget
									? "border-primary/25 bg-primary/10 text-primary"
									: "border-border/70 bg-muted/15 text-muted-foreground"
							: "border-border/70 bg-muted/10 text-muted-foreground",
					)}
					role="status"
					aria-live="polite"
					data-drag-active={draggedNodeId ? "true" : undefined}
				>
					<span
						className={cn(
							"flex h-5 w-5 shrink-0 items-center justify-center rounded-sm bg-muted-foreground/10 text-muted-foreground transition-[background-color,color,transform] duration-150 motion-reduce:transition-none",
							draggedNodeId &&
								(invalidDropTargetId
									? "bg-destructive/15 text-destructive"
									: dropTarget
										? "bg-primary/15 text-primary"
										: "bg-amber-500/15 text-amber-600 ring-1 ring-inset ring-amber-500/20"),
						)}
					>
						{dragStatusIcon}
					</span>
					<span className="min-w-0 truncate">{getDragStatus()}</span>
				</div>
				<ScrollArea
					type="always"
					className="min-h-0 min-w-0 flex-1 overflow-hidden [&_[data-slot='scroll-area-viewport']>div]:!block [&_[data-slot='scroll-area-viewport']>div]:!w-full"
					viewportRef={treeViewportRef}
					viewportClassName="h-full min-h-0 min-w-0 overflow-x-hidden bg-muted/10 pr-4"
					viewportStyle={{ overflowX: "hidden", overflowY: "auto" }}
					onWheel={(event) => event.stopPropagation()}
				>
					{actionError ? (
						<div
							className="mx-2 mt-2 border border-destructive/30 bg-destructive/10 px-2 py-1.5 text-xs text-destructive"
							role="alert"
						>
							{actionError}
						</div>
					) : null}
					{tree && loadState === "ready" ? (
						<div
							className="w-full min-w-0 max-w-full overflow-hidden px-1.5 py-1.5"
							role="tree"
							aria-label={t("stylePanel.domTree.title")}
						>
							{renderNode(tree.root)}
						</div>
					) : loadState === "error" ? (
						<div className="flex flex-col gap-2 p-3 text-xs text-muted-foreground">
							<span>{t("stylePanel.domTree.loadFailed")}</span>
							<Button size="sm" variant="outline" onClick={() => void refresh()}>
								{t("stylePanel.domTree.retry")}
							</Button>
						</div>
					) : (
						<div className="p-3 text-xs text-muted-foreground">
							{t("stylePanel.domTree.loading")}
						</div>
					)}
				</ScrollArea>
				<Dialog
					open={textInsertRequest !== null}
					onOpenChange={(open) => {
						if (!open) setTextInsertRequest(null)
					}}
				>
					<DialogContent
						className="!z-[10080] max-w-md gap-5 rounded-xl border-border/80 p-5 shadow-2xl"
						overlayClassName="!z-[10075]"
					>
						<DialogHeader className="gap-1.5 text-left">
							<DialogTitle>{t("stylePanel.domTree.addTextDialog.title")}</DialogTitle>
							<DialogDescription>
								{t("stylePanel.domTree.addTextDialog.description", {
									node: textInsertRequest?.targetLabel ?? "",
								})}
							</DialogDescription>
						</DialogHeader>
						<form
							className="space-y-4"
							onSubmit={(event) => {
								event.preventDefault()
								void submitTextInsert()
							}}
						>
							<Input
								autoFocus
								value={textInput}
								onChange={(event) => setTextInput(event.target.value)}
								placeholder={t("stylePanel.domTree.addTextDialog.placeholder")}
								maxLength={500}
								aria-label={t("stylePanel.domTree.addTextDialog.inputLabel")}
							/>
							<DialogFooter>
								<Button
									type="button"
									variant="outline"
									onClick={() => setTextInsertRequest(null)}
								>
									{t("stylePanel.domTree.addTextDialog.cancel")}
								</Button>
								<Button type="submit" disabled={!textInput.trim() || isBusy}>
									{t("stylePanel.domTree.addTextDialog.confirm")}
								</Button>
							</DialogFooter>
						</form>
					</DialogContent>
				</Dialog>
				<Dialog
					open={deleteRequest !== null}
					onOpenChange={(open) => {
						if (!open) setDeleteRequest(null)
					}}
				>
					<DialogContent
						className="!z-[10080] max-w-md gap-5 rounded-xl border-border/80 p-5 shadow-2xl"
						overlayClassName="!z-[10075]"
					>
						<DialogHeader className="gap-1.5 text-left">
							<DialogTitle>{t("stylePanel.domTree.deleteDialog.title")}</DialogTitle>
							<DialogDescription>
								{t("stylePanel.domTree.deleteDialog.description", {
									node: deleteRequest?.targetLabel ?? "",
								})}
							</DialogDescription>
						</DialogHeader>
						<DialogFooter>
							<Button
								type="button"
								variant="outline"
								onClick={() => setDeleteRequest(null)}
							>
								{t("stylePanel.domTree.deleteDialog.cancel")}
							</Button>
							<Button
								type="button"
								variant="destructive"
								disabled={isBusy || !deleteRequest}
								onClick={() => {
									if (deleteRequest) void deleteNode(deleteRequest)
								}}
							>
								{t("stylePanel.domTree.deleteDialog.confirm")}
							</Button>
						</DialogFooter>
					</DialogContent>
				</Dialog>
			</aside>
		</TooltipProvider>
	)
}

// Zoom state is owned by the renderer above this panel. Keep the recursive tree
// out of that high-frequency render path when its own inputs are unchanged.
export const DOMTreePanel = React.memo(DOMTreePanelInner)
DOMTreePanel.displayName = "DOMTreePanel"
