import { useCallback, useEffect, useRef, useState, type RefObject } from "react"
import { useCanvas } from "../../../app/providers/CanvasProvider"
import type { MessageEditorMentionChangeContext, MessageEditorRef } from "../message/MessageEditor"
import type { LinkedEditorMediaPolicy, LinkedEditorTargetKind } from "./linkedEditorInputs"
import { useLinkedEditorInputs } from "./useLinkedEditorInputs"
import { useLinkedMediaMentionSelection } from "./useLinkedMediaMentionSelection"
import { reconcileMentionPathsWithPersistedReferences } from "../message/mentionPathReconciliation"
import type { ResolveCanvasResourceReference } from "../../../public/resource-reference"
import {
	resolveInitialLinkedEditorAssociation,
	type LinkedEditorMediaPolicyStatus,
} from "./resolveInitialLinkedEditorAssociation"

interface UseLinkedMediaAssociationControllerOptions {
	targetElementId: string
	targetKind: LinkedEditorTargetKind
	mediaPolicy?: LinkedEditorMediaPolicy
	mediaPolicyStatus: LinkedEditorMediaPolicyStatus
	editorRef: RefObject<MessageEditorRef | null>
	onReadyMentionChange?: (
		paths: string[],
		currentPrompt: string,
		context: MessageEditorMentionChangeContext,
	) => void
	resolveResourceReference?: ResolveCanvasResourceReference
}

/** 图片与视频编辑器共用的 mention 驱动关联媒体 controller。 */
export function useLinkedMediaAssociationController(
	options: UseLinkedMediaAssociationControllerOptions,
) {
	const { canvas } = useCanvas()
	const {
		targetElementId,
		targetKind,
		mediaPolicy,
		mediaPolicyStatus,
		editorRef,
		onReadyMentionChange,
		resolveResourceReference,
	} = options
	const [mentionedReferencePaths, setMentionedReferencePaths] = useState<string[]>([])
	const [mentionReadyTargetElementId, setMentionReadyTargetElementId] = useState<string | null>(
		null,
	)
	const pendingSyncRef = useRef<{ revision: number; token: number } | null>(null)
	const syncTokenRef = useRef(0)
	const acceptedSyncTokenRef = useRef(0)
	const linkedEditorInputs = useLinkedEditorInputs({
		targetElementId,
		targetKind,
		mediaPolicy,
		mentionedReferencePaths,
	})
	const {
		connectedSourceElementIds,
		mediaItems,
		setTextConnectionSelected,
		textConnections,
		canSelectMediaConnection,
	} = linkedEditorInputs
	const handleLinkedMediaSelectionChange = useLinkedMediaMentionSelection({
		mediaItems,
		mentionedReferencePaths,
		canSelectMediaConnection,
		editorRef,
		resolveResourceReference,
	})
	const handleMentionChange = useCallback(
		(paths: string[], currentPrompt: string, context: MessageEditorMentionChangeContext) => {
			if (context.status === "pending") {
				if (context.source === "sync") {
					pendingSyncRef.current = {
						revision: context.revision,
						token: (syncTokenRef.current += 1),
					}
				}
				return false
			}
			if (context.source === "sync") {
				const pendingSync = pendingSyncRef.current
				if (
					!pendingSync ||
					pendingSync.revision !== context.revision ||
					pendingSync.token === acceptedSyncTokenRef.current
				) {
					return false
				}
				acceptedSyncTokenRef.current = pendingSync.token
			}
			// 编辑器组件可能复用于不同目标，ready 必须绑定当前元素，避免沿用上一个元素的状态。
			setMentionReadyTargetElementId(targetElementId)
			const persistedPaths =
				mediaPolicy?.manualReferences?.map((reference) => reference.path) ?? []
			const reconciledPaths = reconcileMentionPathsWithPersistedReferences({
				incomingPaths: paths,
				persistedPaths,
				source: context.source,
				resolveResourceReference,
			})
			setMentionedReferencePaths(reconciledPaths)
			onReadyMentionChange?.(reconciledPaths, currentPrompt, context)
			return true
		},
		[
			mediaPolicy?.manualReferences,
			onReadyMentionChange,
			resolveResourceReference,
			targetElementId,
		],
	)
	const applyingSeedIdRef = useRef<string | null>(null)

	useEffect(() => {
		if (!canvas || applyingSeedIdRef.current) return
		const seed = canvas.connectionAssociationSeedManager?.peek(targetElementId)
		if (!seed) return
		if (mentionReadyTargetElementId !== targetElementId) return

		const association = resolveInitialLinkedEditorAssociation({
			seed,
			targetKind,
			mediaPolicyStatus,
			connectedSourceElementIds,
			textConnections,
			mediaItems,
			mediaPolicy,
			resolveResourceReference,
		})
		if (association.status === "pending") return
		applyingSeedIdRef.current = seed.id
		try {
			association.selectedTextConnectionIds.forEach((connectionId) => {
				setTextConnectionSelected(connectionId, true)
			})
			const mediaApplied = association.selectedMediaConnectionIds.every((connectionId) =>
				handleLinkedMediaSelectionChange(connectionId, true),
			)
			if (mediaApplied) {
				canvas.connectionAssociationSeedManager.consume(targetElementId, seed.id)
			}
		} finally {
			applyingSeedIdRef.current = null
		}
	}, [
		canvas,
		connectedSourceElementIds,
		handleLinkedMediaSelectionChange,
		mediaItems,
		setTextConnectionSelected,
		textConnections,
		mediaPolicy,
		mediaPolicyStatus,
		mentionReadyTargetElementId,
		resolveResourceReference,
		targetElementId,
		targetKind,
	])

	return {
		linkedEditorInputs,
		mentionedReferencePaths,
		handleLinkedMediaSelectionChange,
		handleMentionChange,
	}
}
