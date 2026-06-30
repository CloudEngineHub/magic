import type { AttachmentItem } from "../hooks/types"
import type { TreeNodeData } from "./treeDataConverter"

export type TreeIndexLookupKey = string | number | bigint | null | undefined

// treeIndex is a read-only file tree snapshot with centralized key/id/parent lookups.
export interface TreeIndexEntry {
	key: string
	node: TreeNodeData
	item: AttachmentItem
	parentKey: string | null
	parentNode: TreeNodeData | null
	level: number
	// Key path from root to node, used for parent paths, selection inheritance, and scrolling.
	pathKeys: string[]
}

export interface TreeIndex {
	entriesByKey: ReadonlyMap<string, TreeIndexEntry>
	nodeByKey: ReadonlyMap<string, TreeNodeData>
	nodeById: ReadonlyMap<string, TreeNodeData>
	itemByKey: ReadonlyMap<string, AttachmentItem>
	itemById: ReadonlyMap<string, AttachmentItem>
	parentKeyByKey: ReadonlyMap<string, string | null>
	childKeysByKey: ReadonlyMap<string, readonly string[]>
	rootKeys: readonly string[]
	allKeys: readonly string[]
	totalCount: number
	getEntryByKey: (key: TreeIndexLookupKey) => TreeIndexEntry | undefined
	getEntryById: (id: TreeIndexLookupKey) => TreeIndexEntry | undefined
	getNodeByKey: (key: TreeIndexLookupKey) => TreeNodeData | undefined
	getNodeById: (id: TreeIndexLookupKey) => TreeNodeData | undefined
	getItemByKey: (key: TreeIndexLookupKey) => AttachmentItem | undefined
	getItemById: (id: TreeIndexLookupKey) => AttachmentItem | undefined
	getChildKeysByKey: (key: TreeIndexLookupKey) => string[]
	getChildKeysById: (id: TreeIndexLookupKey) => string[]
	getDescendantKeysByKey: (key: TreeIndexLookupKey) => string[]
	getDescendantKeysById: (id: TreeIndexLookupKey) => string[]
	getPathKeys: (key: TreeIndexLookupKey) => string[]
	getPathKeysById: (id: TreeIndexLookupKey) => string[]
	getParentNodeByKey: (key: TreeIndexLookupKey) => TreeNodeData | null
	getParentNodeById: (id: TreeIndexLookupKey) => TreeNodeData | null
	getParentItemsByKey: (key: TreeIndexLookupKey) => AttachmentItem[]
	getParentItemsById: (id: TreeIndexLookupKey) => AttachmentItem[]
}

export interface TreeIndexStructureStats extends Record<string, number> {
	tree_index_entry_count: number
	tree_index_map_entry_count: number
	tree_index_path_key_ref_count: number
	tree_index_child_key_ref_count: number
	tree_index_root_key_count: number
	tree_index_all_key_count: number
	tree_index_max_path_depth: number
	tree_index_avg_path_depth: number
}

interface StackItem {
	node: TreeNodeData
	parentKey: string | null
	parentNode: TreeNodeData | null
	pathKeys: string[]
}

function toLookupKey(key: TreeIndexLookupKey): string | undefined {
	if (key === null || key === undefined) return undefined
	return String(key)
}

