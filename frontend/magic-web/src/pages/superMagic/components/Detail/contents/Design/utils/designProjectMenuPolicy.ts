interface DesignProjectMenuItem {
	relative_file_path?: string
	display_config?: unknown
}

interface DesignProjectMenuTreeNode {
	item: DesignProjectMenuItem
	children?: DesignProjectMenuTreeNode[]
}

export function canCreateDesignProjectInMenuTarget(
	item: DesignProjectMenuItem,
	treeData?: DesignProjectMenuTreeNode[],
): boolean {
	return !item.display_config && !hasDisplayConfigInAncestors(item, treeData)
}

function hasDisplayConfigInAncestors(
	item: DesignProjectMenuItem,
	treeData?: DesignProjectMenuTreeNode[],
): boolean {
	if (!treeData || !item.relative_file_path) return false

	const currentPath = normalizeComparablePath(item.relative_file_path)
	if (!currentPath) return false

	const pathParts = currentPath.split("/").filter(Boolean)

	for (let index = pathParts.length - 1; index > 0; index--) {
		const parentPath = pathParts.slice(0, index).join("/")
		const parentNode = findNodeByPath(treeData, parentPath)
		if (parentNode?.display_config) return true
	}

	const rootNode = findNodeByPath(treeData, "")
	return !!rootNode?.display_config
}

function findNodeByPath(
	nodes: DesignProjectMenuTreeNode[],
	targetPath: string,
): DesignProjectMenuItem | null {
	const normalizedTargetPath = normalizeComparablePath(targetPath)

	for (const node of nodes) {
		const nodePath = normalizeComparablePath(node.item.relative_file_path)
		if (nodePath === normalizedTargetPath) {
			return node.item
		}

		const found = node.children ? findNodeByPath(node.children, targetPath) : null
		if (found) return found
	}

	return null
}

function normalizeComparablePath(path: unknown): string {
	if (typeof path !== "string") return ""

	const normalized = path.replace(/\\/g, "/").replace(/^\/+|\/+$/g, "")
	return normalized === "." ? "" : normalized
}
