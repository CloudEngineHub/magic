import projectFilesStoreDefault, { type ProjectFilesStore } from "@/stores/projectFiles"
import type { SuperMagicFileChangeItem } from "@/types/chat/intermediate_message"
import { requestProjectAttachmentsFullRefresh } from "../../services/attachmentsTopicSync"

export type ProjectAttachmentMutationMatchMode = "exact-file" | "project-any-apply"
export type ProjectAttachmentMutationFallback = "none" | "full-refresh"
export type ProjectAttachmentMutationWaitStatus =
	| "applied"
	| "fallback-refreshed"
	| "timeout"
	| "unmatched"

export interface ProjectAttachmentMutationWaitResult {
	projectId: string
	status: ProjectAttachmentMutationWaitStatus
	matchMode: ProjectAttachmentMutationMatchMode
	source?: "ws" | "fallback"
}

export interface WaitForProjectAttachmentChangeOptions {
	fileIds?: string[]
	operations?: string[]
	matchMode?: ProjectAttachmentMutationMatchMode
	timeoutMs?: number
	fallbackTimeoutMs?: number
	fallback?: ProjectAttachmentMutationFallback
	reason?: string
	callback?: () => void
	store?: ProjectFilesStore
}

interface WaitEntry {
	projectId: string
	store: ProjectFilesStore
	fileIds: Set<string>
	operations: Set<string>
	matchMode: ProjectAttachmentMutationMatchMode
	fallback: ProjectAttachmentMutationFallback
	fallbackTimeoutMs: number
	reason: string
	callback?: () => void
	timeoutId: ReturnType<typeof setTimeout>
	fallbackTimeoutId?: ReturnType<typeof setTimeout>
	sawProjectApply: boolean
	settled: boolean
	resolve: (result: ProjectAttachmentMutationWaitResult) => void
}

const waitQueue: WaitEntry[] = []

function removeEntry(entry: WaitEntry) {
	const index = waitQueue.indexOf(entry)
	if (index !== -1) waitQueue.splice(index, 1)
}

function runCallback(callback: (() => void) | undefined) {
	try {
		callback?.()
	} catch (error) {
		console.error("[attachmentMutationWaiter] callback failed", error)
	}
}

function finishEntry(
	entry: WaitEntry,
	result: Omit<ProjectAttachmentMutationWaitResult, "projectId" | "matchMode">,
) {
	if (entry.settled) return
	entry.settled = true
	removeEntry(entry)
	clearTimeout(entry.timeoutId)
	if (entry.fallbackTimeoutId) clearTimeout(entry.fallbackTimeoutId)
	runCallback(entry.callback)
	entry.resolve({
		projectId: entry.projectId,
		matchMode: entry.matchMode,
		...result,
	})
}

function shouldResolveByChange(entry: WaitEntry, changes: SuperMagicFileChangeItem[]) {
	if (entry.matchMode === "project-any-apply") return changes.length > 0

	return changes.some((change) => {
		const fileMatched = entry.fileIds.size === 0 || entry.fileIds.has(change.file_id)
		const operationMatched =
			entry.operations.size === 0 || entry.operations.has(String(change.operation))
		return fileMatched && operationMatched
	})
}

function startFallbackRefresh(entry: WaitEntry, status: ProjectAttachmentMutationWaitStatus) {
	if (entry.fallback !== "full-refresh") {
		finishEntry(entry, { status })
		return
	}

	entry.fallbackTimeoutId = setTimeout(() => {
		finishEntry(entry, { status })
	}, entry.fallbackTimeoutMs)

	requestProjectAttachmentsFullRefresh({
		projectId: entry.projectId,
		reason: entry.reason,
		callback: () => {
			finishEntry(entry, { status: "fallback-refreshed", source: "fallback" })
		},
	})
}

export function waitForProjectAttachmentChange(
	projectId: string | undefined,
	options: WaitForProjectAttachmentChangeOptions = {},
): Promise<ProjectAttachmentMutationWaitResult> {
	const {
		fileIds = [],
		operations = [],
		matchMode = fileIds.length > 0 || operations.length > 0
			? "exact-file"
			: "project-any-apply",
		timeoutMs = 5_000,
		fallbackTimeoutMs = 15_000,
		fallback = "none",
		reason = "attachment-mutation-waiter-timeout",
		callback,
		store = projectFilesStoreDefault,
	} = options

	if (!projectId) {
		runCallback(callback)
		return Promise.resolve({
			projectId: "",
			status: "timeout",
			matchMode,
		})
	}

	return new Promise((resolve) => {
		const entry: WaitEntry = {
			projectId,
			store,
			fileIds: new Set(fileIds.filter(Boolean)),
			operations: new Set(operations.filter(Boolean)),
			matchMode,
			fallback,
			fallbackTimeoutMs,
			reason,
			callback,
			timeoutId: setTimeout(() => {
				const status = entry.sawProjectApply ? "unmatched" : "timeout"
				startFallbackRefresh(entry, status)
			}, timeoutMs),
			sawProjectApply: false,
			settled: false,
			resolve,
		}

		waitQueue.push(entry)
	})
}

export function resolveProjectAttachmentMutationWaiters({
	projectId,
	store = projectFilesStoreDefault,
	changes,
	source,
}: {
	projectId: string
	store?: ProjectFilesStore
	changes: SuperMagicFileChangeItem[]
	source: "ws" | "fallback"
}) {
	const entries = [...waitQueue]
	for (const entry of entries) {
		if (entry.projectId !== projectId || entry.store !== store) continue
		entry.sawProjectApply = true
		if (shouldResolveByChange(entry, changes)) {
			finishEntry(entry, { status: "applied", source })
		}
	}
}

export function releaseProjectAttachmentMutationWaitersForProject(projectId: string) {
	const entries = [...waitQueue]
	for (const entry of entries) {
		if (entry.projectId === projectId) {
			finishEntry(entry, { status: "timeout" })
		}
	}
}

export function releaseAllProjectAttachmentMutationWaiters() {
	const entries = [...waitQueue]
	for (const entry of entries) {
		finishEntry(entry, { status: "timeout" })
	}
}
