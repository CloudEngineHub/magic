import type { Canvas } from "../../../runtime/core/Canvas"
import type { StoredLinkedEditorDraft } from "../../../public/magic-types"

const LINKED_EDITOR_DRAFT_VERSION = 1 as const

function uniqueStrings(values: unknown): string[] {
	if (!Array.isArray(values)) return []
	return Array.from(
		new Set(
			values.filter(
				(value): value is string => typeof value === "string" && value.length > 0,
			),
		),
	)
}

function areStringArraysEqual(left: string[], right: string[]): boolean {
	return left.length === right.length && left.every((value, index) => value === right[index])
}

export function createEmptyLinkedEditorDraft(): StoredLinkedEditorDraft {
	return {
		version: LINKED_EDITOR_DRAFT_VERSION,
		selectedTextConnectionIds: [],
		orderedTextConnectionIds: [],
		selectedMediaConnectionIds: [],
	}
}

export function normalizeLinkedEditorDraft(value: unknown): StoredLinkedEditorDraft {
	if (!value || typeof value !== "object") return createEmptyLinkedEditorDraft()
	const draft = value as Partial<StoredLinkedEditorDraft>
	return {
		version: LINKED_EDITOR_DRAFT_VERSION,
		selectedTextConnectionIds: uniqueStrings(draft.selectedTextConnectionIds),
		orderedTextConnectionIds: uniqueStrings(draft.orderedTextConnectionIds),
		selectedMediaConnectionIds: uniqueStrings(draft.selectedMediaConnectionIds),
	}
}

export function reconcileLinkedEditorDraft(
	draft: StoredLinkedEditorDraft,
	options: {
		textConnectionIds: string[]
		mediaConnectionIds: string[]
	},
): StoredLinkedEditorDraft {
	const textConnectionIdSet = new Set(options.textConnectionIds)
	const mediaConnectionIdSet = new Set(options.mediaConnectionIds)
	const selectedTextConnectionIds = draft.selectedTextConnectionIds.filter((connectionId) =>
		textConnectionIdSet.has(connectionId),
	)
	const selectedMediaConnectionIds = draft.selectedMediaConnectionIds.filter((connectionId) =>
		mediaConnectionIdSet.has(connectionId),
	)
	const orderedTextConnectionIds = [
		...draft.orderedTextConnectionIds.filter((connectionId) =>
			textConnectionIdSet.has(connectionId),
		),
		...options.textConnectionIds.filter(
			(connectionId) => !draft.orderedTextConnectionIds.includes(connectionId),
		),
	]

	if (
		areStringArraysEqual(selectedTextConnectionIds, draft.selectedTextConnectionIds) &&
		areStringArraysEqual(orderedTextConnectionIds, draft.orderedTextConnectionIds) &&
		areStringArraysEqual(selectedMediaConnectionIds, draft.selectedMediaConnectionIds)
	) {
		return draft
	}

	return {
		version: LINKED_EDITOR_DRAFT_VERSION,
		selectedTextConnectionIds,
		orderedTextConnectionIds,
		selectedMediaConnectionIds,
	}
}

export function getLinkedEditorDraftFromStorage(
	canvas: Canvas,
	targetElementId: string,
): StoredLinkedEditorDraft {
	const storage = canvas.magicConfigManager.config?.methods?.getStorage?.()
	return normalizeLinkedEditorDraft(storage?.tempLinkedEditorDrafts?.[targetElementId])
}

export function saveLinkedEditorDraftToStorage(
	canvas: Canvas,
	targetElementId: string,
	draft: StoredLinkedEditorDraft,
): void {
	const methods = canvas.magicConfigManager.config?.methods
	if (!methods?.getStorage || !methods.saveStorage) return
	const storage = methods.getStorage() || {}
	const normalizedDraft = normalizeLinkedEditorDraft(draft)
	const previousDraft = storage.tempLinkedEditorDrafts?.[targetElementId]
	const isEmpty =
		normalizedDraft.selectedTextConnectionIds.length === 0 &&
		normalizedDraft.orderedTextConnectionIds.length === 0 &&
		normalizedDraft.selectedMediaConnectionIds.length === 0
	if (isEmpty) {
		if (previousDraft) clearLinkedEditorDraftFromStorage(canvas, targetElementId)
		return
	}
	if (JSON.stringify(previousDraft) === JSON.stringify(normalizedDraft)) return

	methods.saveStorage({
		...storage,
		tempLinkedEditorDrafts: {
			...(storage.tempLinkedEditorDrafts || {}),
			[targetElementId]: normalizedDraft,
		},
	})
}

export function clearLinkedEditorDraftFromStorage(canvas: Canvas, targetElementId: string): void {
	const methods = canvas.magicConfigManager.config?.methods
	if (!methods?.getStorage || !methods.saveStorage) return
	const storage = methods.getStorage()
	if (!storage?.tempLinkedEditorDrafts?.[targetElementId]) return
	const tempLinkedEditorDrafts = { ...storage.tempLinkedEditorDrafts }
	delete tempLinkedEditorDrafts[targetElementId]
	methods.saveStorage({
		...storage,
		tempLinkedEditorDrafts,
	})
}
