import type { TiptapMentionAttributes } from "@/components/business/MentionPanel/tiptap-plugin"
import {
	MentionItemType,
	type UploadFileMentionData,
} from "@/components/business/MentionPanel/types"

const META_STORAGE_KEY = "html-screenshot-targets:v1"

interface ScreenshotTargetMeta {
	storageId: string
	fileName: string
	fileSize: number
}

type MentionListener = () => void

const mentions = new Map<string, TiptapMentionAttributes>()
const listeners = new Map<string, Set<MentionListener>>()

function readPersistedMeta(): Record<string, ScreenshotTargetMeta> {
	try {
		const raw = localStorage.getItem(META_STORAGE_KEY)
		if (!raw) return {}
		const parsed = JSON.parse(raw) as Record<string, ScreenshotTargetMeta>
		return parsed && typeof parsed === "object" ? parsed : {}
	} catch {
		return {}
	}
}

function writePersistedMeta(meta: Record<string, ScreenshotTargetMeta>) {
	try {
		localStorage.setItem(META_STORAGE_KEY, JSON.stringify(meta))
	} catch {
		// Private mode or quota; in-memory mentions still work this session.
	}
}

function persistMeta(targetId: string, meta: ScreenshotTargetMeta) {
	const all = readPersistedMeta()
	all[targetId] = meta
	writePersistedMeta(all)
}

function removePersistedMeta(targetId: string) {
	const all = readPersistedMeta()
	if (!(targetId in all)) return
	delete all[targetId]
	writePersistedMeta(all)
}

function createMentionFromMeta(meta: ScreenshotTargetMeta): TiptapMentionAttributes {
	const extension = meta.fileName.split(".").pop() ?? ""
	return {
		type: MentionItemType.UPLOAD_FILE,
		data: {
			file_id: meta.storageId,
			file_name: meta.fileName,
			file_path: meta.storageId,
			file_extension: extension,
			file_size: meta.fileSize,
			is_hidden: true,
			is_html_screenshot: true,
			storage_id: meta.storageId,
			upload_status: "done",
		},
	}
}

function notify(targetId: string) {
	listeners.get(targetId)?.forEach((listener) => listener())
}

function getScreenshotStorageId(mention: TiptapMentionAttributes): string | undefined {
	if (mention.type !== MentionItemType.UPLOAD_FILE) return undefined
	const data = mention.data as UploadFileMentionData
	return data.storage_id || (data.is_html_screenshot ? data.file_path : undefined)
}

/** Remember a prepared screenshot mention for a inspector target. */
export function setHtmlScreenshotMention(targetId: string, mention: TiptapMentionAttributes) {
	mentions.set(targetId, mention)
	const storageId = getScreenshotStorageId(mention)
	const data = mention.data as UploadFileMentionData | undefined
	if (storageId && data?.file_name) {
		persistMeta(targetId, {
			storageId,
			fileName: data.file_name,
			fileSize: data.file_size ?? 0,
		})
	}
	notify(targetId)
}

export function getHtmlScreenshotMention(targetId: string): TiptapMentionAttributes | undefined {
	const cached = mentions.get(targetId)
	if (cached) return cached

	const meta = readPersistedMeta()[targetId]
	if (!meta) return undefined

	const mention = createMentionFromMeta(meta)
	mentions.set(targetId, mention)
	return mention
}

export function subscribeHtmlScreenshotTarget(targetId: string, listener: MentionListener) {
	const set = listeners.get(targetId) ?? new Set<MentionListener>()
	set.add(listener)
	listeners.set(targetId, set)
	return () => {
		const current = listeners.get(targetId)
		if (!current) return
		current.delete(listener)
		if (current.size === 0) listeners.delete(targetId)
	}
}

export function forgetHtmlScreenshotTarget(targetId: string) {
	mentions.delete(targetId)
	removePersistedMeta(targetId)
	notify(targetId)
}

export function forgetHtmlScreenshotByStorageId(storageId: string) {
	for (const [targetId, mention] of mentions) {
		if (getScreenshotStorageId(mention) === storageId) {
			forgetHtmlScreenshotTarget(targetId)
			return
		}
	}

	const persisted = readPersistedMeta()
	for (const [targetId, meta] of Object.entries(persisted)) {
		if (meta.storageId === storageId) {
			forgetHtmlScreenshotTarget(targetId)
			return
		}
	}
}

export function getHtmlScreenshotStorageId(
	mention: TiptapMentionAttributes | undefined,
): string | undefined {
	if (!mention) return undefined
	return getScreenshotStorageId(mention)
}

/** Test-only reset for in-memory and persisted target mentions. */
export function resetHtmlScreenshotTargetStore() {
	mentions.clear()
	listeners.clear()
	try {
		localStorage.removeItem(META_STORAGE_KEY)
	} catch {
		// Ignore storage access errors in tests.
	}
}
