import type { AttachmentItem } from "../hooks/types"

export type AttachmentIndexLookupKey = string | number | bigint | null | undefined

export interface AttachmentIndexEntry {
	key: string
	item: AttachmentItem
	parentKey: string | null
	parentItem: AttachmentItem | null
	level: number
}

export interface AttachmentIndex {
	entriesByKey: ReadonlyMap<string, AttachmentIndexEntry>
	entriesById: ReadonlyMap<string, AttachmentIndexEntry>
	parentKeyByKey: ReadonlyMap<string, string | null>
	childKeysByKey: ReadonlyMap<string, readonly string[]>
	rootKeys: readonly string[]
	allKeys: readonly string[]
	totalCount: number
	getEntryByKey: (key: AttachmentIndexLookupKey) => AttachmentIndexEntry | undefined
	getEntryById: (id: AttachmentIndexLookupKey) => AttachmentIndexEntry | undefined
	getItemByKey: (key: AttachmentIndexLookupKey) => AttachmentItem | undefined
	getItemById: (id: AttachmentIndexLookupKey) => AttachmentItem | undefined
	getChildKeysByKey: (key: AttachmentIndexLookupKey) => string[]
	getChildKeysById: (id: AttachmentIndexLookupKey) => string[]
	getDescendantKeysByKey: (key: AttachmentIndexLookupKey) => string[]
	getDescendantKeysById: (id: AttachmentIndexLookupKey) => string[]
	getPathKeys: (key: AttachmentIndexLookupKey) => string[]
	getPathKeysById: (id: AttachmentIndexLookupKey) => string[]
	getParentItemByKey: (key: AttachmentIndexLookupKey) => AttachmentItem | null
	getParentItemById: (id: AttachmentIndexLookupKey) => AttachmentItem | null
	getParentItemsByKey: (key: AttachmentIndexLookupKey) => AttachmentItem[]
	getParentItemsById: (id: AttachmentIndexLookupKey) => AttachmentItem[]
}

export interface AttachmentIndexStructureStats extends Record<string, number> {
	attachment_index_entry_count: number
	attachment_index_map_entry_count: number
	attachment_index_path_key_ref_count: number
	attachment_index_child_key_ref_count: number
	attachment_index_root_key_count: number
	attachment_index_all_key_count: number
	attachment_index_max_path_depth: number
	attachment_index_avg_path_depth: number
}

interface BuildAttachmentIndexOptions {
	includeHidden?: boolean
}

interface StackItem {
	item: AttachmentItem
	parentKey: string | null
	parentItem: AttachmentItem | null
	level: number
	fallbackKey: string
}

export function resolveAttachmentKey(item: AttachmentItem, fallbackKey: string) {
	return String(resolveAttachmentId(item) || item.relative_file_path || item.path || fallbackKey)
}

/** Resolves the API identifier shared by current and legacy attachment payloads. */
export function resolveAttachmentId(item: AttachmentItem): string | undefined {
	return item.file_id || (item as AttachmentItem & { id?: string }).id
}

function toLookupKey(key: AttachmentIndexLookupKey): string | undefined {
	if (key === null || key === undefined) return undefined
	return String(key)
}

