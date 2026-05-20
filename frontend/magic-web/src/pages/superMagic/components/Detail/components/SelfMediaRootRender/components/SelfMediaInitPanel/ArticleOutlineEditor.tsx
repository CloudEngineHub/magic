import { useCallback, useState } from "react"
import { useTranslation } from "react-i18next"
import { cn } from "@/lib/utils"
import type { MaterialItem, OutlineNode } from "./types"
import MaterialAttachmentList from "./MaterialAttachmentList"

interface ArticleOutlineEditorProps {
	outline: OutlineNode[]
	onChange: (outline: OutlineNode[]) => void
	onBlur?: () => void
}

let idCounter = 0
function generateId(): string {
	return `outline_${Date.now()}_${++idCounter}`
}

function createEmptyNode(): OutlineNode {
	return { id: generateId(), text: "", children: [], materials: [] }
}

function updateNodeInTree(
	nodes: OutlineNode[],
	id: string,
	updater: (node: OutlineNode) => OutlineNode,
): OutlineNode[] {
	return nodes.map((node) => {
		if (node.id === id) return updater(node)
		if (node.children?.length) {
			return { ...node, children: updateNodeInTree(node.children, id, updater) }
		}
		return node
	})
}

interface OutlineNodeItemProps {
	node: OutlineNode
	depth: number
	expandedAttachmentIds: Set<string>
	onToggleAttachments: (id: string) => void
	onUpdate: (id: string, text: string) => void
	onRemove: (id: string) => void
	onAddChild: (parentId: string) => void
	onAddSibling: (id: string) => void
	onMaterialsChange: (id: string, materials: MaterialItem[]) => void
	onBlur?: () => void
}

function OutlineNodeItem({
	node,
	depth,
	expandedAttachmentIds,
	onToggleAttachments,
	onUpdate,
	onRemove,
	onAddChild,
	onAddSibling,
	onMaterialsChange,
	onBlur,
}: OutlineNodeItemProps) {
	const { t } = useTranslation("super")
	const materials = node.materials || []
	const showAttachments = expandedAttachmentIds.has(node.id)

	return (
		<div>
			<div
				className="group flex items-center gap-1.5 py-0.5"
				style={{ paddingLeft: `${depth * 20}px` }}
			>
				<span className="flex h-4 w-4 shrink-0 items-center justify-center text-muted-foreground">
					{node.children && node.children.length > 0 ? "▸" : "•"}
				</span>
				<input
					type="text"
					className="flex-1 rounded border-0 bg-transparent px-1 py-0.5 text-sm focus:bg-muted focus:outline-none focus:ring-1 focus:ring-primary"
					placeholder={t("detail.selfMedia.initPanel.stepDetail.outlineNodePlaceholder")}
					value={node.text}
					onChange={(e) => onUpdate(node.id, e.target.value)}
					onBlur={onBlur}
					onKeyDown={(e) => {
						if (e.key === "Enter" && !e.shiftKey) {
							e.preventDefault()
							onAddSibling(node.id)
						} else if (e.key === "Tab") {
							e.preventDefault()
							onAddChild(node.id)
						}
					}}
				/>
				<div className="flex shrink-0 gap-0.5 opacity-0 group-hover:opacity-100">
					<button
						type="button"
						className={cn(
							"relative rounded p-0.5 transition-colors",
							materials.length > 0 || showAttachments
								? "text-primary"
								: "text-muted-foreground hover:text-foreground",
						)}
						title={t("detail.selfMedia.initPanel.stepDetail.outlineAttachBtn")}
						onClick={() => onToggleAttachments(node.id)}
					>
						<svg
							width="14"
							height="14"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							strokeWidth="2"
						>
							<path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
						</svg>
						{materials.length > 0 && (
							<span className="absolute -right-1 -top-1 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-primary px-0.5 text-[9px] font-medium text-primary-foreground">
								{materials.length}
							</span>
						)}
					</button>
					<button
						type="button"
						className="rounded p-0.5 text-muted-foreground hover:text-foreground"
						title={t("detail.selfMedia.initPanel.stepDetail.outlineAddChildBtn")}
						onClick={() => onAddChild(node.id)}
					>
						<svg
							width="14"
							height="14"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							strokeWidth="2"
						>
							<path d="M12 5v14M5 12h14" />
						</svg>
					</button>
					<button
						type="button"
						className="rounded p-0.5 text-muted-foreground hover:text-destructive"
						title={t("detail.selfMedia.initPanel.stepDetail.outlineRemoveBtn")}
						onClick={() => onRemove(node.id)}
					>
						<svg
							width="14"
							height="14"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							strokeWidth="2"
						>
							<path d="M18 6 6 18M6 6l12 12" />
						</svg>
					</button>
				</div>
			</div>

			{showAttachments && (
				<div
					className="mb-1 mt-1 rounded-lg border border-border/40 bg-muted/20 p-2"
					style={{ marginLeft: `${depth * 20 + 20}px` }}
				>
					<MaterialAttachmentList
						compact
						materials={materials}
						onChange={(next) => onMaterialsChange(node.id, next)}
						addLabel={t("detail.selfMedia.initPanel.stepDetail.outlineAttachBtn")}
						descriptionPlaceholder={t(
							"detail.selfMedia.initPanel.stepDetail.outlineAttachPlaceholder",
						)}
					/>
				</div>
			)}

			{node.children?.map((child) => (
				<OutlineNodeItem
					key={child.id}
					node={child}
					depth={depth + 1}
					expandedAttachmentIds={expandedAttachmentIds}
					onToggleAttachments={onToggleAttachments}
					onUpdate={onUpdate}
					onRemove={onRemove}
					onAddChild={onAddChild}
					onAddSibling={onAddSibling}
					onMaterialsChange={onMaterialsChange}
					onBlur={onBlur}
				/>
			))}
		</div>
	)
}

