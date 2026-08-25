import { useCallback, useMemo, useRef, useState, type RefObject } from "react"
import type { MessageEditorMentionChangeContext, MessageEditorRef } from "../message/MessageEditor"
import type { LinkedEditorMediaPolicy, LinkedEditorTargetKind } from "./linkedEditorInputs"
import { useLinkedEditorInputs } from "./useLinkedEditorInputs"
import { useLinkedMediaMentionSelection } from "./useLinkedMediaMentionSelection"
import type { ReferenceResourceMetadataCandidate } from "../message/reference-assets/referenceResourceDescriptor"

interface UseLinkedMediaAssociationControllerOptions {
	targetElementId: string
	targetKind: LinkedEditorTargetKind
	mediaPolicy?: LinkedEditorMediaPolicy
	editorRef: RefObject<MessageEditorRef | null>
	onReadyMentionChange?: (
		paths: string[],
		currentPrompt: string,
		context?: MessageEditorMentionChangeContext,
		metadataCandidates?: readonly ReferenceResourceMetadataCandidate[],
	) => void
}

/** 图片与视频编辑器共用的 mention 驱动关联媒体 controller。 */
export function useLinkedMediaAssociationController(
	options: UseLinkedMediaAssociationControllerOptions,
) {
	const { targetElementId, targetKind, mediaPolicy, editorRef, onReadyMentionChange } = options
	const [mentionedReferencePaths, setMentionedReferencePaths] = useState<string[]>([])
	const pendingSyncRef = useRef<{ revision: number; token: number } | null>(null)
	const syncTokenRef = useRef(0)
	const acceptedSyncTokenRef = useRef(0)
	const linkedEditorInputs = useLinkedEditorInputs({
		targetElementId,
		targetKind,
		mediaPolicy,
		mentionedReferencePaths,
	})
	const activeMediaReferences = useMemo(
		() => linkedEditorInputs.activeMediaReferences ?? [],
		[linkedEditorInputs.activeMediaReferences],
	)
	const handleLinkedMediaSelectionChange = useLinkedMediaMentionSelection({
		mediaItems: linkedEditorInputs.mediaItems,
		mentionedReferencePaths,
		canSelectMediaConnection: linkedEditorInputs.canSelectMediaConnection,
		editorRef,
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
			setMentionedReferencePaths(paths)
			const metadataCandidates = activeMediaReferences.map((reference) => ({
				path: reference.path,
				assetType: reference.kind,
			}))
			// sync 仍不传 source，保持旧的 prompt 生命周期语义；metadata 用于恢复 opaque URI 类型。
			if (context.source !== "user") {
				if (metadataCandidates.length > 0) {
					onReadyMentionChange?.(paths, currentPrompt, undefined, metadataCandidates)
				} else {
					onReadyMentionChange?.(paths, currentPrompt)
				}
				return true
			}
			onReadyMentionChange?.(paths, currentPrompt, context, metadataCandidates)
			return true
		},
		[activeMediaReferences, onReadyMentionChange],
	)

	return {
		linkedEditorInputs,
		mentionedReferencePaths,
		handleLinkedMediaSelectionChange,
		handleMentionChange,
	}
}
