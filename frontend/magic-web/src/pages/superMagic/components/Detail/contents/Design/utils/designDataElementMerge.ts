import {
	hasCanvasDocumentLocalChanges,
	hashCanvasJson,
	mergeCanvasDocuments,
	refreshCanvasDocumentElementMergeConflictsFromRemote,
	type CanvasDocumentConnectionMergeConflict,
	type CanvasDocumentElementMergeConflict,
	type CanvasDocumentMergeConflictReason,
	type CanvasDocumentMergeConnectionConflictReason,
	type CanvasDocumentMergeElementConflictReason,
	type CanvasDocumentMergeResult,
} from "@/components/CanvasDesign/runtime/document"
import type { DesignData } from "../types"

export type DesignDataElementMergeConflictReason =
	| CanvasDocumentMergeConflictReason
	| "document-level-change"

export type DesignDataElementMergeElementConflictReason = CanvasDocumentMergeElementConflictReason
export type DesignDataElementMergeConnectionConflictReason =
	CanvasDocumentMergeConnectionConflictReason

interface DesignDataElementMergeChangeSummary {
	localChangedElementIds: string[]
	remoteChangedElementIds: string[]
	localDeletedElementIds: string[]
	remoteDeletedElementIds: string[]
	localChangedConnectionIds: string[]
	remoteChangedConnectionIds: string[]
	localDeletedConnectionIds: string[]
	remoteDeletedConnectionIds: string[]
}

export type DesignDataElementMergeResult =
	| ({
			ok: true
			isElementLevelConflict?: false
			isConnectionLevelConflict?: false
			mergedData: DesignData
	  } & DesignDataElementMergeChangeSummary)
	| ({
			ok: false
			isElementLevelConflict: true
			isConnectionLevelConflict?: false
			reason: DesignDataElementMergeElementConflictReason
			conflictElementIds: string[]
			connectionConflictIds?: string[]
			elementConflicts: CanvasDocumentElementMergeConflict[]
			mergedData: DesignData
	  } & DesignDataElementMergeChangeSummary)
	| ({
			ok: false
			isElementLevelConflict?: false
			isConnectionLevelConflict: true
			reason: DesignDataElementMergeConnectionConflictReason
			conflictElementIds: string[]
			connectionConflictIds: string[]
			connectionConflicts: CanvasDocumentConnectionMergeConflict[]
			mergedData: DesignData
	  } & DesignDataElementMergeChangeSummary)
	| ({
			ok: false
			isElementLevelConflict?: false
			isConnectionLevelConflict?: false
			reason: DesignDataElementMergeConflictReason
			conflictElementIds: string[]
			connectionConflictIds?: string[]
	  } & DesignDataElementMergeChangeSummary)

function getMetaHash(data: DesignData): string {
	return hashCanvasJson({
		type: data.type,
		name: data.name,
		version: data.version,
	})
}

function createDocumentLevelConflictResult(
	canvasMergeResult: CanvasDocumentMergeResult,
): DesignDataElementMergeResult {
	return {
		ok: false,
		reason: "document-level-change",
		conflictElementIds: [],
		localChangedElementIds: canvasMergeResult.localChangedElementIds,
		remoteChangedElementIds: canvasMergeResult.remoteChangedElementIds,
		localDeletedElementIds: canvasMergeResult.localDeletedElementIds,
		remoteDeletedElementIds: canvasMergeResult.remoteDeletedElementIds,
		localChangedConnectionIds: canvasMergeResult.localChangedConnectionIds,
		remoteChangedConnectionIds: canvasMergeResult.remoteChangedConnectionIds,
		localDeletedConnectionIds: canvasMergeResult.localDeletedConnectionIds,
		remoteDeletedConnectionIds: canvasMergeResult.remoteDeletedConnectionIds,
	}
}

function applyMergedCanvasToDesignData(options: {
	canvasMergeResult: Extract<CanvasDocumentMergeResult, { mergedCanvas: unknown }>
	localData: DesignData
	remoteData: DesignData
	isLocalMetaChanged: boolean
}): DesignData {
	const { canvasMergeResult, localData, remoteData, isLocalMetaChanged } = options
	const mergedData: DesignData = {
		...remoteData,
		canvas: canvasMergeResult.mergedCanvas,
	}

	if (!isLocalMetaChanged) return mergedData

	return {
		...mergedData,
		type: localData.type,
		name: localData.name,
		version: localData.version,
	}
}

