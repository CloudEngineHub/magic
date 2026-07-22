import { useCallback, useEffect, useMemo, useState } from "react"
import { useCanvasEvent } from "../../../app/hooks/canvas"
import { useCanvas } from "../../../app/providers/CanvasProvider"
import type { CropConfig } from "../../../runtime/document/types"
import {
	resolveLinkedEditorInputs,
	type LinkedEditorInputsResolution,
	type LinkedEditorMediaItem,
	type LinkedEditorMediaPolicy,
	type LinkedEditorMediaReference,
	type LinkedEditorTargetKind,
} from "./linkedEditorInputs"

export interface LinkedEditorInputsState extends LinkedEditorInputsResolution {
	removeConnection: (connectionId: string) => void
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
		refreshInputs()
	}, [refreshInputs])

	useCanvasEvent("connection:change", refreshInputs, [refreshInputs])
	useCanvasEvent("element:updated", refreshInputs, [refreshInputs])
	useCanvasEvent("element:deleted", refreshInputs, [refreshInputs])

	const removeConnection = useCallback(
		(connectionId: string) => {
			canvas?.connectionManager.removeConnection(connectionId)
		},
		[canvas],
	)

	return useMemo(
		() => ({
			...resolution,
			removeConnection,
		}),
		[removeConnection, resolution],
	)
}
