import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { getFileContentById, getTemporaryDownloadUrl } from "@/pages/superMagic/utils/api"
import type { AttachmentItem } from "@/pages/superMagic/components/TopicFilesButton/hooks/types"
import type { AudioProjectListItem } from "@/types/audioProject"
import type { LoadedRecordingTextFile, RecordingDetailFileMap } from "../types/recording-detail"
import { parseMagicProjectConfig } from "../utils/magic-project-config"
import { buildRecordingDetailFileMap, getAttachmentFileName } from "../utils/recording-detail-files"
import {
	buildShareRecordingMagicProjectConfig,
	type ShareRecordingDisplayConfig,
} from "../utils/share-recording-detail"

interface ShareRecordingDetailTextState {
	transcript?: LoadedRecordingTextFile
	notes?: LoadedRecordingTextFile
	summary: Record<string, LoadedRecordingTextFile>
	magicProject?: LoadedRecordingTextFile
}

interface ShareRecordingDetailDataInput {
	projectId: string
	resourceName?: string
	attachments: {
		tree: AttachmentItem[]
		list: AttachmentItem[]
	}
}

/** Loads recording detail data directly from share attachments so the share page never depends on owner-only APIs. */
export function useShareRecordingDetailData(input: ShareRecordingDetailDataInput) {
	const { projectId, resourceName, attachments } = input
	const [loading, setLoading] = useState(true)
	const [error, setError] = useState(false)
	const [projectItem, setProjectItem] = useState<AudioProjectListItem | null>(null)
	const [fileMap, setFileMap] = useState<RecordingDetailFileMap | null>(null)
	const [texts, setTexts] = useState<ShareRecordingDetailTextState>({ summary: {} })
	const [audioUrl, setAudioUrl] = useState("")

	const activeProjectIdRef = useRef(projectId)
	useEffect(() => {
		activeProjectIdRef.current = projectId
	}, [projectId])

	/** Resolves every readonly detail dependency from the already-authorized share attachment snapshot. */
	const loadDetail = useCallback(async () => {
		if (!projectId) {
			setLoading(false)
			setError(true)
			return
		}

		const currentProjectId = projectId
		setLoading(true)
		setError(false)
		setTexts({ summary: {} })
		setAudioUrl("")

		try {
			const audioDirectory = findAudioDirectoryNode(attachments.tree)
			const bundleRootPath = resolveRecordingBundleRootPath(
				attachments.tree,
				attachments.list,
			)
			const magicProjectFile = findMagicProjectFile(attachments.list, bundleRootPath)
			const magicProjectContent = magicProjectFile
				? await readTextFile(magicProjectFile.file_id)
				: undefined
			if (currentProjectId !== activeProjectIdRef.current) return

			const parsedMagicProjectConfig = magicProjectContent?.content
				? parseMagicProjectConfig(magicProjectContent.content)
				: null
			const magicProjectConfig = buildShareRecordingMagicProjectConfig({
				magicProjectConfig: parsedMagicProjectConfig,
				audioDisplayConfig:
					audioDirectory?.display_config as ShareRecordingDisplayConfig | null,
			})
			const nextFileMap = buildRecordingDetailFileMap({
				tree: attachments.tree,
				list: attachments.list,
				magicProjectConfig,
				bundleRootPath,
			})
			const [nextTexts, nextAudioUrl] = await Promise.all([
				loadTextFiles(nextFileMap, magicProjectContent),
				loadAudioUrl(nextFileMap.audio),
			])
			if (currentProjectId !== activeProjectIdRef.current) return

			setProjectItem(
				buildShareProjectItem({
					projectId,
					resourceName,
					fileMap: nextFileMap,
					audioDisplayConfig: audioDirectory?.display_config as
						| ShareRecordingDisplayConfig
						| null
						| undefined,
				}),
			)
			setFileMap(nextFileMap)
			setTexts(nextTexts)
			setAudioUrl(nextAudioUrl)
		} catch (loadError) {
			console.error("Failed to load share recording detail:", loadError)
			if (currentProjectId === activeProjectIdRef.current) setError(true)
		} finally {
			if (currentProjectId === activeProjectIdRef.current) setLoading(false)
		}
	}, [attachments.list, attachments.tree, projectId, resourceName])

	useEffect(() => {
		void loadDetail()
	}, [loadDetail])

	/** Keeps the share title stable even when the file map can only recover bundle metadata. */
	const title = useMemo(() => {
		return (
			projectItem?.project_name ||
			fileMap?.magicProjectConfig?.metadata?.title ||
			fileMap?.magicProjectConfig?.name ||
			resourceName ||
			""
		)
	}, [
		fileMap?.magicProjectConfig?.metadata?.title,
		fileMap?.magicProjectConfig?.name,
		projectItem?.project_name,
		resourceName,
	])

	return {
		loading,
		error,
		projectItem,
		fileMap,
		texts,
		audioUrl,
		title,
		attachmentTree: attachments.tree,
		attachmentList: attachments.list,
	}
}

/** Reads a text attachment by file id inside the already-authorized share route session. */
async function readTextFile(fileId?: string): Promise<LoadedRecordingTextFile | undefined> {
	if (!fileId) return undefined
	const content = await getFileContentById(fileId, { responseType: "text" })
	return {
		fileId,
		content: typeof content === "string" ? content : "",
	}
}

