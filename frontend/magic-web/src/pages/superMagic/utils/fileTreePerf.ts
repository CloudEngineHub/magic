import { createManualPerfScope, type MetricDataFactory } from "@/utils/manualPerfLogger"

export interface FileTreeLike {
	is_hidden?: boolean
	is_directory?: boolean
	type?: string
	children?: FileTreeLike[]
}

export interface FileTreeStats extends Record<string, number> {
	attachments_count: number
	tree_depth: number
	root_count: number
	hidden_count: number
	directory_count: number
	file_count: number
}

export function collectFileTreeStats(items: FileTreeLike[] = []): FileTreeStats {
	let attachmentsCount = 0
	let hiddenCount = 0
	let directoryCount = 0
	let fileCount = 0
	let treeDepth = 0

	const stack = items.map((item) => ({ item, depth: 1 }))

	while (stack.length > 0) {
		const current = stack.pop()
		if (!current) continue

		const { item, depth } = current
		const children = Array.isArray(item.children) ? item.children : []
		const isDirectory = item.is_directory || item.type === "directory" || children.length > 0

		attachmentsCount += 1
		treeDepth = Math.max(treeDepth, depth)

		if (item.is_hidden) hiddenCount += 1
		if (isDirectory) {
			directoryCount += 1
		} else {
			fileCount += 1
		}

		for (let index = children.length - 1; index >= 0; index -= 1) {
			stack.push({ item: children[index], depth: depth + 1 })
		}
	}

	return {
		attachments_count: attachmentsCount,
		tree_depth: treeDepth,
		root_count: items.length,
		hidden_count: hiddenCount,
		directory_count: directoryCount,
		file_count: fileCount,
	}
}

export function createFileTreePerfScope(items: FileTreeLike[] = []) {
	return createManualPerfScope(() => collectFileTreeStats(items))
}

export function measureFileTreeOperation<T>(
	metric: string,
	items: FileTreeLike[],
	callback: () => T,
	data?: MetricDataFactory<T>,
): T {
	return createFileTreePerfScope(items).measure(metric, callback, data)
}
