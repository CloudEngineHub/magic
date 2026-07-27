import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useCanvasEvent } from "../../../app/hooks/canvas"
import { useCanvas } from "../../../app/providers/CanvasProvider"
import type { CropConfig } from "../../../runtime/document/types"
import {
	resolveLinkedEditorInputs,
	resolveLinkedMediaSelection,
	getLinkedMediaConnectionIdsToDeselectAfterMentionChange,
	type LinkedEditorInputsResolution,
	type LinkedEditorMediaItem,
	type LinkedEditorMediaPolicy,
	type LinkedEditorMediaReference,
	type LinkedEditorTargetKind,
} from "./linkedEditorInputs"
import { getLinkedTextPromptText } from "./linkedTextPrompt"
import {
	clearLinkedEditorDraftFromStorage,
	createEmptyLinkedEditorDraft,
	getLinkedEditorDraftFromStorage,
	reconcileLinkedEditorDraft,
	saveLinkedEditorDraftToStorage,
} from "./linkedEditorDraft"
import type { StoredLinkedEditorDraft } from "../../../public/magic-types"

export interface LinkedEditorInputsState extends LinkedEditorInputsResolution {
	isTextConnectionSelected: (connectionId: string) => boolean
	setTextConnectionSelected: (connectionId: string, selected: boolean) => void
	setMediaConnectionSelected: (connectionId: string, selected: boolean) => void
	handleMentionedReferencePathsChange: (
		paths: string[],
		options?: { deselectRemoved?: boolean },
	) => void
	reorderTextConnections: (activeConnectionId: string, overConnectionId: string) => void
}

interface UseLinkedEditorInputsOptions {
	targetElementId: string
	targetKind: LinkedEditorTargetKind
	enabled?: boolean
	mediaPolicy?: LinkedEditorMediaPolicy
}

function areCropConfigsEqual(a?: CropConfig, b?: CropConfig): boolean {
	if (a === b) return true
	if (!a || !b) return false
	return (
		a.x === b.x &&
		a.y === b.y &&
		a.width === b.width &&
		a.height === b.height &&
		a.displayWidth === b.displayWidth &&
		a.displayHeight === b.displayHeight
	)
}

function areLinkedMediaItemsEqual(
	prev: LinkedEditorMediaItem[],
	next: LinkedEditorMediaItem[],
): boolean {
	if (prev.length !== next.length) return false
	for (let index = 0; index < prev.length; index += 1) {
		const prevItem = prev[index]
		const nextItem = next[index]
		if (!prevItem || !nextItem) return false
		if (prevItem.connectionId !== nextItem.connectionId) return false
		if (prevItem.sourceElementId !== nextItem.sourceElementId) return false
		if (prevItem.kind !== nextItem.kind) return false
		if (prevItem.path !== nextItem.path) return false
		if (prevItem.fileName !== nextItem.fileName) return false
		if (!areCropConfigsEqual(prevItem.sourceCrop, nextItem.sourceCrop)) return false
		if (prevItem.status !== nextItem.status) return false
		if (prevItem.reason !== nextItem.reason) return false
		if (prevItem.selected !== nextItem.selected) return false
		if (prevItem.selectionDisabledReason !== nextItem.selectionDisabledReason) return false
	}
	return true
}

function areLinkedMediaReferencesEqual(
	prev: LinkedEditorMediaReference[],
	next: LinkedEditorMediaReference[],
): boolean {
	if (prev.length !== next.length) return false
	for (let index = 0; index < prev.length; index += 1) {
		const prevItem = prev[index]
		const nextItem = next[index]
		if (!prevItem || !nextItem) return false
		if (prevItem.kind !== nextItem.kind) return false
		if (prevItem.path !== nextItem.path) return false
		if (!areCropConfigsEqual(prevItem.sourceCrop, nextItem.sourceCrop)) return false
	}
	return true
}

function areLinkedEditorInputsEqual(
	prev: LinkedEditorInputsResolution,
	next: LinkedEditorInputsResolution,
): boolean {
	if (prev.textPrompt !== next.textPrompt) return false
	if (prev.textConnections.length !== next.textConnections.length) return false
	for (let index = 0; index < prev.textConnections.length; index += 1) {
		const prevItem = prev.textConnections[index]
		const nextItem = next.textConnections[index]
		if (!prevItem || !nextItem) return false
		if (prevItem.connectionId !== nextItem.connectionId) return false
		if (prevItem.sourceElementId !== nextItem.sourceElementId) return false
		if (prevItem.text !== nextItem.text) return false
	}
	return (
		areLinkedMediaItemsEqual(prev.mediaItems, next.mediaItems) &&
		areLinkedMediaReferencesEqual(prev.activeMediaReferences, next.activeMediaReferences)
	)
}

