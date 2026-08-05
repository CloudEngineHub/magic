import { diffArrays } from "diff"

/** 一段相对于基准文本的行级修改。 */
interface LineChange {
	start: number
	end: number
	lines: string[]
}

/** 三方合并结果。 */
export interface MemoryMergeResult {
	content: string
	hasConflicts: boolean
}

/** 将正文拆为可保持末尾换行语义的行数组。 */
function splitLines(content: string): string[] {
	return content.split("\n")
}

/** 计算某一版本相对于基准版本的连续行级修改。 */
function buildLineChanges(baseLines: string[], targetLines: string[]): LineChange[] {
	const diff = diffArrays(baseLines, targetLines)
	const changes: LineChange[] = []
	let baseIndex = 0
	let pendingChange: LineChange | null = null

	/** 将当前连续修改写入结果。 */
	const flushPendingChange = () => {
		if (!pendingChange) return
		changes.push(pendingChange)
		pendingChange = null
	}

	for (const part of diff) {
		const lines = part.value
		if (!part.added && !part.removed) {
			flushPendingChange()
			baseIndex += lines.length
			continue
		}

		pendingChange ??= {
			start: baseIndex,
			end: baseIndex,
			lines: [],
		}

		if (part.removed) {
			baseIndex += lines.length
			pendingChange.end = baseIndex
		} else {
			pendingChange.lines.push(...lines)
		}
	}

	flushPendingChange()
	return changes
}

/** 判断左侧修改是否完全位于右侧修改之前。 */
function isChangeBefore(left: LineChange, right: LineChange): boolean {
	if (left.end < right.start) return true
	if (left.end > right.start) return false

	const bothInsertAtSamePosition =
		left.start === left.end && right.start === right.end && left.start === right.start
	return !bothInsertAtSamePosition
}

/** 判断修改是否与当前待合并区域相交。 */
function intersectsRegion(change: LineChange, region: LineChange): boolean {
	return !isChangeBefore(change, region) && !isChangeBefore(region, change)
}

/** 在指定基准区间应用一组已排序的修改。 */
function applyChanges(
	baseLines: string[],
	regionStart: number,
	regionEnd: number,
	changes: LineChange[],
): string[] {
	const result: string[] = []
	let cursor = regionStart

	for (const change of changes) {
		result.push(...baseLines.slice(cursor, change.start))
		result.push(...change.lines)
		cursor = change.end
	}

	result.push(...baseLines.slice(cursor, regionEnd))
	return result
}

/** 判断两个行数组是否完全一致。 */
function areLinesEqual(left: string[], right: string[]): boolean {
	return left.length === right.length && left.every((line, index) => line === right[index])
}

/**
 * 基于共同编辑基准合并本地草稿与服务器最新正文。
 *
 * 非重叠修改自动合并，重叠且不同的修改保留标准冲突标记交由用户处理。
 */
export function mergeMemoryContent(
	baseContent: string,
	localContent: string,
	remoteContent: string,
	labels: { local: string; remote: string },
): MemoryMergeResult {
	if (localContent === remoteContent) {
		return { content: localContent, hasConflicts: false }
	}
	if (localContent === baseContent) {
		return { content: remoteContent, hasConflicts: false }
	}
	if (remoteContent === baseContent) {
		return { content: localContent, hasConflicts: false }
	}

	const baseLines = splitLines(baseContent)
	const localChanges = buildLineChanges(baseLines, splitLines(localContent))
	const remoteChanges = buildLineChanges(baseLines, splitLines(remoteContent))
	const mergedLines: string[] = []
	let localIndex = 0
	let remoteIndex = 0
	let baseCursor = 0
	let hasConflicts = false

	/** 应用一侧不与另一侧重叠的修改。 */
	const appendIndependentChange = (change: LineChange) => {
		mergedLines.push(...baseLines.slice(baseCursor, change.start))
		mergedLines.push(...change.lines)
		baseCursor = change.end
	}

	while (localIndex < localChanges.length || remoteIndex < remoteChanges.length) {
		const localChange = localChanges[localIndex]
		const remoteChange = remoteChanges[remoteIndex]

		if (localChange && (!remoteChange || isChangeBefore(localChange, remoteChange))) {
			appendIndependentChange(localChange)
			localIndex += 1
			continue
		}

		if (remoteChange && (!localChange || isChangeBefore(remoteChange, localChange))) {
			appendIndependentChange(remoteChange)
			remoteIndex += 1
			continue
		}

		if (!localChange || !remoteChange) break

		const localGroup: LineChange[] = []
		const remoteGroup: LineChange[] = []
		const region: LineChange = {
			start: Math.min(localChange.start, remoteChange.start),
			end: Math.max(localChange.end, remoteChange.end),
			lines: [],
		}

		let expanded = true
		while (expanded) {
			expanded = false

			while (
				localIndex < localChanges.length &&
				intersectsRegion(localChanges[localIndex], region)
			) {
				const change = localChanges[localIndex]
				localGroup.push(change)
				region.start = Math.min(region.start, change.start)
				region.end = Math.max(region.end, change.end)
				localIndex += 1
				expanded = true
			}

			while (
				remoteIndex < remoteChanges.length &&
				intersectsRegion(remoteChanges[remoteIndex], region)
			) {
				const change = remoteChanges[remoteIndex]
				remoteGroup.push(change)
				region.start = Math.min(region.start, change.start)
				region.end = Math.max(region.end, change.end)
				remoteIndex += 1
				expanded = true
			}
		}

		mergedLines.push(...baseLines.slice(baseCursor, region.start))
		const localLines = applyChanges(baseLines, region.start, region.end, localGroup)
		const remoteLines = applyChanges(baseLines, region.start, region.end, remoteGroup)

		if (areLinesEqual(localLines, remoteLines)) {
			mergedLines.push(...localLines)
		} else {
			hasConflicts = true
			mergedLines.push(`<<<<<<< ${labels.local}`)
			mergedLines.push(...localLines)
			mergedLines.push("=======")
			mergedLines.push(...remoteLines)
			mergedLines.push(`>>>>>>> ${labels.remote}`)
		}
		baseCursor = region.end
	}

	mergedLines.push(...baseLines.slice(baseCursor))
	return {
		content: mergedLines.join("\n"),
		hasConflicts,
	}
}
