import {
	getCanvasResourceFileName,
	getCanvasResourceIdentity,
} from "../../../runtime/shared/path/canvasResourcePath"
import type { MessageEditorMentionChangeContext } from "./MessageEditor"

interface ReconcileMentionPathsOptions {
	incomingPaths: string[]
	persistedPaths: string[]
	source: MessageEditorMentionChangeContext["source"]
	resolveAbsolutePath?: (path: string) => string
}

/**
 * MessageEditor 从纯文本恢复 mention 时只能看到文件名，无法可靠区分同名资源。
 * sync 来源因此以已经持久化的引用为准；用户显式编辑仍直接采用编辑器给出的路径。
 */
export function reconcileMentionPathsWithPersistedReferences(
	options: ReconcileMentionPathsOptions,
): string[] {
	const { incomingPaths, persistedPaths, source, resolveAbsolutePath } = options
	if (source !== "sync" || incomingPaths.length === 0 || persistedPaths.length === 0) {
		return incomingPaths
	}

	const incomingIndexesByFileName = new Map<string, number[]>()
	incomingPaths.forEach((path, index) => {
		const fileName = getCanvasResourceFileName(path)
		if (!fileName) return
		const indexes = incomingIndexesByFileName.get(fileName) ?? []
		indexes.push(index)
		incomingIndexesByFileName.set(fileName, indexes)
	})

	const persistedPathsByFileName = new Map<string, string[]>()
	const persistedIdentitiesByFileName = new Map<string, Set<string>>()
	persistedPaths.forEach((path) => {
		const fileName = getCanvasResourceFileName(path)
		if (!fileName || !incomingIndexesByFileName.has(fileName)) return

		const identity = getCanvasResourceIdentity(path, resolveAbsolutePath)
		const identities = persistedIdentitiesByFileName.get(fileName) ?? new Set<string>()
		if (identity && identities.has(identity)) return

		if (identity) identities.add(identity)
		persistedIdentitiesByFileName.set(fileName, identities)
		const paths = persistedPathsByFileName.get(fileName) ?? []
		paths.push(path)
		persistedPathsByFileName.set(fileName, paths)
	})

	const reconciledPaths = [...incomingPaths]
	incomingIndexesByFileName.forEach((incomingIndexes, fileName) => {
		const currentPaths = persistedPathsByFileName.get(fileName)
		if (!currentPaths?.length) return

		const selectedPaths = currentPaths.slice(0, incomingIndexes.length)
		const selectedIdentities = new Set(
			selectedPaths
				.map((path) => getCanvasResourceIdentity(path, resolveAbsolutePath))
				.filter(Boolean),
		)
		const incomingGroupPaths = incomingIndexes.map((index) => incomingPaths[index])

		for (const path of incomingGroupPaths) {
			if (selectedPaths.length >= incomingIndexes.length) break
			const identity = getCanvasResourceIdentity(path, resolveAbsolutePath)
			if (identity && selectedIdentities.has(identity)) continue
			selectedPaths.push(path)
			if (identity) selectedIdentities.add(identity)
		}

		for (const path of incomingGroupPaths) {
			if (selectedPaths.length >= incomingIndexes.length) break
			selectedPaths.push(path)
		}

		incomingIndexes.forEach((index, groupIndex) => {
			reconciledPaths[index] = selectedPaths[groupIndex] ?? incomingPaths[index]
		})
	})

	return reconciledPaths
}
