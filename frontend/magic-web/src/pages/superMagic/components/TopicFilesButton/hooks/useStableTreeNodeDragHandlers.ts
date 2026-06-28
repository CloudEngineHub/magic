import { useMemoizedFn } from "ahooks"
import type { DragEvent } from "react"
import type { TreeNodeData } from "../utils/treeDataConverter"

type TreeNodeDragHandler = (event: DragEvent, node: TreeNodeData) => void

interface TreeNodeDragHandlers {
	onDragEnter: TreeNodeDragHandler
	onDragLeave: TreeNodeDragHandler
	onDragOver: TreeNodeDragHandler
	onDrop: TreeNodeDragHandler
}

export function useStableTreeNodeDragHandlers(handlers: TreeNodeDragHandlers) {
	const onDragEnter = useMemoizedFn(handlers.onDragEnter)
	const onDragLeave = useMemoizedFn(handlers.onDragLeave)
	const onDragOver = useMemoizedFn(handlers.onDragOver)
	const onDrop = useMemoizedFn(handlers.onDrop)

	return { onDragEnter, onDragLeave, onDragOver, onDrop }
}