export function useLinkedEditorInputs(
	options: UseLinkedEditorInputsOptions,
): LinkedEditorInputsState {
	const { targetElementId, targetKind, enabled = true, mediaPolicy } = options
	const { canvas } = useCanvas()
	const [resolution, setResolution] = useState<LinkedEditorInputsResolution>(() =>
		resolveLinkedEditorInputs({
			canvas,
			targetElementId,
			targetKind,
			enabled,
			mediaPolicy,
		}),
	)
	const [editorDraft, setEditorDraft] = useState<StoredLinkedEditorDraft>(() =>
		canvas
			? getLinkedEditorDraftFromStorage(canvas, targetElementId)
			: createEmptyLinkedEditorDraft(),
	)
	const [hydratedDraftContext, setHydratedDraftContext] = useState<{
		canvas: NonNullable<typeof canvas>
		targetElementId: string
	} | null>(() => (canvas ? { canvas, targetElementId } : null))
	const mentionedMediaPathsRef = useRef<string[]>([])
	const currentTextConnectionIds = useMemo(
		() => resolution.textConnections.map((connection) => connection.connectionId),
		[resolution.textConnections],
	)
	const currentMediaConnectionIds = useMemo(
		() => resolution.mediaItems.map((item) => item.connectionId),
		[resolution.mediaItems],
	)
	const reconcileDraftForCurrentInputs = useCallback(
		(draft: StoredLinkedEditorDraft) =>
			reconcileLinkedEditorDraft(draft, {
				textConnectionIds: currentTextConnectionIds,
				mediaConnectionIds: currentMediaConnectionIds,
			}),
		[currentMediaConnectionIds, currentTextConnectionIds],
	)
	const reconciledEditorDraft = useMemo(
		() => reconcileDraftForCurrentInputs(editorDraft),
		[editorDraft, reconcileDraftForCurrentInputs],
	)
	const selectedTextConnectionIds = useMemo(
		() => new Set(reconciledEditorDraft.selectedTextConnectionIds),
		[reconciledEditorDraft.selectedTextConnectionIds],
	)
	const selectedMediaConnectionIds = reconciledEditorDraft.selectedMediaConnectionIds
	const orderedTextConnectionIds = reconciledEditorDraft.orderedTextConnectionIds

	const refreshInputs = useCallback(() => {
		const nextResolution = resolveLinkedEditorInputs({
			canvas,
			targetElementId,
			targetKind,
			enabled,
			mediaPolicy,
		})
		setResolution((prevResolution) =>
			areLinkedEditorInputsEqual(prevResolution, nextResolution)
				? prevResolution
				: nextResolution,
		)
	}, [canvas, enabled, mediaPolicy, targetElementId, targetKind])

	useEffect(() => {
		if (!canvas) {
			setHydratedDraftContext(null)
			return
		}
		setEditorDraft(getLinkedEditorDraftFromStorage(canvas, targetElementId))
		setHydratedDraftContext({ canvas, targetElementId })
	}, [canvas, targetElementId])

	useEffect(() => {
		refreshInputs()
	}, [refreshInputs])

	useCanvasEvent("connection:change", refreshInputs, [refreshInputs])
	useCanvasEvent("element:updated", refreshInputs, [refreshInputs])
	useCanvasEvent("element:deleted", refreshInputs, [refreshInputs])

	useEffect(() => {
		if (
			!canvas ||
			hydratedDraftContext?.canvas !== canvas ||
			hydratedDraftContext.targetElementId !== targetElementId
		) {
			return
		}
		setEditorDraft((previousDraft) => reconcileDraftForCurrentInputs(previousDraft))
	}, [canvas, hydratedDraftContext, reconcileDraftForCurrentInputs, targetElementId])

	const mediaSelectionResolution = useMemo(
		() =>
			resolveLinkedMediaSelection(resolution.mediaItems, selectedMediaConnectionIds, {
				targetKind,
				mediaPolicy,
			}),
		[mediaPolicy, resolution.mediaItems, selectedMediaConnectionIds, targetKind],
	)

	useEffect(() => {
		if (
			!canvas ||
			hydratedDraftContext?.canvas !== canvas ||
			hydratedDraftContext.targetElementId !== targetElementId
		) {
			return
		}
		saveLinkedEditorDraftToStorage(canvas, targetElementId, reconciledEditorDraft)
	}, [canvas, hydratedDraftContext, reconciledEditorDraft, targetElementId])

	useCanvasEvent(
		"element:deleted",
		(event) => {
			if (!canvas || event.data.elementId !== targetElementId) return
			clearLinkedEditorDraftFromStorage(canvas, targetElementId)
		},
		[canvas, targetElementId],
	)

	const orderedTextConnections = useMemo(() => {
		const connectionById = new Map(
			resolution.textConnections.map((connection) => [connection.connectionId, connection]),
		)
		const orderedIds = [
			...orderedTextConnectionIds,
			...resolution.textConnections.map((connection) => connection.connectionId),
		]
		const seenIds = new Set<string>()
		return orderedIds.flatMap((connectionId) => {
			if (seenIds.has(connectionId)) return []
			const connection = connectionById.get(connectionId)
			if (!connection) return []
			seenIds.add(connectionId)
			return [connection]
		})
	}, [orderedTextConnectionIds, resolution.textConnections])

	const isTextConnectionSelected = useCallback(
		(connectionId: string) => selectedTextConnectionIds.has(connectionId),
		[selectedTextConnectionIds],
	)

	const setTextConnectionSelected = useCallback(
		(connectionId: string, selected: boolean) => {
			setEditorDraft((previousDraft) => {
				const currentDraft = reconcileDraftForCurrentInputs(previousDraft)
				const previousIds = currentDraft.selectedTextConnectionIds
				const wasSelected = previousIds.includes(connectionId)
				if (wasSelected === selected) return currentDraft
				return {
					...currentDraft,
					selectedTextConnectionIds: selected
						? [...previousIds, connectionId]
						: previousIds.filter((id) => id !== connectionId),
				}
			})
		},
		[reconcileDraftForCurrentInputs],
	)

	const setMediaConnectionSelected = useCallback(
		(connectionId: string, selected: boolean) => {
			setEditorDraft((previousDraft) => {
				const currentDraft = reconcileDraftForCurrentInputs(previousDraft)
				const previousIds = currentDraft.selectedMediaConnectionIds
				if (!selected) {
					if (!previousIds.includes(connectionId)) return currentDraft
					return {
						...currentDraft,
						selectedMediaConnectionIds: previousIds.filter((id) => id !== connectionId),
					}
				}

				if (previousIds.includes(connectionId)) return currentDraft
				const nextIds = [...previousIds, connectionId]
				const nextResolution = resolveLinkedMediaSelection(resolution.mediaItems, nextIds, {
					targetKind,
					mediaPolicy,
				})
				const nextItem = nextResolution.items.find(
					(item) => item.connectionId === connectionId,
				)
				if (!nextItem || nextItem.status !== "active") return currentDraft
				return { ...currentDraft, selectedMediaConnectionIds: nextIds }
			})
		},
		[mediaPolicy, reconcileDraftForCurrentInputs, resolution.mediaItems, targetKind],
	)

	const handleMentionedReferencePathsChange = useCallback(
		(paths: string[], options?: { deselectRemoved?: boolean }) => {
			const connectionIdsToDeselect = new Set(
				getLinkedMediaConnectionIdsToDeselectAfterMentionChange(
					mediaSelectionResolution.items,
					mentionedMediaPathsRef.current,
					paths,
				),
			)
			mentionedMediaPathsRef.current = [...paths]
			if (options?.deselectRemoved === false) return
			if (connectionIdsToDeselect.size === 0) return

			setEditorDraft((previousDraft) => {
				const currentDraft = reconcileDraftForCurrentInputs(previousDraft)
				const nextIds = currentDraft.selectedMediaConnectionIds.filter(
					(connectionId) => !connectionIdsToDeselect.has(connectionId),
				)
				return nextIds.length === currentDraft.selectedMediaConnectionIds.length
					? currentDraft
					: { ...currentDraft, selectedMediaConnectionIds: nextIds }
			})
		},
		[mediaSelectionResolution.items, reconcileDraftForCurrentInputs],
	)

	const reorderTextConnections = useCallback(
		(activeConnectionId: string, overConnectionId: string) => {
			if (activeConnectionId === overConnectionId) return
			setEditorDraft((previousDraft) => {
				const currentDraft = reconcileDraftForCurrentInputs(previousDraft)
				const previousIds = currentDraft.orderedTextConnectionIds
				const activeIndex = previousIds.indexOf(activeConnectionId)
				const overIndex = previousIds.indexOf(overConnectionId)
				if (activeIndex < 0 || overIndex < 0) return currentDraft

				const nextIds = [...previousIds]
				const [activeId] = nextIds.splice(activeIndex, 1)
				if (!activeId) return currentDraft
				nextIds.splice(overIndex, 0, activeId)
				return { ...currentDraft, orderedTextConnectionIds: nextIds }
			})
		},
		[reconcileDraftForCurrentInputs],
	)

	const textPrompt = useMemo(
		() =>
			getLinkedTextPromptText(
				orderedTextConnections.filter((connection) =>
					isTextConnectionSelected(connection.connectionId),
				),
			),
		[isTextConnectionSelected, orderedTextConnections],
	)

	return useMemo(
		() => ({
			...resolution,
			textConnections: orderedTextConnections,
			textPrompt,
			mediaItems: mediaSelectionResolution.items,
			activeMediaReferences: mediaSelectionResolution.activeMediaReferences,
			isTextConnectionSelected,
			setTextConnectionSelected,
			setMediaConnectionSelected,
			handleMentionedReferencePathsChange,
			reorderTextConnections,
		}),
		[
			isTextConnectionSelected,
			handleMentionedReferencePathsChange,
			mediaSelectionResolution,
			reorderTextConnections,
			resolution,
			orderedTextConnections,
			setMediaConnectionSelected,
			setTextConnectionSelected,
			textPrompt,
		],
	)
}