/** Loads transcript, notes, summary files, and preserves a preloaded magic.project.js when one was already read upstream. */
async function loadTextFiles(
	fileMap: RecordingDetailFileMap,
	preloadedMagicProject?: LoadedRecordingTextFile,
): Promise<ShareRecordingDetailTextState> {
	const summaryEntries = await Promise.all(
		fileMap.summaryFiles.map(async (entry) => {
			try {
				return [entry.type, await readTextFile(entry.file.file_id)] as const
			} catch (error) {
				console.warn(`Failed to load share recording summary file ${entry.type}:`, error)
				return [entry.type, undefined] as const
			}
		}),
	)

	const [transcript, notes] = await Promise.all([
		readTextFile(fileMap.transcript?.file_id).catch(() => undefined),
		readTextFile(fileMap.notes?.file_id).catch(() => undefined),
	])

	return {
		transcript,
		notes,
		magicProject:
			preloadedMagicProject ||
			(fileMap.magicProject?.file_id
				? await readTextFile(fileMap.magicProject.file_id).catch(() => undefined)
				: undefined),
		summary: Object.fromEntries(
			summaryEntries.filter((entry): entry is readonly [string, LoadedRecordingTextFile] =>
				Boolean(entry[1]),
			),
		),
	}
}

/** Resolves a temporary playable OSS url for the share detail audio bar. */
async function loadAudioUrl(file?: AttachmentItem): Promise<string> {
	if (!file?.file_id) return ""
	const [urlItem] = await getTemporaryDownloadUrl({ file_ids: [file.file_id] })
	return urlItem?.url ?? ""
}

/** Recovers the audio bundle root so filename-based fallback matching stays inside the current shared recording folder. */
function resolveRecordingBundleRootPath(
	tree: AttachmentItem[],
	list: AttachmentItem[],
): string | undefined {
	const audioDirectory = findAudioDirectoryNode(tree)
	const audioDirectoryPath = getAttachmentPathCandidates(audioDirectory).find(Boolean)
	if (audioDirectoryPath) return normalizeBundlePath(audioDirectoryPath)

	const magicProjectFile = list.find(isMagicProjectFile)
	return getParentDirectoryPath(getAttachmentPathCandidates(magicProjectFile).find(Boolean))
}

/** Locates the shared audio directory node that carries display_config metadata and bundle file mappings. */
function findAudioDirectoryNode(items: AttachmentItem[] = []): AttachmentItem | undefined {
	for (const item of items) {
		if (item.is_directory && item.display_config?.type === "audio") return item
		const nested = findAudioDirectoryNode(item.children || [])
		if (nested) return nested
	}
	return undefined
}

/** Finds the bundle config file generated beside recording exports. */
function findMagicProjectFile(
	files: AttachmentItem[],
	bundleRootPath?: string,
): AttachmentItem | undefined {
	const normalizedBundleRoot = normalizeBundlePath(bundleRootPath)

	return files.find((file) => {
		if (!isMagicProjectFile(file)) return false
		if (!normalizedBundleRoot) return true

		return getAttachmentPathCandidates(file).some((candidate) =>
			normalizeBundlePath(candidate).startsWith(`${normalizedBundleRoot}/`),
		)
	})
}

/** Builds a minimal read-only project item so existing detail panels can still render metadata chips consistently. */
function buildShareProjectItem(input: {
	projectId: string
	resourceName?: string
	fileMap: RecordingDetailFileMap
	audioDisplayConfig?: ShareRecordingDisplayConfig | null
}): AudioProjectListItem {
	const { projectId, resourceName, fileMap, audioDisplayConfig } = input
	const metadata = fileMap.magicProjectConfig?.metadata ?? audioDisplayConfig?.metadata
	const projectName =
		metadata?.title ||
		fileMap.magicProjectConfig?.name ||
		audioDisplayConfig?.name ||
		resourceName ||
		""

	return {
		id: projectId,
		project_name: projectName,
		created_at: parseDisplayDateToUnix(metadata?.date),
		duration: metadata?.duration ?? 0,
		tags: metadata?.tags ?? [],
		device_id: "",
		audio_source: "recorded",
		current_phase: "summarizing",
		phase_status: "completed",
		card_status: "summarized",
		is_summarized: true,
		audio_file_id: fileMap.audio?.file_id,
		source: "h5",
	}
}

/** Normalizes attachment lookup candidates so file names, relative paths, and storage keys stay comparable. */
function getAttachmentPathCandidates(file?: AttachmentItem): string[] {
	if (!file) return []

	return [file.relative_file_path, file.path, file.file_key, getAttachmentFileName(file)].filter(
		(candidate): candidate is string => Boolean(candidate),
	)
}

/** Collapses separators and casing so bundle path comparisons work across share tree variants. */
function normalizeBundlePath(path?: string): string {
	return decodeURIComponent(path || "")
		.trim()
		.toLowerCase()
		.replace(/\\/g, "/")
		.replace(/^\/+|\/+$/g, "")
}

/** Detects the generated recording config file without depending on a specific parent folder structure. */
function isMagicProjectFile(file: AttachmentItem): boolean {
	return getAttachmentPathCandidates(file).some((candidate) =>
		normalizeBundlePath(candidate).endsWith("magic.project.js"),
	)
}

/** Strips the trailing filename so file map lookup can stay inside one shared bundle folder. */
function getParentDirectoryPath(path?: string): string | undefined {
	if (!path) return undefined

	const normalizedPath = normalizeBundlePath(path)
	if (!normalizedPath) return undefined

	const lastSlashIndex = normalizedPath.lastIndexOf("/")
	return lastSlashIndex >= 0 ? normalizedPath.slice(0, lastSlashIndex) : undefined
}

/** Parses bundle metadata timestamps into unix seconds while tolerating empty or invalid share payload values. */
function parseDisplayDateToUnix(value?: string): number {
	if (!value) return 0

	const timestamp = Date.parse(value.replace(/-/g, "/"))
	return Number.isFinite(timestamp) ? Math.floor(timestamp / 1000) : 0
}
