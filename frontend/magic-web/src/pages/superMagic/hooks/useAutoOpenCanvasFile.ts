import { useEffect, useRef } from "react"
import { useMemoizedFn } from "ahooks"
import pubsub, { PubSubEvents } from "@/utils/pubsub"
import type { TaskCompletedEvent } from "@/pages/superMagic/stores/events"
import { superMagicStore } from "@/pages/superMagic/stores"
import {
	isMagicProjectConfigFile,
	resolveMagicProjectAttachment,
	type MagicProjectAttachmentFile,
} from "../components/MessageList/components/MessageAttachment/utils"
import { waitForNextAttachmentsRefreshForProject } from "../services/attachmentsTopicSync"

interface AutoOpenCanvasFileParams {
	topicId?: string
	projectId?: string
	activeFileId?: string | null
	getActiveFileId?: () => string | null | undefined
	attachments?: MagicProjectAttachmentFile[]
	attachmentList?: MagicProjectAttachmentFile[]
	scheduleWhenTabsCacheReady: (callback: () => void, channel?: string) => void
}

export interface DesignCanvasResolution {
	status: "ready" | "unresolved" | "not-design" | "missing"
	projectDirectory?: MagicProjectAttachmentFile
}

function getAttachmentName(attachment: MagicProjectAttachmentFile): string {
	return (
		attachment.file_name ||
		attachment.filename ||
		attachment.display_filename ||
		attachment.name ||
		""
	)
}

function isAttachmentRecord(value: unknown): value is MagicProjectAttachmentFile {
	return Boolean(value && typeof value === "object")
}

function findMagicProjectConfig(
	attachments: unknown[] | undefined,
): MagicProjectAttachmentFile | undefined {
	for (const value of attachments || []) {
		if (!isAttachmentRecord(value)) continue
		const attachment = value
		if (isMagicProjectConfigFile(getAttachmentName(attachment))) return attachment
		const nestedMatch = findMagicProjectConfig(attachment.children)
		if (nestedMatch) return nestedMatch
	}
	return undefined
}

/**
 * Resolve the project directory from the task attachment and require the directory metadata to
 * identify a Canvas design. A missing parent is kept separate from a confirmed non-design result
 * so the caller can refresh the attachment tree once without opening an unrelated file.
 */
export function resolveDesignCanvasAttachment(
	taskAttachments: unknown[],
	workspaceFilesList: MagicProjectAttachmentFile[] = [],
	workspaceFileTree: MagicProjectAttachmentFile[] = [],
): DesignCanvasResolution {
	const configFile = findMagicProjectConfig(taskAttachments)
	if (!configFile) return { status: "missing" }

	const resolution = resolveMagicProjectAttachment(
		configFile,
		workspaceFilesList,
		workspaceFileTree,
	)
	const displayType = resolution.displayConfig?.type
	if (displayType !== undefined && displayType !== "design") {
		return { status: "not-design" }
	}
	if (
		!resolution.projectDirectory?.file_id ||
		resolution.projectDirectory.is_directory !== true
	) {
		return { status: "unresolved" }
	}
	if (displayType !== "design") return { status: "unresolved" }

	return { status: "ready", projectDirectory: resolution.projectDirectory }
}

function readActiveFileId(
	params: AutoOpenCanvasFileParams,
	activeFileIdRef: { current: string | null | undefined },
): string | null {
	const latestActiveFileId = params.getActiveFileId?.()
	if (latestActiveFileId !== undefined) return latestActiveFileId
	return activeFileIdRef.current ?? params.activeFileId ?? null
}

/** Open only a newly completed design Canvas when the user has no active file preview. */
export function useAutoOpenCanvasFile({
	topicId,
	projectId,
	activeFileId,
	getActiveFileId,
	attachments,
	attachmentList,
	scheduleWhenTabsCacheReady,
}: AutoOpenCanvasFileParams) {
	const paramsRef = useRef<AutoOpenCanvasFileParams>({
		topicId,
		projectId,
		activeFileId,
		getActiveFileId,
		attachments,
		attachmentList,
		scheduleWhenTabsCacheReady,
	})
	paramsRef.current = {
		topicId,
		projectId,
		activeFileId,
		getActiveFileId,
		attachments,
		attachmentList,
		scheduleWhenTabsCacheReady,
	}

	const activeFileIdRef = useRef<string | null | undefined>(activeFileId)
	activeFileIdRef.current = activeFileId

	const scheduleAttempt = useMemoizedFn(
		(
			event: TaskCompletedEvent,
			abortController: AbortController,
			refreshingTaskKeys: Set<string>,
		) => {
			const taskKey = `${event.meta.taskId}:${event.meta.appMessageId}`
			const run = () => {
				if (abortController.signal.aborted) return
				const currentParams = paramsRef.current
				if (readActiveFileId(currentParams, activeFileIdRef) !== null) return

				const resolution = resolveDesignCanvasAttachment(
					event.payload.result.attachments,
					currentParams.attachmentList,
					currentParams.attachments,
				)
				if (resolution.status === "missing" || resolution.status === "not-design") return

				if (resolution.status === "unresolved") {
					if (refreshingTaskKeys.has(taskKey) || !currentParams.projectId) return
					refreshingTaskKeys.add(taskKey)
					void waitForNextAttachmentsRefreshForProject(currentParams.projectId, {
						signal: abortController.signal,
					})
						.then((didLoad) => {
							if (!didLoad || abortController.signal.aborted) return
							currentParams.scheduleWhenTabsCacheReady(
								run,
								`auto-open-canvas-${taskKey}`,
							)
						})
						.catch(() => undefined)
					return
				}

				const target = resolution.projectDirectory
				const targetFileId = target?.file_id
				if (!target || targetFileId === undefined || targetFileId === null) return
				if (readActiveFileId(currentParams, activeFileIdRef) !== null) return

				pubsub.publish(PubSubEvents.Switch_Detail_Mode, "files")
				pubsub.publish(PubSubEvents.Open_File_Tab, {
					fileId: String(targetFileId),
					fileData: target,
				})
			}

			paramsRef.current.scheduleWhenTabsCacheReady(run, `auto-open-canvas-${taskKey}`)
		},
	)

	useEffect(() => {
		if (!topicId || !projectId) return

		const abortController = new AbortController()
		const refreshingTaskKeys = new Set<string>()
		const handledTaskKeys = new Set<string>()

		const unsubscribe = superMagicStore.subscribe(
			"task.completed",
			(event) => {
				const taskKey = `${event.meta.taskId}:${event.meta.appMessageId}`
				if (handledTaskKeys.has(taskKey)) return
				handledTaskKeys.add(taskKey)
				scheduleAttempt(event, abortController, refreshingTaskKeys)
			},
			{ scope: { topicId } },
		)

		return () => {
			abortController.abort()
			unsubscribe()
		}
	}, [projectId, scheduleAttempt, topicId])
}
