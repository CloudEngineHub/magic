import {
	ElementTypeEnum,
	type CanvasDocument,
	type FrameElement,
	type GroupElement,
	type LayerElement,
} from "./types"

export type CanvasDocumentElementParentId = string | null
export type CanvasDocumentContainerElement = FrameElement | GroupElement

const ROOT_PARENT_KEY = "__root__"

export interface CanvasDocumentElementRecord {
	id: string
	parentId: CanvasDocumentElementParentId
	ancestorIds: string[]
	element: LayerElement
	ownHash: string
}

export interface CanvasDocumentElementIndex {
	records: Map<string, CanvasDocumentElementRecord>
	duplicateElementIds: Set<string>
}

export interface CanvasDocumentElementDiff {
	added: Set<string>
	deleted: Set<string>
	updated: Set<string>
	moved: Set<string>
	changed: Set<string>
	parentStructureChangedByParent: Map<string, Set<string>>
}

export function cloneCanvasJson<T>(value: T): T {
	return JSON.parse(JSON.stringify(value)) as T
}

export function cloneCanvasElement(element: LayerElement): LayerElement {
	return cloneCanvasJson(element)
}

export function cloneCanvasElements(elements: LayerElement[] | undefined): LayerElement[] {
	return (elements ?? []).map(cloneCanvasElement)
}

export function isCanvasContainerElement(
	element: LayerElement,
): element is CanvasDocumentContainerElement {
	return element.type === ElementTypeEnum.Frame || element.type === ElementTypeEnum.Group
}

export function getCanvasElementChildren(element: LayerElement): LayerElement[] | undefined {
	return isCanvasContainerElement(element) && Array.isArray(element.children)
		? element.children
		: undefined
}

export function getCanvasElementOwnDataForHash(
	element: LayerElement,
): Omit<LayerElement, "children"> {
	const ownElement = {
		...(element as LayerElement & {
			children?: LayerElement[]
		}),
	}
	delete ownElement.children
	return ownElement as Omit<LayerElement, "children">
}

export function hashCanvasJson(value: unknown): string {
	return JSON.stringify(value)
}

export function canvasParentKey(parentId: CanvasDocumentElementParentId): string {
	return parentId ?? ROOT_PARENT_KEY
}

export function toSortedCanvasElementIdArray(values: Iterable<string>): string[] {
	return Array.from(values).sort()
}

export function isCanvasElementIdSetEmpty(values: Set<string>): boolean {
	return values.size === 0
}

export function addCanvasElementIds(target: Set<string>, source: Iterable<string>): void {
	for (const value of source) target.add(value)
}

export function intersectCanvasElementIdSets(left: Set<string>, right: Set<string>): string[] {
	const result: string[] = []
	left.forEach((value) => {
		if (right.has(value)) result.push(value)
	})
	return result.sort()
}

function flattenCanvasElements(
	elements: LayerElement[] | undefined,
	parentId: CanvasDocumentElementParentId,
	ancestorIds: string[],
	index: CanvasDocumentElementIndex,
): void {
	;(elements ?? []).forEach((element) => {
		const children = getCanvasElementChildren(element)
		const record: CanvasDocumentElementRecord = {
			id: element.id,
			parentId,
			ancestorIds,
			element,
			ownHash: hashCanvasJson(getCanvasElementOwnDataForHash(element)),
		}

		if (index.records.has(element.id)) {
			index.duplicateElementIds.add(element.id)
		}
		index.records.set(element.id, record)

		flattenCanvasElements(children, element.id, [...ancestorIds, element.id], index)
	})
}

export function buildCanvasDocumentElementIndex(
	canvas: CanvasDocument | undefined,
): CanvasDocumentElementIndex {
	const index: CanvasDocumentElementIndex = {
		records: new Map(),
		duplicateElementIds: new Set(),
	}
	flattenCanvasElements(canvas?.elements, null, [], index)
	return index
}

export function findCanvasDocumentElementById(
	canvas: CanvasDocument | undefined,
	elementId: string,
): LayerElement | null {
	return buildCanvasDocumentElementIndex(canvas).records.get(elementId)?.element ?? null
}

