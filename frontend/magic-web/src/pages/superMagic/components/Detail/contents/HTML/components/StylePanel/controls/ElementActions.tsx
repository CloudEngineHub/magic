import { observer } from "mobx-react-lite"
import { useCallback, useEffect, useRef, useState } from "react"
import { ArrowDown, ArrowUp, Copy, ImagePlus, ImageUp, Trash2, Type } from "lucide-react"
import { Button } from "@/components/shadcn-ui/button"
import { Input } from "@/components/shadcn-ui/input"
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/shadcn-ui/dialog"
import { MagicTooltip } from "@/components/base"
import { useTranslation } from "react-i18next"
import type { HTMLEditorV2Ref } from "../../../iframe-bridge/types/props"
import type { DomTreeNode } from "../../../iframe-bridge/types/messages"
import { useStylePanelStore } from "../../../iframe-bridge/contexts/StylePanelContext"
import { HTML_EDITOR_Z_INDEX } from "../../../constants/z-index"

interface ElementActionsProps {
	editorRef: React.RefObject<HTMLEditorV2Ref>
	disabled?: boolean
}

interface TextInsertRequest {
	parentNodeId: string
	targetLabel: string
}

function findNodeBySelector(node: DomTreeNode, selector: string): DomTreeNode | null {
	if (node.selector === selector) return node
	for (const child of node.children) {
		const match = findNodeBySelector(child, selector)
		if (match) return match
	}
	return null
}

interface NodeContext {
	node: DomTreeNode
	parent: DomTreeNode | null
	index: number
}

function findNodeContext(
	node: DomTreeNode,
	selector: string,
	parent: DomTreeNode | null = null,
): NodeContext | null {
	if (node.selector === selector) {
		return {
			node,
			parent,
			index: parent?.children.findIndex((child) => child.nodeId === node.nodeId) ?? -1,
		}
	}
	for (const child of node.children) {
		const match = findNodeContext(child, selector, node)
		if (match) return match
	}
	return null
}

interface AddElementButtonProps {
	icon: React.ReactNode
	label: string
	tooltip?: string
	testId: string
	disabled: boolean
	onClick: () => void
}

function AddElementButton({
	icon,
	label,
	tooltip = label,
	testId,
	disabled,
	onClick,
}: AddElementButtonProps) {
	return (
		<MagicTooltip title={tooltip} contentZIndex={HTML_EDITOR_Z_INDEX.EDITOR_FLOATING.TOOLTIP}>
			<span className="inline-flex">
				<Button
					variant="ghost"
					size="sm"
					disabled={disabled}
					onClick={onClick}
					className="h-7 w-7 px-0"
					data-testid={testId}
					aria-label={label}
				>
					{icon}
				</Button>
			</span>
		</MagicTooltip>
	)
}

/**
 * Element action buttons (delete, duplicate)
 * Displayed in the style panel toolbar
 */
