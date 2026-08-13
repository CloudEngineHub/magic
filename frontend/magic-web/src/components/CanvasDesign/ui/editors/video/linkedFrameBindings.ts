import type { LinkedFrameBinding } from "./video-editor-config.types"
import { getLinkedMediaReferenceIdentity } from "../connection/linkedEditorInputs"

interface ReconcileLinkedFrameBindingsOptions {
	previous: Array<LinkedFrameBinding | undefined>
	currentFrameImages: Array<string | undefined>
	supportsStartFrame: boolean
	supportsEndFrame: boolean
}

interface LinkedFrameSourceItem {
	connectionId: string
	kind: string
	path?: string
	fileName?: string
}

export interface LinkedFrameImageUpdate {
	slotIndex: number
	path: string
	fileName: string
}

interface SynchronizeLinkedFrameBindingsOptions extends ReconcileLinkedFrameBindingsOptions {
	linkedMediaItems: LinkedFrameSourceItem[]
}

export interface LinkedFrameBindingSyncResult {
	bindings: Array<LinkedFrameBinding | undefined>
	frameUpdates: LinkedFrameImageUpdate[]
}

function areLinkedFrameBindingsEqual(
	left: Array<LinkedFrameBinding | undefined>,
	right: Array<LinkedFrameBinding | undefined>,
): boolean {
	if (left.length !== right.length) return false
	// 首尾帧删除会产生稀疏数组，必须显式读取每个索引，不能使用会跳过空位的 every。
	for (let index = 0; index < left.length; index += 1) {
		const leftItem = left[index]
		const rightItem = right[index]
		if (
			getLinkedMediaReferenceIdentity(leftItem?.framePath) !==
			getLinkedMediaReferenceIdentity(rightItem?.framePath)
		) {
			return false
		}
		if (leftItem?.sourceConnectionId !== rightItem?.sourceConnectionId) return false
		if (
			getLinkedMediaReferenceIdentity(leftItem?.sourcePath) !==
			getLinkedMediaReferenceIdentity(rightItem?.sourcePath)
		) {
			return false
		}
		if (leftItem?.sourceKind !== rightItem?.sourceKind) return false
		if (leftItem?.sourceFileName !== rightItem?.sourceFileName) return false
		if (leftItem?.frameRole !== rightItem?.frameRole) return false
	}
	return true
}

/** 根据真实首尾帧槽位同步连线绑定；显式遍历索引，避免稀疏数组跳过已删除槽位。 */
export function reconcileLinkedFrameBindings(
	options: ReconcileLinkedFrameBindingsOptions,
): Array<LinkedFrameBinding | undefined> {
	const { previous, currentFrameImages, supportsStartFrame, supportsEndFrame } = options
	const frameRoles = [
		...(supportsStartFrame ? (["start"] as const) : []),
		...(supportsEndFrame ? (["end"] as const) : []),
	]
	const next = Array.from({ length: currentFrameImages.length }, (_, index) => {
		const path = currentFrameImages[index]
		if (!path) return undefined
		const pathIdentity = getLinkedMediaReferenceIdentity(path)
		const binding = previous.find(
			(item) => getLinkedMediaReferenceIdentity(item?.framePath) === pathIdentity,
		)
		return binding
			? { ...binding, frameRole: frameRoles[index] ?? binding.frameRole }
			: undefined
	})
	return areLinkedFrameBindingsEqual(previous, next) ? previous : next
}

/**
 * 连接仍存在时让首尾帧跟随源图片更新；连接删除、失效或更新后与另一帧重复时，
 * 保留当前帧快照但解除关联绑定。
 */
export function synchronizeLinkedFrameBindings(
	options: SynchronizeLinkedFrameBindingsOptions,
): LinkedFrameBindingSyncResult {
	const { previous, currentFrameImages, linkedMediaItems } = options
	const reconciled = reconcileLinkedFrameBindings(options)
	const next = [...reconciled]
	const frameUpdates: LinkedFrameImageUpdate[] = []

	next.forEach((binding, slotIndex) => {
		if (!binding) return
		const sourceItem = linkedMediaItems.find(
			(item) =>
				item.connectionId === binding.sourceConnectionId &&
				item.kind === "image" &&
				Boolean(item.path),
		)
		if (!sourceItem?.path) {
			next[slotIndex] = undefined
			return
		}

		const sourceIdentity = getLinkedMediaReferenceIdentity(sourceItem.path)
		const boundSourceIdentity = getLinkedMediaReferenceIdentity(binding.sourcePath)
		const sourceFileName = sourceItem.fileName || sourceItem.path
		if (sourceIdentity === boundSourceIdentity) {
			if (binding.sourceFileName !== sourceFileName) {
				next[slotIndex] = { ...binding, sourceFileName }
			}
			return
		}

		const duplicatesAnotherFrame = currentFrameImages.some(
			(path, index) =>
				index !== slotIndex &&
				Boolean(path) &&
				getLinkedMediaReferenceIdentity(path) === sourceIdentity,
		)
		if (duplicatesAnotherFrame) {
			next[slotIndex] = undefined
			return
		}

		next[slotIndex] = {
			...binding,
			framePath: sourceItem.path,
			sourcePath: sourceItem.path,
			sourceFileName,
		}
		frameUpdates.push({
			slotIndex,
			path: sourceItem.path,
			fileName: sourceFileName,
		})
	})

	return {
		bindings: areLinkedFrameBindingsEqual(previous, next) ? previous : next,
		frameUpdates,
	}
}