export function buildTreeIndex(treeData: TreeNodeData[]): TreeIndex {
	const entriesByKey = new Map<string, TreeIndexEntry>()
	const nodeByKey = new Map<string, TreeNodeData>()
	const nodeById = new Map<string, TreeNodeData>()
	const itemByKey = new Map<string, AttachmentItem>()
	const itemById = new Map<string, AttachmentItem>()
	const parentKeyByKey = new Map<string, string | null>()
	const childKeysByKey = new Map<string, readonly string[]>()
	const rootKeys: string[] = []
	const allKeys: string[] = []

	// Use an explicit stack to avoid call-stack risk on large or deep trees.
	const stack: StackItem[] = []
	for (let index = treeData.length - 1; index >= 0; index -= 1) {
		stack.push({
			node: treeData[index],
			parentKey: null,
			parentNode: null,
			pathKeys: [],
		})
	}

	while (stack.length > 0) {
		const current = stack.pop()
		if (!current) continue

		const { node, parentKey, parentNode } = current
		const key = String(node.key)
		const pathKeys = [...current.pathKeys, key]
		const item = node.item
		// Real files prefer file_id for the id index; virtual/legacy folders use node key.
		const itemId = item?.file_id || key

		const entry: TreeIndexEntry = {
			key,
			node,
			item,
			parentKey,
			parentNode,
			level: node.level,
			pathKeys,
		}

		entriesByKey.set(key, entry)
		nodeByKey.set(key, node)
		itemByKey.set(key, item)
		parentKeyByKey.set(key, parentKey)
		allKeys.push(key)

		if (parentKey === null) {
			rootKeys.push(key)
		}

		if (itemId) {
			const lookupId = String(itemId)
			nodeById.set(lookupId, node)
			itemById.set(lookupId, item)
		}

		const children = node.children || []
		// Cache child keys for visible rows, selection, and descendant queries.
		childKeysByKey.set(
			key,
			children.map((child) => String(child.key)),
		)

		for (let index = children.length - 1; index >= 0; index -= 1) {
			stack.push({
				node: children[index],
				parentKey: key,
				parentNode: node,
				pathKeys,
			})
		}
	}

	const getParentItemsByPathKeys = (pathKeys: string[]): AttachmentItem[] => {
		if (pathKeys.length <= 1) return []

		return pathKeys
			.slice(0, -1)
			.map((pathKey) => itemByKey.get(pathKey))
			.filter((item): item is AttachmentItem => Boolean(item))
	}

	// Resolve id to node, then read the key entry so metadata has one source.
	const getEntryByNodeId = (id: TreeIndexLookupKey): TreeIndexEntry | undefined => {
		const lookupId = toLookupKey(id)
		if (!lookupId) return undefined
		const node = nodeById.get(lookupId)
		return node ? entriesByKey.get(String(node.key)) : undefined
	}

	const getChildKeysByEntryKey = (key: TreeIndexLookupKey): string[] => {
		const lookupKey = toLookupKey(key)
		if (!lookupKey) return []
		return [...(childKeysByKey.get(lookupKey) || [])]
	}

	const getDescendantKeysByEntryKey = (key: TreeIndexLookupKey): string[] => {
		const lookupKey = toLookupKey(key)
		if (!lookupKey) return []

		const descendantKeys: string[] = []
		const stack = getChildKeysByEntryKey(lookupKey).reverse()

		// Collect descendants in display order without precomputing arrays per node.
		while (stack.length > 0) {
			const childKey = stack.pop()
			if (!childKey) continue

			descendantKeys.push(childKey)
			const childKeys = childKeysByKey.get(childKey) || []
			for (let index = childKeys.length - 1; index >= 0; index -= 1) {
				stack.push(childKeys[index])
			}
		}

		return descendantKeys
	}

	const getParentNodeByEntryKey = (key: TreeIndexLookupKey): TreeNodeData | null => {
		const lookupKey = toLookupKey(key)
		if (!lookupKey) return null
		return entriesByKey.get(lookupKey)?.parentNode || null
	}

	return {
		entriesByKey,
		nodeByKey,
		nodeById,
		itemByKey,
		itemById,
		parentKeyByKey,
		childKeysByKey,
		rootKeys,
		allKeys,
		totalCount: allKeys.length,
		getEntryByKey: (key) => {
			const lookupKey = toLookupKey(key)
			return lookupKey ? entriesByKey.get(lookupKey) : undefined
		},
		getEntryById: getEntryByNodeId,
		getNodeByKey: (key) => {
			const lookupKey = toLookupKey(key)
			return lookupKey ? nodeByKey.get(lookupKey) : undefined
		},
		getNodeById: (id) => {
			const lookupId = toLookupKey(id)
			return lookupId ? nodeById.get(lookupId) : undefined
		},
		getItemByKey: (key) => {
			const lookupKey = toLookupKey(key)
			return lookupKey ? itemByKey.get(lookupKey) : undefined
		},
		getItemById: (id) => {
			const lookupId = toLookupKey(id)
			return lookupId ? itemById.get(lookupId) : undefined
		},
		getChildKeysByKey: getChildKeysByEntryKey,
		getChildKeysById: (id) => {
			const entry = getEntryByNodeId(id)
			return entry ? getChildKeysByEntryKey(entry.key) : []
		},
		getDescendantKeysByKey: getDescendantKeysByEntryKey,
		getDescendantKeysById: (id) => {
			const entry = getEntryByNodeId(id)
			return entry ? getDescendantKeysByEntryKey(entry.key) : []
		},
		getPathKeys: (key) => {
			const lookupKey = toLookupKey(key)
			if (!lookupKey) return []
			return entriesByKey.get(lookupKey)?.pathKeys || []
		},
		getPathKeysById: (id) => getEntryByNodeId(id)?.pathKeys || [],
		getParentNodeByKey: getParentNodeByEntryKey,
		getParentNodeById: (id) => getEntryByNodeId(id)?.parentNode || null,
		getParentItemsByKey: (key) => {
			const lookupKey = toLookupKey(key)
			if (!lookupKey) return []
			return getParentItemsByPathKeys(entriesByKey.get(lookupKey)?.pathKeys || [])
		},
		getParentItemsById: (id) => {
			const lookupId = toLookupKey(id)
			if (!lookupId) return []
			const node = nodeById.get(lookupId)
			if (!node) return []
			return getParentItemsByPathKeys(entriesByKey.get(String(node.key))?.pathKeys || [])
		},
	}
}

