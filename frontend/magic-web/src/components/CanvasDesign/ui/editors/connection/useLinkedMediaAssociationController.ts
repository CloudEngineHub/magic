import { useCallback, useRef, useState, type RefObject } from "react"
import type { MessageEditorMentionChangeContext, MessageEditorRef } from "../message/MessageEditor"
import type { LinkedEditorMediaPolicy, LinkedEditorTargetKind } from "./linkedEditorInputs"
import { useLinkedEditorInputs } from "./useLinkedEditorInputs"
import { useLinkedMediaMentionSelection } from "./useLinkedMediaMentionSelection"

interface UseLinkedMediaAssociationControllerOptions {
	targetElementId: string
	targetKind: LinkedEditorTargetKind
	mediaPolicy?: LinkedEditorMediaPolicy
	editorRef: RefObject<MessageEditorRef | null>
	onReadyMentionChange?: (paths: string[], currentPrompt: string) => void
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
			onReadyMentionChange?.(paths, currentPrompt)
			return true
		},
		[onReadyMentionChange],
	)

	return {
		linkedEditorInputs,
		mentionedReferencePaths,
		handleLinkedMediaSelectionChange,
		handleMentionChange,
	}
}