export default function ArticleOutlineEditor({
	outline,
	onChange,
	onBlur,
}: ArticleOutlineEditorProps) {
	const { t } = useTranslation("super")
	const [expandedAttachmentIds, setExpandedAttachmentIds] = useState<Set<string>>(new Set())

	const toggleAttachments = useCallback((id: string) => {
		setExpandedAttachmentIds((prev) => {
			const next = new Set(prev)
			if (next.has(id)) next.delete(id)
			else next.add(id)
			return next
		})
	}, [])

	const updateNode = useCallback(
		(id: string, text: string) => {
			onChange(updateNodeInTree(outline, id, (node) => ({ ...node, text })))
		},
		[outline, onChange],
	)

	const updateMaterials = useCallback(
		(id: string, materials: MaterialItem[]) => {
			onChange(updateNodeInTree(outline, id, (node) => ({ ...node, materials })))
		},
		[outline, onChange],
	)

	const removeNode = useCallback(
		(id: string) => {
			const remove = (nodes: OutlineNode[]): OutlineNode[] =>
				nodes
					.filter((n) => n.id !== id)
					.map((n) => ({
						...n,
						children: n.children ? remove(n.children) : [],
					}))
			onChange(remove(outline))
			setExpandedAttachmentIds((prev) => {
				if (!prev.has(id)) return prev
				const next = new Set(prev)
				next.delete(id)
				return next
			})
		},
		[outline, onChange],
	)

	const addChild = useCallback(
		(parentId: string) => {
			const newNode = createEmptyNode()
			onChange(
				updateNodeInTree(outline, parentId, (node) => ({
					...node,
					children: [...(node.children || []), newNode],
				})),
			)
		},
		[outline, onChange],
	)

	const addSibling = useCallback(
		(id: string) => {
			const newNode = createEmptyNode()
			const insertAfter = (nodes: OutlineNode[]): OutlineNode[] => {
				const result: OutlineNode[] = []
				for (const n of nodes) {
					result.push(n)
					if (n.id === id) {
						result.push(newNode)
					} else if (n.children?.length) {
						const updatedChildren = insertAfter(n.children)
						if (updatedChildren !== n.children) {
							result[result.length - 1] = { ...n, children: updatedChildren }
						}
					}
				}
				return result
			}
			onChange(insertAfter(outline))
		},
		[outline, onChange],
	)

	const handleAddRoot = useCallback(() => {
		onChange([...outline, createEmptyNode()])
	}, [outline, onChange])

	return (
		<div className="rounded-lg border border-border p-3">
			{outline.length === 0 ? (
				<p className="py-4 text-center text-sm text-muted-foreground">
					{t("detail.selfMedia.initPanel.stepDetail.outlineEmpty")}
				</p>
			) : (
				<div className="flex flex-col">
					{outline.map((node) => (
						<OutlineNodeItem
							key={node.id}
							node={node}
							depth={0}
							expandedAttachmentIds={expandedAttachmentIds}
							onToggleAttachments={toggleAttachments}
							onUpdate={updateNode}
							onRemove={removeNode}
							onAddChild={addChild}
							onAddSibling={addSibling}
							onMaterialsChange={updateMaterials}
							onBlur={onBlur}
						/>
					))}
				</div>
			)}
			<button
				type="button"
				className="mt-2 flex w-full items-center justify-center gap-1 rounded border border-dashed border-border py-1.5 text-xs text-muted-foreground hover:border-primary hover:text-primary"
				onClick={handleAddRoot}
			>
				<svg
					width="12"
					height="12"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					strokeWidth="2"
				>
					<path d="M12 5v14M5 12h14" />
				</svg>
				{t("detail.selfMedia.initPanel.stepDetail.outlineAddRootBtn")}
			</button>
		</div>
	)
}
