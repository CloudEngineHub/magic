import type { Canvas } from "../../runtime/core/Canvas"
import type { LayerElement } from "../../runtime/document/types"
import type { TreeNode } from "../primitives/custom/Tree/types"
import type { LayerTreeData } from "./types"

// 将 DSL 图层数据转换为 Tree 组件需要的格式。
export function convertLayerToTreeNode(
	layer: LayerElement,
	canvas?: Canvas | null,
): TreeNode<LayerTreeData> {
	// 使用元素实例的 getRenderName() 方法获取默认名称
	let defaultName = ""
	if (canvas) {
		const element = canvas.elementManager.getElementInstance(layer.id)
		if (element) {
			defaultName = element.getRenderName()
		}
	}

	const label = layer.name || defaultName || ""
	// 保留 LayerElement 判别联合的字段关联；不要再次覆盖 type，否则会把各分支
	// 折叠成不相关的联合，新增元素类型时容易触发错误收窄。
	const data: LayerTreeData = {
		...layer,
		visible: layer.visible,
		locked: layer.locked,
	}
	const treeNode: TreeNode<LayerTreeData> = {
		id: layer.id,
		label,
		data,
	}
	// 如果有子节点，先按 zIndex 降序排序再递归转换（zIndex 大的在上面）
	if ("children" in layer && layer.children && layer.children.length > 0) {
		const sortedChildren = [...layer.children].sort((a, b) => (b.zIndex ?? 0) - (a.zIndex ?? 0))
		treeNode.children = sortedChildren.map((child) => convertLayerToTreeNode(child, canvas))
	}
	return treeNode
}
