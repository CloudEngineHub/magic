import type { CanvasConnection, CanvasDocument, LayerElement } from "./types"
import {
	cloneCanvasConnection,
	cloneCanvasConnections,
	getCanvasDocumentElementIdSet,
	sanitizeCanvasConnections,
} from "./connectionIndex"
import {
	cloneCanvasElement,
	cloneCanvasElements,
	isCanvasContainerElement,
	sortCanvasElementsByZIndexStable,
	type CanvasDocumentContainerElement,
} from "./elementIndex"

export interface CanvasDocumentElementNameChange {
	elementId: string
	elementType: LayerElement["type"]
	oldName?: string
	newName?: string
	oldSrc?: string
	newSrc?: string
}

export interface CanvasDocumentPatch {
	upserts: Array<{
		element: LayerElement
		parentId: string | null
	}>
	deletedElementIds: string[]
	changedElementIds: string[]
	elementNameChanges?: CanvasDocumentElementNameChange[]
	connectionUpserts?: CanvasConnection[]
	deletedConnectionIds?: string[]
	changedConnectionIds?: string[]
}

export interface CanvasDocumentPatchApplyOptions {
	strictParent?: boolean
}

export type CanvasDocumentPatchApplyResult =
	| {
			ok: true
			canvas: CanvasDocument
	  }
	| {
			ok: false
			reason: "missing-parent"
			canvas: CanvasDocument
			elementId: string
			parentId: string | null
	  }

function hasChildren(element: LayerElement): element is CanvasDocumentContainerElement & {
	children: LayerElement[]
} {
	return isCanvasContainerElement(element) && Array.isArray(element.children)
}

function removeElementById(
	elements: LayerElement[],
	elementId: string,
	parentId: string | null = null,
): {
	elements: LayerElement[]
	removed?: { parentId: string | null; index: number }
} {
	let removed: { parentId: string | null; index: number } | undefined
	const nextElements: LayerElement[] = []

	elements.forEach((element, index) => {
		if (element.id === elementId) {
			removed = { parentId, index }
			return
		}

		if (hasChildren(element)) {
			const childResult = removeElementById(element.children, elementId, element.id)
			if (childResult.removed) {
				removed = childResult.removed
				nextElements.push({
					...element,
					children: childResult.elements,
				})
				return
			}
		}

		nextElements.push(element)
	})

	return { elements: nextElements, removed }
}

function insertIntoSiblings(
	siblings: LayerElement[],
	element: LayerElement,
	preferredIndex?: number,
): LayerElement[] {
	if (preferredIndex !== undefined) {
		const next = [...siblings]
		next.splice(Math.min(preferredIndex, next.length), 0, element)
		return next
	}

	return sortCanvasElementsByZIndexStable([...siblings, element])
}

function upsertElementIntoParent(
	elements: LayerElement[],
	element: LayerElement,
	parentId: string | null,
	preferredIndex?: number,
): { elements: LayerElement[]; inserted: boolean } {
	if (parentId === null) {
		return {
			elements: insertIntoSiblings(elements, element, preferredIndex),
			inserted: true,
		}
	}

	let inserted = false
	const nextElements = elements.map((candidate) => {
		if (candidate.id === parentId) {
			if (!isCanvasContainerElement(candidate)) {
				return candidate
			}
			inserted = true
			const children = candidate.children ?? []
			return {
				...candidate,
				children: insertIntoSiblings(children, element, preferredIndex),
			}
		}

		if (hasChildren(candidate)) {
			const childResult = upsertElementIntoParent(
				candidate.children,
				element,
				parentId,
				preferredIndex,
			)
			if (childResult.inserted) {
				inserted = true
				return { ...candidate, children: childResult.elements }
			}
		}

		return candidate
	})

	return { elements: nextElements, inserted }
}

export function applyCanvasDocumentPatch(
	canvasData: CanvasDocument | undefined,
	patch: CanvasDocumentPatch,
	options: CanvasDocumentPatchApplyOptions = {},
): CanvasDocument {
	return tryApplyCanvasDocumentPatch(canvasData, patch, options).canvas
}

export function tryApplyCanvasDocumentPatch(
	canvasData: CanvasDocument | undefined,
	patch: CanvasDocumentPatch,
	options: CanvasDocumentPatchApplyOptions = {},
): CanvasDocumentPatchApplyResult {
	let elements = cloneCanvasElements(canvasData?.elements)
	let connections = cloneCanvasConnections(canvasData?.connections)

	patch.deletedElementIds.forEach((elementId) => {
		elements = removeElementById(elements, elementId).elements
	})

	for (const upsert of patch.upserts) {
		const element = cloneCanvasElement(upsert.element)
		const removeResult = removeElementById(elements, element.id)
		const preferredIndex =
			removeResult.removed?.parentId === upsert.parentId
				? removeResult.removed.index
				: undefined
		const upsertResult = upsertElementIntoParent(
			removeResult.elements,
			element,
			upsert.parentId,
			preferredIndex,
		)
		if (!upsertResult.inserted && options.strictParent) {
			return {
				ok: false,
				reason: "missing-parent",
				canvas: {
					...(canvasData ?? {}),
					elements: removeResult.elements,
					connections: sanitizeCanvasConnections(
						connections,
						getCanvasDocumentElementIdSet(removeResult.elements),
					),
				},
				elementId: element.id,
				parentId: upsert.parentId,
			}
		}
		elements = upsertResult.inserted
			? upsertResult.elements
			: insertIntoSiblings(removeResult.elements, element)
	}

	const deletedConnectionIds = new Set(patch.deletedConnectionIds ?? [])
	connections = connections.filter((connection) => !deletedConnectionIds.has(connection.id))

	for (const connection of patch.connectionUpserts ?? []) {
		const clonedConnection = cloneCanvasConnection(connection)
		connections = [
			...connections.filter((item) => item.id !== clonedConnection.id),
			clonedConnection,
		]
	}
	connections = sanitizeCanvasConnections(connections, getCanvasDocumentElementIdSet(elements))

	return {
		ok: true,
		canvas: {
			...(canvasData ?? {}),
			elements,
			...(connections.length > 0 ? { connections } : { connections: undefined }),
		},
	}
}