export function buildAttachmentIndex(
	attachments: AttachmentItem[],
	options: BuildAttachmentIndexOptions = {},
): AttachmentIndex {
	const includeHidden = options.includeHidden ?? false
	const entriesByKey = new Map<string, AttachmentIndexEntry>()
	const entriesById = new Map<string, AttachmentIndexEntry>()
	const parentKeyByKey = new Map<string, string | null>()
	const childKeysByKey = new Map<string, readonly string[]>()
	const rootKeys: string[] = []
	const allKeys: string[] = []

	const stack: StackItem[] = []
	for (let index = attachments.length - 1; index >= 0; index -= 1) {
		stack.push({
			item: attachments[index],
			parentKey: null,
			parentItem: null,
			level: 0,
			fallbackKey: `root-${index}`,
		})
	}

	while (stack.length > 0) {
		const current = stack.pop()
		if (!current) continue

		const { item, parentKey, parentItem, level, fallbackKey } = current
		if (!includeHidden && item?.is_hidden) continue

		const key = resolveAttachmentKey(item, fallbackKey)
		const itemId = resolveAttachmentId(item) || key
		const entry: AttachmentIndexEntry = {
			key,
			item,
			parentKey,
			parentItem,
			level,
		}

		entriesByKey.set(key, entry)
		parentKeyByKey.set(key, parentKey)
		allKeys.push(key)

		if (parentKey === null) {
			rootKeys.push(key)
		}

		if (itemId) {
			const lookupId = String(itemId)
			entriesById.set(lookupId, entry)
		}

		const children = item.children || []
		const childKeys: string[] = []
		for (let index = 0; index < children.length; index += 1) {
			const child = children[index]
			if (!includeHidden && child?.is_hidden) continue
			childKeys.push(resolveAttachmentKey(child, `${fallbackKey}-${index}`))
		}
		childKeysByKey.set(key, childKeys)

		for (let index = children.length - 1; index >= 0; index -= 1) {
			const child = children[index]
			if (!includeHidden && child?.is_hidden) continue
			stack.push({
				item: child,
				parentKey: key,
				parentItem: item,
				level: level + 1,
				fallbackKey: `${fallbackKey}-${index}`,
			})
		}
	}

	const getPathKeysByEntryKey = (key: AttachmentIndexLookupKey): string[] => {
		const lookupKey = toLookupKey(key)
		if (!lookupKey || !entriesByKey.has(lookupKey)) return []

		const reversedPathKeys: string[] = []
		let currentKey: string | null | undefined = lookupKey
		while (currentKey) {
			reversedPathKeys.push(currentKey)
			currentKey = parentKeyByKey.get(currentKey)
		}
		return reversedPathKeys.reverse()
	}

	const getParentItemsByEntryKey = (key: AttachmentIndexLookupKey): AttachmentItem[] => {
		const pathKeys = getPathKeysByEntryKey(key)
		if (pathKeys.length <= 1) return []
		return pathKeys
			.slice(0, -1)
			.map((pathKey) => entriesByKey.get(pathKey)?.item)
			.filter((item): item is AttachmentItem => Boolean(item))
	}

	const getEntryByItemId = (id: AttachmentIndexLookupKey): AttachmentIndexEntry | undefined => {
		const lookupId = toLookupKey(id)
		return lookupId ? entriesById.get(lookupId) : undefined
	}

	const getChildKeysByEntryKey = (key: AttachmentIndexLookupKey): string[] => {
		const lookupKey = toLookupKey(key)
		if (!lookupKey) return []
		return [...(childKeysByKey.get(lookupKey) || [])]
	}

	const getDescendantKeysByEntryKey = (key: AttachmentIndexLookupKey): string[] => {
		const lookupKey = toLookupKey(key)
		if (!lookupKey) return []

		const descendantKeys: string[] = []
		const stack = getChildKeysByEntryKey(lookupKey).reverse()

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

	return {
		entriesByKey,
		entriesById,
		parentKeyByKey,
		childKeysByKey,
		rootKeys,
		allKeys,
		totalCount: allKeys.length,
		getEntryByKey: (key) => {
			const lookupKey = toLookupKey(key)
			return lookupKey ? entriesByKey.get(lookupKey) : undefined
		},
		getEntryById: getEntryByItemId,
		getItemByKey: (key) => {
			const lookupKey = toLookupKey(key)
			return lookupKey ? entriesByKey.get(lookupKey)?.item : undefined
		},
		getItemById: (id) => {
			const lookupId = toLookupKey(id)
			return lookupId ? entriesById.get(lookupId)?.item : undefined
		},
		getChildKeysByKey: getChildKeysByEntryKey,
		getChildKeysById: (id) => {
			const entry = getEntryByItemId(id)
			return entry ? getChildKeysByEntryKey(entry.key) : []
		},
		getDescendantKeysByKey: getDescendantKeysByEntryKey,
		getDescendantKeysById: (id) => {
			const entry = getEntryByItemId(id)
			return entry ? getDescendantKeysByEntryKey(entry.key) : []
		},
		getPathKeys: (key) => {
			return getPathKeysByEntryKey(key)
		},
		getPathKeysById: (id) => {
			const entry = getEntryByItemId(id)
			return entry ? getPathKeysByEntryKey(entry.key) : []
		},
		getParentItemByKey: (key) => {
			const lookupKey = toLookupKey(key)
			if (!lookupKey) return null
			return entriesByKey.get(lookupKey)?.parentItem || null
		},
		getParentItemById: (id) => getEntryByItemId(id)?.parentItem || null,
		getParentItemsByKey: (key) => {
			return getParentItemsByEntryKey(key)
		},
		getParentItemsById: (id) => {
			const entry = getEntryByItemId(id)
			return entry ? getParentItemsByEntryKey(entry.key) : []
		},
	}
}

export function getAttachmentIndexEntry(
	attachmentIndex: AttachmentIndex,
	lookupKey: AttachmentIndexLookupKey,
): AttachmentIndexEntry | undefined {
	return attachmentIndex.getEntryByKey(lookupKey) || attachmentIndex.getEntryById(lookupKey)
}

export function getAttachmentByLookupKey(
	attachmentIndex: AttachmentIndex,
	lookupKey: AttachmentIndexLookupKey,
): AttachmentItem | undefined {
	return getAttachmentIndexEntry(attachmentIndex, lookupKey)?.item
}

export function getPathKeysByLookupKey(
	attachmentIndex: AttachmentIndex,
	lookupKey: AttachmentIndexLookupKey,
): string[] {
	const entry = getAttachmentIndexEntry(attachmentIndex, lookupKey)
	return entry ? attachmentIndex.getPathKeys(entry.key) : []
}

export function getParentItemByLookupKey(
	attachmentIndex: AttachmentIndex,
	lookupKey: AttachmentIndexLookupKey,
): AttachmentItem | null {
	return getAttachmentIndexEntry(attachmentIndex, lookupKey)?.parentItem || null
}

export function getAttachmentPathByLookupKey(
	attachmentIndex: AttachmentIndex,
	lookupKey: AttachmentIndexLookupKey,
): AttachmentItem[] {
	const entry = getAttachmentIndexEntry(attachmentIndex, lookupKey)
	return entry ? [...attachmentIndex.getParentItemsByKey(entry.key), entry.item] : []
}

export function isDescendantByParentMap(
	attachmentIndex: AttachmentIndex,
	ancestorKey: AttachmentIndexLookupKey,
	descendantKey: AttachmentIndexLookupKey,
): boolean {
	const ancestorEntry = getAttachmentIndexEntry(attachmentIndex, ancestorKey)
	const descendantEntry = getAttachmentIndexEntry(attachmentIndex, descendantKey)

	if (!ancestorEntry || !descendantEntry) return false
	let parentKey = descendantEntry.parentKey
	while (parentKey) {
		if (parentKey === ancestorEntry.key) return true
		parentKey = attachmentIndex.getEntryByKey(parentKey)?.parentKey ?? null
	}
	return false
}

export function collectAttachmentIndexStructureStats(
	attachmentIndex: AttachmentIndex,
): AttachmentIndexStructureStats {
	let maxPathDepth = 0
	let totalPathDepth = 0

	attachmentIndex.entriesByKey.forEach((entry) => {
		const depth = entry.level + 1
		totalPathDepth += depth
		maxPathDepth = Math.max(maxPathDepth, depth)
	})

	let childKeyRefCount = 0
	attachmentIndex.childKeysByKey.forEach((childKeys) => {
		childKeyRefCount += childKeys.length
	})

	const mapEntryCount =
		attachmentIndex.entriesByKey.size +
		attachmentIndex.entriesById.size +
		attachmentIndex.parentKeyByKey.size +
		attachmentIndex.childKeysByKey.size

	return {
		attachment_index_entry_count: attachmentIndex.totalCount,
		attachment_index_map_entry_count: mapEntryCount,
		attachment_index_path_key_ref_count: 0,
		attachment_index_child_key_ref_count: childKeyRefCount,
		attachment_index_root_key_count: attachmentIndex.rootKeys.length,
		attachment_index_all_key_count: attachmentIndex.allKeys.length,
		attachment_index_max_path_depth: maxPathDepth,
		attachment_index_avg_path_depth:
			attachmentIndex.totalCount > 0
				? Math.round((totalPathDepth / attachmentIndex.totalCount) * 100) / 100
				: 0,
	}
}
