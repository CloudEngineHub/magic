import { useCallback, useEffect, useMemo, useRef, type RefObject } from "react"
import { getCanvasResourceFileName } from "../../../runtime/shared/path/canvasResourcePath"
import type { MessageEditorRef } from "../message/MessageEditor"
import { createReferenceResourcePanelItemFromPath } from "../message/reference-assets/createReferenceResourcePanelItem"
import { getLinkedMediaReferenceIdentity, type LinkedEditorMediaItem } from "./linkedEditorInputs"

interface LinkedMediaMentionSnapshot {
	path: string
	fileName: string
}

interface UseLinkedMediaMentionSelectionOptions {
	mediaItems: LinkedEditorMediaItem[]
	mentionedReferencePaths: string[]
	isMediaConnectionSelected: (connectionId: string) => boolean
	onSelectionChange: (connectionId: string, selected: boolean) => boolean
	editorRef: RefObject<MessageEditorRef | null>
}

function getLinkedMediaFileName(item: LinkedEditorMediaItem & { path: string }): string {
	return item.fileName || getCanvasResourceFileName(item.path) || item.path
}

/**
 * 将关联媒体勾选与提示词 @mention 保持一致：
 * - 新勾选先写入选择草稿，再插入 @；插入失败时回滚选择。
 * - 已存在同路径 @ 时不重复插入。
 * - 取消勾选时先删除对应 @；删除失败时保持原选择。
 * - 用户直接删除 @ 后，由 useLinkedEditorInputs 统一取消勾选。
 * - 连接消失时保留可见 @，使其自然降级为手动引用。
 * - 编辑器打开期间连接源路径或文件名变化时更新已创建的 @。
 */
export function useLinkedMediaMentionSelection(
	options: UseLinkedMediaMentionSelectionOptions,
): (connectionId: string, selected: boolean) => void {
	const {
		mediaItems,
		mentionedReferencePaths,
		isMediaConnectionSelected,
		onSelectionChange,
		editorRef,
	} = options
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
				editorRef.current?.replaceMentionItemByPath(
					snapshot.path,
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
			if (!isMediaConnectionSelected(item.connectionId)) continue
			const mentionedPath = mentionedPathByIdentity.get(
				getLinkedMediaReferenceIdentity(item.path),
			)
			if (!mentionedPath) continue
			snapshots.set(item.connectionId, {
				path: mentionedPath,
				fileName: getLinkedMediaFileName(item),
			})
		}
	}, [editorRef, isMediaConnectionSelected, mediaItems, mentionedPathByIdentity])

	return useCallback(
		(connectionId: string, selected: boolean) => {
			if (!selected) {
				const item = mediaItems.find((candidate) => candidate.connectionId === connectionId)
				const snapshot = mentionSnapshotByConnectionIdRef.current.get(connectionId)
				const mentionIdentity = getLinkedMediaReferenceIdentity(
					item?.path ?? snapshot?.path,
				)
				const mentionedPath = mentionedPathByIdentity.get(mentionIdentity)
				if (mentionedPath && !editorRef.current?.removeMentionItemByPath(mentionedPath)) {
					return
				}
				mentionSnapshotByConnectionIdRef.current.delete(connectionId)
				onSelectionChange(connectionId, false)
				return
			}

			const item = mediaItems.find(
				(candidate): candidate is LinkedEditorMediaItem & { path: string } =>
					candidate.connectionId === connectionId && Boolean(candidate.path),
			)
			if (!item || item.selectionDisabledReason) return
			if (!onSelectionChange(connectionId, true)) return

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
				onSelectionChange(connectionId, false)
				return
			}

			mentionSnapshotByConnectionIdRef.current.set(connectionId, {
				path: item.path,
				fileName,
			})
		},
		[editorRef, mediaItems, mentionedPathByIdentity, onSelectionChange],
	)
}
