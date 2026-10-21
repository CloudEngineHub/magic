import { useSyncExternalStore } from "react"
import {
	ElementTypeEnum,
	type LayerElement,
} from "@/components/CanvasDesign/runtime/document/types"
import type { CanvasElementResolvedFile } from "@/components/business/MentionPanel/runtime/builtin/domains/canvas-elements"

export interface CanvasElementFileIndex {
	elementIdsByFileId: ReadonlyMap<string, readonly string[]>
}

export interface BuildCanvasElementFileIndexOptions {
	elements?: LayerElement[] | null
	resolveFileBySrc: (src: string) => CanvasElementResolvedFile | null
}

const EMPTY_ELEMENT_IDS: readonly string[] = []
const indexesByDesignProjectId = new Map<string, CanvasElementFileIndex>()
const listeners = new Set<() => void>()

function emitChange() {
	listeners.forEach((listener) => listener())
}

function normalizeFileId(fileId: string | number | undefined): string | undefined {
	if (fileId === undefined || fileId === null) return undefined
	const normalized = String(fileId).trim()
	return normalized || undefined
}

/** 建立当前 Canvas 媒体元素与项目文件 ID 的索引，供消息附件反查定位目标。 */
export function buildCanvasElementFileIndex({
	elements,
	resolveFileBySrc,
}: BuildCanvasElementFileIndexOptions): CanvasElementFileIndex {
	const elementIdsByFileId = new Map<string, Set<string>>()

	const collect = (items: LayerElement[] | null | undefined) => {
		for (const element of items ?? []) {
			if (element.type === ElementTypeEnum.Frame || element.type === ElementTypeEnum.Group) {
				collect(element.children)
				continue
			}
			if (element.type !== ElementTypeEnum.Image && element.type !== ElementTypeEnum.Video) {
				continue
			}

			for (const content of element.contents) {
				if (!content.src) continue
				const fileId = normalizeFileId(resolveFileBySrc(content.src)?.file_id)
				if (!fileId) continue
				const elementIds = elementIdsByFileId.get(fileId)
				if (elementIds) {
					elementIds.add(element.id)
				} else {
					elementIdsByFileId.set(fileId, new Set([element.id]))
				}
			}
		}
	}

	collect(elements)

	return {
		elementIdsByFileId: new Map(
			Array.from(elementIdsByFileId, ([fileId, elementIds]) => [
				fileId,
				Array.from(elementIds),
			]),
		),
	}
}

export function setCanvasElementFileIndex(
	designProjectId: string | undefined,
	index: CanvasElementFileIndex | null,
) {
	if (!designProjectId) return
	if (index) {
		indexesByDesignProjectId.set(designProjectId, index)
	} else {
		indexesByDesignProjectId.delete(designProjectId)
	}
	emitChange()
}

export function getCanvasElementFileIndex(
	designProjectId?: string | null,
): CanvasElementFileIndex | undefined {
	if (!designProjectId) return undefined
	return indexesByDesignProjectId.get(designProjectId)
}

export function getCanvasElementIdsByFileId(
	designProjectId: string | null | undefined,
	fileId: string | null | undefined,
): readonly string[] {
	const normalizedFileId = normalizeFileId(fileId ?? undefined)
	if (!normalizedFileId) return EMPTY_ELEMENT_IDS
	return (
		getCanvasElementFileIndex(designProjectId)?.elementIdsByFileId.get(normalizedFileId) ??
		EMPTY_ELEMENT_IDS
	)
}

export function subscribeCanvasElementFileIndex(listener: () => void) {
	listeners.add(listener)
	return () => {
		listeners.delete(listener)
	}
}

export function useCanvasElementFileIndex(
	designProjectId?: string | null,
): CanvasElementFileIndex | undefined {
	return useSyncExternalStore(
		subscribeCanvasElementFileIndex,
		() => getCanvasElementFileIndex(designProjectId),
		() => undefined,
	)
}