export const ElementActions = observer(function ElementActions({
	editorRef,
	disabled = false,
}: ElementActionsProps) {
	const { t } = useTranslation("super")
	const stylePanelStore = useStylePanelStore()
	const historyIndex = stylePanelStore.historyState.currentIndex
	const selectors = stylePanelStore.getSelectedSelectors()
	const hasSingleSelection = selectors.length === 1
	const selectedSelector = hasSingleSelection ? selectors[0] : null
	const isSingleImageSelected =
		hasSingleSelection && stylePanelStore.selectedElement?.tagName?.toLowerCase() === "img"

	// Refs to prevent duplicate operations
	const isDeleteInProgressRef = useRef(false)
	const isDuplicateInProgressRef = useRef(false)
	const isReplaceImageInProgressRef = useRef(false)
	const isInsertInProgressRef = useRef(false)
	const isMoveInProgressRef = useRef(false)
	const [textInsertRequest, setTextInsertRequest] = useState<TextInsertRequest | null>(null)
	const [textInput, setTextInput] = useState("")
	const [isTextInsertSubmitting, setIsTextInsertSubmitting] = useState(false)
	const [moveState, setMoveState] = useState({ canMoveUp: false, canMoveDown: false })
	const previousSelectedSelectorRef = useRef<string | null>(null)

	/**
	 * Handle delete element
	 * Only works in single-select mode
	 */
	const handleDelete = useCallback(async () => {
		// Prevent duplicate delete operations
		if (isDeleteInProgressRef.current) {
			console.log("[StylePanel] Delete already in progress, ignoring")
			return
		}

		// Get selected element (single-select only)
		const selectors = stylePanelStore.getSelectedSelectors()
		if (selectors.length !== 1) {
			console.warn("[StylePanel] Delete requires exactly one selected element")
			return
		}

		if (!editorRef?.current) {
			console.warn("[StylePanel] No editor ref")
			return
		}

		try {
			isDeleteInProgressRef.current = true
			console.log("[StylePanel] Deleting element:", selectors[0])
			await editorRef.current.deleteElement(selectors[0])
			console.log("[StylePanel] Element deleted successfully")
		} catch (error) {
			console.error("[StylePanel] Failed to delete element:", error)
		} finally {
			// Reset flag after operation completes
			setTimeout(() => {
				isDeleteInProgressRef.current = false
			}, 300)
		}
	}, [editorRef, stylePanelStore])

	/**
	 * Handle duplicate element
	 * Only works in single-select mode
	 */
	const handleDuplicate = useCallback(async () => {
		// Prevent duplicate duplicate operations
		if (isDuplicateInProgressRef.current) {
			console.log("[StylePanel] Duplicate already in progress, ignoring")
			return
		}

		// Get selected element (single-select only)
		const selectors = stylePanelStore.getSelectedSelectors()
		if (selectors.length !== 1) {
			console.warn("[StylePanel] Duplicate requires exactly one selected element")
			return
		}

		if (!editorRef?.current) {
			console.warn("[StylePanel] No editor ref")
			return
		}

		try {
			isDuplicateInProgressRef.current = true
			console.log("[StylePanel] Duplicating element:", selectors[0])
			await editorRef.current.duplicateElement(selectors[0])
			console.log("[StylePanel] Element duplicated successfully")
		} catch (error) {
			console.error("[StylePanel] Failed to duplicate element:", error)
		} finally {
			// Reset flag after operation completes
			setTimeout(() => {
				isDuplicateInProgressRef.current = false
			}, 300)
		}
	}, [editorRef, stylePanelStore])

	const handleReplaceImage = useCallback(async () => {
		if (isReplaceImageInProgressRef.current) {
			console.log("[StylePanel] Replace image already in progress, ignoring")
			return
		}

		if (!editorRef?.current) {
			console.warn("[StylePanel] No editor ref")
			return
		}

		try {
			isReplaceImageInProgressRef.current = true
			await editorRef.current.runImageAction({
				action: "replace-element-image",
			})
		} catch (error) {
			console.error("[StylePanel] Failed to replace image:", error)
		} finally {
			setTimeout(() => {
				isReplaceImageInProgressRef.current = false
			}, 300)
		}
	}, [editorRef])

	const handleInsert = useCallback(
		async (type: "text" | "image") => {
			if (isInsertInProgressRef.current || !editorRef.current) return
			const selectors = stylePanelStore.getSelectedSelectors()
			if (selectors.length !== 1) return

			try {
				isInsertInProgressRef.current = true
				const tree = await editorRef.current.getDomTree()
				const selectedNode = tree?.root ? findNodeBySelector(tree.root, selectors[0]) : null
				if (!selectedNode) throw new Error("未找到当前选中的 DOM 节点")
				if (!selectedNode.canHaveChildren) throw new Error("当前元素不支持新增子元素")

				if (type === "text") {
					setTextInput("")
					setTextInsertRequest({
						parentNodeId: selectedNode.nodeId,
						targetLabel: selectedNode.label || selectedNode.tagName,
					})
				} else {
					await editorRef.current.insertImageNode(selectedNode.nodeId)
				}
			} catch (error) {
				console.error("[StylePanel] Failed to insert DOM node:", error)
			} finally {
				isInsertInProgressRef.current = false
			}
		},
		[editorRef, stylePanelStore],
	)

	const closeTextInsertDialog = useCallback(() => {
		if (isTextInsertSubmitting) return
		setTextInsertRequest(null)
		setTextInput("")
	}, [isTextInsertSubmitting])

	const submitTextInsert = useCallback(async () => {
		const request = textInsertRequest
		const text = textInput.trim()
		if (!request || !text || isTextInsertSubmitting || !editorRef.current) return

		try {
			setIsTextInsertSubmitting(true)
			await editorRef.current.insertTextNode(request.parentNodeId, text)
			setTextInsertRequest(null)
			setTextInput("")
		} catch (error) {
			console.error("[StylePanel] Failed to insert text node:", error)
		} finally {
			setIsTextInsertSubmitting(false)
		}
	}, [editorRef, isTextInsertSubmitting, textInput, textInsertRequest])

	const handleMove = useCallback(
		async (direction: -1 | 1) => {
			if (isMoveInProgressRef.current || !editorRef.current) return
			const selectors = stylePanelStore.getSelectedSelectors()
			if (selectors.length !== 1) return

			try {
				isMoveInProgressRef.current = true
				const tree = await editorRef.current.getDomTree()
				const context = tree?.root ? findNodeContext(tree.root, selectors[0]) : null
				if (!context?.parent || !context.node.canMove) return
				const targetIndex = direction < 0 ? context.index - 1 : context.index + 2
				if (targetIndex < 0 || targetIndex > context.parent.children.length) return
				await editorRef.current.moveDomNode(
					context.node.nodeId,
					context.parent.nodeId,
					targetIndex,
				)
				const nextTree = await editorRef.current.getDomTree()
				const nextContext = nextTree?.root
					? findNodeContext(nextTree.root, selectors[0])
					: null
				setCanAddInside(nextContext?.node.canHaveChildren === true)
				setMoveState({
					canMoveUp: Boolean(nextContext?.node.canMove && nextContext.index > 0),
					canMoveDown: Boolean(
						nextContext?.node.canMove &&
						nextContext.parent &&
						nextContext.index >= 0 &&
						nextContext.index < nextContext.parent.children.length - 1,
					),
				})
			} catch (error) {
				console.error("[StylePanel] Failed to move DOM node:", error)
			} finally {
				isMoveInProgressRef.current = false
			}
		},
		[editorRef, stylePanelStore],
	)
	const [canAddInside, setCanAddInside] = useState(false)

	useEffect(() => {
		let cancelled = false
		const selectionChanged = previousSelectedSelectorRef.current !== selectedSelector
		previousSelectedSelectorRef.current = selectedSelector

		if (!selectedSelector || !editorRef.current) {
			setCanAddInside(false)
			setMoveState({ canMoveUp: false, canMoveDown: false })
			return
		}

		// Keep the current action state while the DOM tree is refreshed after a
		// style update. Clearing it first makes the toolbar disappear briefly and
		// causes visible flicker during color changes. A new selection still resets
		// immediately because the previous node's capabilities are no longer valid.
		if (selectionChanged) {
			setCanAddInside(false)
			setMoveState({ canMoveUp: false, canMoveDown: false })
		}

		void editorRef.current
			.getDomTree()
			.then((tree) => {
				if (cancelled || !tree?.root) return
				const context = findNodeContext(tree.root, selectedSelector)
				setCanAddInside(context?.node.canHaveChildren === true)
				setMoveState({
					canMoveUp: Boolean(context?.node.canMove && context.index > 0),
					canMoveDown: Boolean(
						context?.node.canMove &&
						context.parent &&
						context.index >= 0 &&
						context.index < context.parent.children.length - 1,
					),
				})
			})
			.catch((error) => {
				if (!cancelled) {
					console.error("[StylePanel] Failed to read selected DOM node:", error)
				}
			})

		return () => {
			cancelled = true
		}
	}, [editorRef, historyIndex, selectedSelector])

	return (
		<>
			<div
				className="contents [&_button[data-slot=button][data-size=icon]]:w-7 [&_button]:h-7"
				data-testid="html-style-panel-element-actions"
			>
				{canAddInside ? (
					<>
						<AddElementButton
							icon={<Type className="h-4 w-4" />}
							label={t("stylePanel.domTree.addText")}
							testId="html-style-panel-add-element-button"
							disabled={disabled || !hasSingleSelection}
							onClick={() => void handleInsert("text")}
						/>
						<AddElementButton
							icon={<ImagePlus className="h-4 w-4" />}
							label={t("stylePanel.domTree.addImage")}
							testId="html-style-panel-add-image-element-button"
							disabled={disabled || !hasSingleSelection}
							onClick={() => void handleInsert("image")}
						/>
					</>
				) : null}

				<AddElementButton
					icon={<ArrowUp className="h-4 w-4" />}
					label={t("stylePanel.domTree.moveUp")}
					tooltip={t("stylePanel.domTree.moveUp")}
					testId="html-style-panel-move-up-button"
					disabled={disabled || !hasSingleSelection || !moveState.canMoveUp}
					onClick={() => void handleMove(-1)}
				/>
				<AddElementButton
					icon={<ArrowDown className="h-4 w-4" />}
					label={t("stylePanel.domTree.moveDown")}
					tooltip={t("stylePanel.domTree.moveDown")}
					testId="html-style-panel-move-down-button"
					disabled={disabled || !hasSingleSelection || !moveState.canMoveDown}
					onClick={() => void handleMove(1)}
				/>

				{isSingleImageSelected ? (
					<MagicTooltip
						title={t("stylePanel.replaceImage")}
						contentZIndex={HTML_EDITOR_Z_INDEX.EDITOR_FLOATING.TOOLTIP}
					>
						<span>
							<Button
								variant="ghost"
								size="sm"
								disabled={disabled}
								onClick={handleReplaceImage}
								className="h-7 px-2"
								data-testid="html-style-panel-replace-image-button"
							>
								<ImageUp className="h-4 w-4" />
							</Button>
						</span>
					</MagicTooltip>
				) : null}

				{/* Duplicate button */}
				<MagicTooltip
					title={t("stylePanel.duplicateElement")}
					contentZIndex={HTML_EDITOR_Z_INDEX.EDITOR_FLOATING.TOOLTIP}
				>
					<span>
						<Button
							variant="ghost"
							size="sm"
							disabled={disabled || !hasSingleSelection}
							onClick={handleDuplicate}
							className="h-7 px-2"
							data-testid="html-style-panel-duplicate-button"
						>
							<Copy className="h-4 w-4" />
						</Button>
					</span>
				</MagicTooltip>

				{/* Delete button */}
				<MagicTooltip
					title={t("stylePanel.deleteElement")}
					contentZIndex={HTML_EDITOR_Z_INDEX.EDITOR_FLOATING.TOOLTIP}
				>
					<span>
						<Button
							variant="ghost"
							size="sm"
							disabled={disabled || !hasSingleSelection}
							onClick={handleDelete}
							className="h-7 px-2 hover:bg-destructive/10 hover:text-destructive"
							data-testid="html-style-panel-delete-button"
						>
							<Trash2 className="h-4 w-4" />
						</Button>
					</span>
				</MagicTooltip>
			</div>
			<Dialog
				open={textInsertRequest !== null}
				onOpenChange={(open) => {
					if (!open) closeTextInsertDialog()
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
								disabled={isTextInsertSubmitting}
								onClick={closeTextInsertDialog}
							>
								{t("stylePanel.domTree.addTextDialog.cancel")}
							</Button>
							<Button
								type="submit"
								disabled={!textInput.trim() || isTextInsertSubmitting}
							>
								{t("stylePanel.domTree.addTextDialog.confirm")}
							</Button>
						</DialogFooter>
					</form>
				</DialogContent>
			</Dialog>
		</>
	)
})