export function findCanvasDocumentElementParentId(
	canvas: CanvasDocument | undefined,
	elementId: string,
): string | null {
	return buildCanvasDocumentElementIndex(canvas).records.get(elementId)?.parentId ?? null
}

function hasCanvasElementAncestorInSet(
	record: CanvasDocumentElementRecord,
	ids: Set<string>,
): boolean {
	return record.ancestorIds.some((ancestorId) => ids.has(ancestorId))
}

function addCanvasParentStructureChange(
	changes: Map<string, Set<string>>,
	parentId: CanvasDocumentElementParentId,
	elementId: string,
): void {
	const key = canvasParentKey(parentId)
	const ids = changes.get(key) ?? new Set<string>()
	ids.add(elementId)
	changes.set(key, ids)
}

function addTopmostCanvasParentStructureChanges(
	changedIds: Set<string>,
	index: CanvasDocumentElementIndex,
	changes: Map<string, Set<string>>,
): void {
	changedIds.forEach((elementId) => {
		const record = index.records.get(elementId)
		if (!record || hasCanvasElementAncestorInSet(record, changedIds)) return
		addCanvasParentStructureChange(changes, record.parentId, elementId)
	})
}

export function createCanvasDocumentElementDiff(
	base: CanvasDocumentElementIndex,
	target: CanvasDocumentElementIndex,
): CanvasDocumentElementDiff {
	const added = new Set<string>()
	const deleted = new Set<string>()
	const updated = new Set<string>()
	const moved = new Set<string>()

	target.records.forEach((targetRecord, elementId) => {
		const baseRecord = base.records.get(elementId)
		if (!baseRecord) {
			added.add(elementId)
			return
		}
		if (baseRecord.ownHash !== targetRecord.ownHash) {
			updated.add(elementId)
		}
		if (baseRecord.parentId !== targetRecord.parentId) {
			moved.add(elementId)
		}
	})

	base.records.forEach((_baseRecord, elementId) => {
		if (!target.records.has(elementId)) {
			deleted.add(elementId)
		}
	})

	const parentStructureChangedByParent = new Map<string, Set<string>>()
	addTopmostCanvasParentStructureChanges(added, target, parentStructureChangedByParent)
	addTopmostCanvasParentStructureChanges(deleted, base, parentStructureChangedByParent)
	moved.forEach((elementId) => {
		const baseRecord = base.records.get(elementId)
		const targetRecord = target.records.get(elementId)
		if (baseRecord) {
			addCanvasParentStructureChange(
				parentStructureChangedByParent,
				baseRecord.parentId,
				elementId,
			)
		}
		if (targetRecord) {
			addCanvasParentStructureChange(
				parentStructureChangedByParent,
				targetRecord.parentId,
				elementId,
			)
		}
	})

	const changed = new Set<string>()
	addCanvasElementIds(changed, added)
	addCanvasElementIds(changed, deleted)
	addCanvasElementIds(changed, updated)
	addCanvasElementIds(changed, moved)

	return {
		added,
		deleted,
		updated,
		moved,
		changed,
		parentStructureChangedByParent,
	}
}

export function sortCanvasElementIdsByTreeDepth(
	ids: Iterable<string>,
	index: CanvasDocumentElementIndex,
): string[] {
	return Array.from(ids).sort((left, right) => {
		const leftDepth = index.records.get(left)?.ancestorIds.length ?? 0
		const rightDepth = index.records.get(right)?.ancestorIds.length ?? 0
		if (leftDepth !== rightDepth) return leftDepth - rightDepth
		return left.localeCompare(right)
	})
}

export function sortCanvasElementsByZIndexStable(elements: LayerElement[]): LayerElement[] {
	return elements
		.map((element, index) => ({ element, index }))
		.sort((a, b) => {
			const zIndexDiff = (a.element.zIndex ?? 0) - (b.element.zIndex ?? 0)
			if (zIndexDiff !== 0) return zIndexDiff
			return a.index - b.index
		})
		.map((entry) => entry.element)
}
