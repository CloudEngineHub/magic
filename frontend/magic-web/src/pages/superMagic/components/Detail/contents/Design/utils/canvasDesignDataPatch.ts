import type { CanvasDesignDataPatch } from "@/components/CanvasDesign/types"
import {
	ElementTypeEnum,
	type CanvasDocument,
	type FrameElement,
	type GroupElement,
	type LayerElement,
} from "@/components/CanvasDesign/canvas/types"

type ContainerLayerElement = FrameElement | GroupElement

function cloneElement(element: LayerElement): LayerElement {
	return JSON.parse(JSON.stringify(element)) as LayerElement
}

function cloneElements(elements: LayerElement[] | undefined): LayerElement[] {
	return (elements ?? []).map(cloneElement)
}

function isContainerElement(element: LayerElement): element is ContainerLayerElement {
	return element.type === ElementTypeEnum.Frame || element.type === ElementTypeEnum.Group
}

function hasChildren(element: LayerElement): element is ContainerLayerElement & {
	children: LayerElement[]
} {
	return isContainerElement(element) && Array.isArray(element.children)
}

function sortByZIndexStable(elements: LayerElement[]): LayerElement[] {
	return elements
		.map((element, index) => ({ element, index }))
		.sort((a, b) => {
			const zIndexDiff = (a.element.zIndex ?? 0) - (b.element.zIndex ?? 0)
			if (zIndexDiff !== 0) return zIndexDiff
			return a.index - b.index
		})
		.map((entry) => entry.element)
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

	return sortByZIndexStable([...siblings, element])
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
			if (!isContainerElement(candidate)) {
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

export function applyCanvasDesignDataPatch(
	canvasData: CanvasDocument | undefined,
	patch: CanvasDesignDataPatch,
): CanvasDocument {
	let elements = cloneElements(canvasData?.elements)

	patch.deletedElementIds.forEach((elementId) => {
		elements = removeElementById(elements, elementId).elements
	})

	patch.upserts.forEach((upsert) => {
		const element = cloneElement(upsert.element)
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
		elements = upsertResult.inserted
			? upsertResult.elements
			: insertIntoSiblings(removeResult.elements, element)
	})

	return {
		...(canvasData ?? {}),
		elements,
	}
}
