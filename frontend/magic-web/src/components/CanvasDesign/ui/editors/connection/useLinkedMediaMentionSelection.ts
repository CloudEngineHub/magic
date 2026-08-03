import { useCallback, useEffect, useMemo, useRef, type RefObject } from "react"
import { getCanvasResourceFileName } from "../../../runtime/shared/path/canvasResourcePath"
import type { MessageEditorRef } from "../message/MessageEditor"
import { createReferenceResourcePanelItemFromPath } from "../message/reference-assets/createReferenceResourcePanelItem"
import { getLinkedMediaReferenceIdentity, type LinkedEditorMediaItem } from "./linkedEditorInputs"
import { createCanvasMentionPathMatcher } from "./linkedMediaMentionMatcher"

interface LinkedMediaMentionSnapshot {
	path: string
	fileName: string
}

interface UseLinkedMediaMentionSelectionOptions {
	mediaItems: LinkedEditorMediaItem[]
	mentionedReferencePaths: string[]
	canSelectMediaConnection: (connectionId: string) => boolean
	editorRef: RefObject<MessageEditorRef | null>
}

function getLinkedMediaFileName(item: LinkedEditorMediaItem & { path: string }): string {
	return item.fileName || getCanvasResourceFileName(item.path) || item.path
}

/**
 * 将关联媒体勾选与提示词 @mention 保持一致：
 * - 新勾选先通过媒体策略校验，再插入 @；插入失败时不产生选择状态。
 * - 已存在同路径 @ 时不重复插入。
 * - 取消勾选时删除对应 @；删除失败时 mention 与展示状态均保持不变。
 * - 用户直接增删 @ 后，由 useLinkedEditorInputs 从 mention 路径派生勾选状态。
 * - 连接消失时保留可见 @，使其自然降级为手动引用。
 * - 编辑器打开期间连接源路径或文件名变化时更新已创建的 @。
 * - 编辑器重开时只等待 ready mention 快照，不恢复或补写媒体选择状态。
 */
export function useLinkedMediaMentionSelection(
	options: UseLinkedMediaMentionSelectionOptions,
): (connectionId: string, selected: boolean) => void {
	const { mediaItems, mentionedReferencePaths, canSelectMediaConnection, editorRef } = options
	const mentionSnapshotByConnectionIdRef = useRef(new Map<string, LinkedMediaMentionSnapshot>())
	const mentionedPathByIdentity = useMemo(() => {
		const result = new Map<string, string>()
		for (const path of mentionedReferencePaths) {
			const identity = getLinkedMediaReferenceIdentity(path)
			if (identity && !result.has(identity)) result.set(identity, path)
		}
		return result
	}, [mentionedReferencePaths])

	useEffect(() => {
		const currentItemByConnectionId = new Map(
			mediaItems
				.filter((item): item is LinkedEditorMediaItem & { path: string } =>
					Boolean(item.path),
				)
				.map((item) => [item.connectionId, item]),
		)
		const snapshots = mentionSnapshotByConnectionIdRef.current

		for (const [connectionId, snapshot] of snapshots) {
			const currentItem = currentItemByConnectionId.get(connectionId)
			if (!currentItem) {
				// 断开连接或源元素消失后不删除用户可见的 @。
				snapshots.delete(connectionId)
				continue
			}

			const previousMentionPath = mentionedPathByIdentity.get(
				getLinkedMediaReferenceIdentity(snapshot.path),
			)
			const currentMentionPath = mentionedPathByIdentity.get(
				getLinkedMediaReferenceIdentity(currentItem.path),
			)
			if (!previousMentionPath && !currentMentionPath) {
				// 用户已经删除 @；选择状态的清理由 useLinkedEditorInputs 完成。
				snapshots.delete(connectionId)
				continue
			}

			const currentFileName = getLinkedMediaFileName(currentItem)
			const isSameResource =
				getLinkedMediaReferenceIdentity(snapshot.path) ===
				getLinkedMediaReferenceIdentity(currentItem.path)
			if (isSameResource && snapshot.fileName === currentFileName) {
				continue
			}

			if (currentMentionPath && !previousMentionPath) {
				snapshots.set(connectionId, {
					path: currentMentionPath,
					fileName: currentFileName,
				})
				continue
			}

			const replaced =
				editorRef.current?.replaceMentionItems(
					createCanvasMentionPathMatcher(snapshot.path),
					createReferenceResourcePanelItemFromPath(currentItem.path, currentFileName),
				) ?? false
			if (replaced) {
				snapshots.set(connectionId, {
					path: currentItem.path,
					fileName: currentFileName,
				})
			}
		}

		for (const item of currentItemByConnectionId.values()) {
			if (snapshots.has(item.connectionId)) continue
			if (!item.selected) continue
			const mentionedPath = mentionedPathByIdentity.get(
				getLinkedMediaReferenceIdentity(item.path),
			)
			if (!mentionedPath) continue
			snapshots.set(item.connectionId, {
				path: mentionedPath,
				fileName: getLinkedMediaFileName(item),
			})
		}
	}, [editorRef, mediaItems, mentionedPathByIdentity])

	return useCallback(
		(connectionId: string, selected: boolean) => {
			if (!selected) {
				const item = mediaItems.find((candidate) => candidate.connectionId === connectionId)
				const snapshot = mentionSnapshotByConnectionIdRef.current.get(connectionId)
				const mentionIdentity = getLinkedMediaReferenceIdentity(
					item?.path ?? snapshot?.path,
				)
				const mentionedPath = mentionedPathByIdentity.get(mentionIdentity)
				if (
					mentionedPath &&
					!editorRef.current?.removeMentionItems(
						createCanvasMentionPathMatcher(mentionedPath),
					)
				) {
					return
				}
				mentionSnapshotByConnectionIdRef.current.delete(connectionId)
				return
			}

			const item = mediaItems.find(
				(candidate): candidate is LinkedEditorMediaItem & { path: string } =>
					candidate.connectionId === connectionId && Boolean(candidate.path),
			)
			if (!item || item.selectionDisabledReason) return
			if (!canSelectMediaConnection(connectionId)) return

			const fileName = getLinkedMediaFileName(item)
			const existingMentionPath = mentionedPathByIdentity.get(
				getLinkedMediaReferenceIdentity(item.path),
			)
			if (existingMentionPath) {
				mentionSnapshotByConnectionIdRef.current.set(connectionId, {
					path: existingMentionPath,
					fileName,
				})
				return
			}

			const inserted =
				editorRef.current?.insertMentionItem(
					createReferenceResourcePanelItemFromPath(item.path, fileName),
					{ replaceSelection: false },
				) ?? false
			if (!inserted) {
				return
			}

			mentionSnapshotByConnectionIdRef.current.set(connectionId, {
				path: item.path,
				fileName,
			})
		},
		[canSelectMediaConnection, editorRef, mediaItems, mentionedPathByIdentity],
	)
}