export function getTreeIndexEntry(
	treeIndex: TreeIndex,
	lookupKey: TreeIndexLookupKey,
): TreeIndexEntry | undefined {
	return treeIndex.getEntryByKey(lookupKey) || treeIndex.getEntryById(lookupKey)
}

export function getTreeNodeByLookupKey(
	treeIndex: TreeIndex,
	lookupKey: TreeIndexLookupKey,
): TreeNodeData | undefined {
	return getTreeIndexEntry(treeIndex, lookupKey)?.node
}

export function getAttachmentByLookupKey(
	treeIndex: TreeIndex,
	lookupKey: TreeIndexLookupKey,
): AttachmentItem | undefined {
	return getTreeIndexEntry(treeIndex, lookupKey)?.item
}

export function getPathKeysByLookupKey(
	treeIndex: TreeIndex,
	lookupKey: TreeIndexLookupKey,
): string[] {
	return getTreeIndexEntry(treeIndex, lookupKey)?.pathKeys || []
}

export function getParentNodeByLookupKey(
	treeIndex: TreeIndex,
	lookupKey: TreeIndexLookupKey,
): TreeNodeData | null {
	return getTreeIndexEntry(treeIndex, lookupKey)?.parentNode || null
}

export function isDescendantByParentMap(
	treeIndex: TreeIndex,
	ancestorKey: TreeIndexLookupKey,
	descendantKey: TreeIndexLookupKey,
): boolean {
	const ancestorEntry = getTreeIndexEntry(treeIndex, ancestorKey)
	const descendantEntry = getTreeIndexEntry(treeIndex, descendantKey)

	if (!ancestorEntry || !descendantEntry) return false
	return descendantEntry.pathKeys.slice(0, -1).includes(ancestorEntry.key)
}

export function collectTreeIndexStructureStats(treeIndex: TreeIndex): TreeIndexStructureStats {
	let pathKeyRefCount = 0
	let maxPathDepth = 0

	treeIndex.entriesByKey.forEach((entry) => {
		pathKeyRefCount += entry.pathKeys.length
		maxPathDepth = Math.max(maxPathDepth, entry.pathKeys.length)
	})

	let childKeyRefCount = 0
	treeIndex.childKeysByKey.forEach((childKeys) => {
		childKeyRefCount += childKeys.length
	})

	const mapEntryCount =
		treeIndex.entriesByKey.size +
		treeIndex.nodeByKey.size +
		treeIndex.nodeById.size +
		treeIndex.itemByKey.size +
		treeIndex.itemById.size +
		treeIndex.parentKeyByKey.size +
		treeIndex.childKeysByKey.size

	return {
		tree_index_entry_count: treeIndex.totalCount,
		tree_index_map_entry_count: mapEntryCount,
		tree_index_path_key_ref_count: pathKeyRefCount,
		tree_index_child_key_ref_count: childKeyRefCount,
		tree_index_root_key_count: treeIndex.rootKeys.length,
		tree_index_all_key_count: treeIndex.allKeys.length,
		tree_index_max_path_depth: maxPathDepth,
		tree_index_avg_path_depth:
			treeIndex.totalCount > 0
				? Math.round((pathKeyRefCount / treeIndex.totalCount) * 100) / 100
				: 0,
	}
}