function wrapCanvasMergeResult(options: {
	canvasMergeResult: CanvasDocumentMergeResult
	localData: DesignData
	remoteData: DesignData
	isLocalMetaChanged: boolean
}): DesignDataElementMergeResult {
	const { canvasMergeResult, localData, remoteData, isLocalMetaChanged } = options
	const changeSummary = {
		localChangedElementIds: canvasMergeResult.localChangedElementIds,
		remoteChangedElementIds: canvasMergeResult.remoteChangedElementIds,
		localDeletedElementIds: canvasMergeResult.localDeletedElementIds,
		remoteDeletedElementIds: canvasMergeResult.remoteDeletedElementIds,
		localChangedConnectionIds: canvasMergeResult.localChangedConnectionIds,
		remoteChangedConnectionIds: canvasMergeResult.remoteChangedConnectionIds,
		localDeletedConnectionIds: canvasMergeResult.localDeletedConnectionIds,
		remoteDeletedConnectionIds: canvasMergeResult.remoteDeletedConnectionIds,
	}

	if (canvasMergeResult.ok) {
		return {
			ok: true,
			mergedData: applyMergedCanvasToDesignData({
				canvasMergeResult,
				localData,
				remoteData,
				isLocalMetaChanged,
			}),
			...changeSummary,
		}
	}

	if (canvasMergeResult.isElementLevelConflict) {
		return {
			ok: false,
			isElementLevelConflict: true,
			reason: canvasMergeResult.reason,
			conflictElementIds: canvasMergeResult.conflictElementIds,
			elementConflicts: canvasMergeResult.elementConflicts,
			mergedData: applyMergedCanvasToDesignData({
				canvasMergeResult,
				localData,
				remoteData,
				isLocalMetaChanged,
			}),
			...changeSummary,
		}
	}

	if (canvasMergeResult.isConnectionLevelConflict) {
		return {
			ok: false,
			isConnectionLevelConflict: true,
			reason: canvasMergeResult.reason,
			conflictElementIds: canvasMergeResult.conflictElementIds,
			connectionConflictIds: canvasMergeResult.connectionConflictIds,
			connectionConflicts: canvasMergeResult.connectionConflicts,
			mergedData: applyMergedCanvasToDesignData({
				canvasMergeResult,
				localData,
				remoteData,
				isLocalMetaChanged,
			}),
			...changeSummary,
		}
	}

	return {
		ok: false,
		reason: canvasMergeResult.reason,
		conflictElementIds: canvasMergeResult.conflictElementIds,
		connectionConflictIds: canvasMergeResult.connectionConflictIds,
		...changeSummary,
	}
}

export function mergeDesignDataByElement(options: {
	baseData: DesignData
	localData: DesignData
	remoteData: DesignData
}): DesignDataElementMergeResult {
	const { baseData, localData, remoteData } = options
	const canvasMergeResult = mergeCanvasDocuments({
		baseCanvas: baseData.canvas,
		localCanvas: localData.canvas,
		remoteCanvas: remoteData.canvas,
	})

	if (!canvasMergeResult.ok && canvasMergeResult.reason === "duplicate-element-id") {
		return wrapCanvasMergeResult({
			canvasMergeResult,
			localData,
			remoteData,
			isLocalMetaChanged: false,
		})
	}

	const baseMetaHash = getMetaHash(baseData)
	const localMetaHash = getMetaHash(localData)
	const remoteMetaHash = getMetaHash(remoteData)
	const isLocalMetaChanged = localMetaHash !== baseMetaHash
	const isRemoteMetaChanged = remoteMetaHash !== baseMetaHash
	if (isLocalMetaChanged && isRemoteMetaChanged && localMetaHash !== remoteMetaHash) {
		return createDocumentLevelConflictResult(canvasMergeResult)
	}

	return wrapCanvasMergeResult({
		canvasMergeResult,
		localData,
		remoteData,
		isLocalMetaChanged,
	})
}

export function hasDesignDataLocalChanges(options: {
	baseData: DesignData
	localData: DesignData
}): boolean {
	return (
		getMetaHash(options.baseData) !== getMetaHash(options.localData) ||
		hasCanvasDocumentLocalChanges({
			baseCanvas: options.baseData.canvas,
			localCanvas: options.localData.canvas,
		})
	)
}

export function refreshDesignElementConflictsFromRemoteData<
	T extends CanvasDocumentElementMergeConflict,
>(elementConflicts: T[], remoteData: DesignData): T[] {
	return refreshCanvasDocumentElementMergeConflictsFromRemote({
		elementConflicts,
		remoteCanvas: remoteData.canvas,
	})
}
