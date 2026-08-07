import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { getFileContentById, getTemporaryDownloadUrl } from "@/pages/superMagic/utils/api"
import { loadProjectAttachments } from "@/pages/superMagic/services/projectAttachmentsLoader"
import type { AudioProjectListItem } from "@/types/audioProject"
import { audioRecordingsService } from "@/services/audioRecordings"
import type { AttachmentItem } from "@/pages/superMagic/components/TopicFilesButton/hooks/types"
import { findAudioEntryFile } from "../utils/find-audio-entry-file"
import type { LoadedRecordingTextFile, RecordingDetailFileMap } from "../types/recording-detail"
import { parseMagicProjectConfig } from "../utils/magic-project-config"
import { buildRecordingDetailFileMap, getAttachmentFileName } from "../utils/recording-detail-files"
import { resolveRecordingDetailTitle } from "../utils/recording-detail-title"
import {
	isAudioProjectSummarizing,
	isAudioProjectSummaryReady,
} from "../utils/audio-recordings-utils"

interface UseRecordingDetailDataInput {
	projectId: string
	initialTitle?: string
}

interface RecordingDetailTextState {
	transcript?: LoadedRecordingTextFile
	notes?: LoadedRecordingTextFile
	summary: Record<string, LoadedRecordingTextFile>
	magicProject?: LoadedRecordingTextFile
}

/** Loads recording preview data from project attachments and completed markdown files. */
export function useRecordingDetailData(input: UseRecordingDetailDataInput) {
	const { projectId, initialTitle } = input
	const [loading, setLoading] = useState(true)
	const [error, setError] = useState(false)
	const [audioProjectItem, setAudioProjectItem] = useState<AudioProjectListItem | null>(null)
	const [fileMap, setFileMap] = useState<RecordingDetailFileMap | null>(null)
	const [texts, setTexts] = useState<RecordingDetailTextState>({ summary: {} })
	const [audioUrl, setAudioUrl] = useState<string>("")
	const [attachmentTree, setAttachmentTree] = useState<AttachmentItem[]>([])
	const [attachmentList, setAttachmentList] = useState<AttachmentItem[]>([])
	const attachmentRequestRef = useRef<AbortController | null>(null)

	const activeProjectIdRef = useRef(projectId)
	useEffect(() => {
		activeProjectIdRef.current = projectId
	}, [projectId])

	/** Loads all completed preview assets for the current route project. */
	const loadDetail = useCallback(async () => {
		if (!projectId) {
			setLoading(false)
			setError(true)
			return
		}

		const currentProjectId = projectId
		attachmentRequestRef.current?.abort()
		const controller = new AbortController()
		attachmentRequestRef.current = controller
		setLoading(true)
		setError(false)
		setTexts({ summary: {} })
		setAudioUrl("")
		setAttachmentTree([])
		setAttachmentList([])

		try {
			const [processed, item] = await Promise.all([
				loadProjectAttachments({ projectId, signal: controller.signal }),
				loadSingleProject(projectId),
			])
			if (controller.signal.aborted || currentProjectId !== activeProjectIdRef.current) return

			const bundleRootPath = resolveRecordingBundleRootPath(processed.tree, processed.list)
			const magicProjectFile = findMagicProjectFile(processed.list, bundleRootPath)
			const magicProjectContent = magicProjectFile
				? await readTextFile(magicProjectFile.file_id)
				: undefined
			if (controller.signal.aborted || currentProjectId !== activeProjectIdRef.current) return

			const magicProjectConfig = magicProjectContent
				? parseMagicProjectConfig(magicProjectContent.content)
				: null
			const nextFileMap = buildRecordingDetailFileMap({
				tree: processed.tree,
				list: processed.list,
				magicProjectConfig,
				bundleRootPath,
			})

			const [nextTexts, nextAudioUrl] = await Promise.all([
				loadTextFiles(nextFileMap),
				loadAudioUrl(nextFileMap.audio),
			])
			if (controller.signal.aborted || currentProjectId !== activeProjectIdRef.current) return

			setAttachmentTree(processed.tree)
			setAttachmentList(processed.list)
			setAudioProjectItem(item)
			setFileMap(nextFileMap)
			setTexts(nextTexts)
			setAudioUrl(nextAudioUrl)
		} catch (loadError) {
			if (controller.signal.aborted) return
			console.error("Failed to load recording detail:", loadError)
			if (currentProjectId === activeProjectIdRef.current) setError(true)
		} finally {
			if (!controller.signal.aborted && currentProjectId === activeProjectIdRef.current) {
				setLoading(false)
			}
		}
	}, [projectId])

	useEffect(() => {
		void loadDetail()
		return () => attachmentRequestRef.current?.abort()
	}, [loadDetail])

	// Polls summary task status every 10s while summarizing; stops when summary is ready.
	useEffect(() => {
		if (!projectId || !audioProjectItem) return
		if (!isAudioProjectSummarizing(audioProjectItem)) return

		const currentProjectId = projectId
		let timerId: ReturnType<typeof setInterval> | null = null

		async function pollStatus() {
			try {
				const latestItem = await loadSingleProject(projectId)
				if (currentProjectId !== activeProjectIdRef.current) return
				if (!latestItem) return

				if (isAudioProjectSummaryReady(latestItem)) {
					if (timerId) clearInterval(timerId)
					void loadDetail()
					return
				}

				if (isAudioProjectSummarizing(latestItem)) {
					setAudioProjectItem(latestItem)
				}
			} catch (err) {
				console.error("Failed to poll recording status:", err)
			}
		}

		void pollStatus()
		timerId = setInterval(pollStatus, 10000)

		return () => {
			if (timerId) clearInterval(timerId)
		}
		// Narrow phase fields so polling timer is not reset on every poll response object swap.
		// eslint-disable-next-line react-hooks/exhaustive-deps -- intentional: avoid resetting interval on item reference change
	}, [
		projectId,
		audioProjectItem?.card_status,
		audioProjectItem?.current_phase,
		audioProjectItem?.phase_status,
		loadDetail,
	])

	const mutateAudioProjectItem = useCallback((item: AudioProjectListItem) => {
		setAudioProjectItem(item)
	}, [])

	const projectItem = audioProjectItem

	const title = useMemo(() => {
		return resolveRecordingDetailTitle({
			projectName: audioProjectItem?.project_name,
			createdAt: audioProjectItem?.created_at,
			initialTitle,
		})
	}, [audioProjectItem?.created_at, audioProjectItem?.project_name, initialTitle])

	return {
		loading,
		error,
		projectItem,
		fileMap,
		texts,
		audioUrl,
		title,
		attachmentTree,
		attachmentList,
		refresh: loadDetail,
		mutateAudioProjectItem,
	}
}

/** Loads one project row so detail state can recover after direct URL entry. */
async function loadSingleProject(projectId: string): Promise<AudioProjectListItem | null> {
	const data = await audioRecordingsService.queryProjects({
		page: 1,
		pageSize: 1,
		keyword: "",
		summaryFilter: "all",
		sortBy: "created_at",
		sortOrder: "desc",
		projectIds: [projectId],
	})
	return data.list[0] ?? null
}

/** Finds the special config file generated beside recording project assets. */
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

/** Reads a text attachment by file id. */
async function readTextFile(fileId?: string): Promise<LoadedRecordingTextFile | undefined> {
	if (!fileId) return undefined
	const content = await getFileContentById(fileId, { responseType: "text" })
	return {
		fileId,
		content: typeof content === "string" ? content : "",
	}
}

/** Loads transcript, notes, and summary markdown files. */
async function loadTextFiles(fileMap: RecordingDetailFileMap): Promise<RecordingDetailTextState> {
	const summaryEntries = await Promise.all(
		fileMap.summaryFiles.map(async (entry) => {
			try {
				return [entry.type, await readTextFile(entry.file.file_id)] as const
			} catch (error) {
				console.warn(`Failed to load recording summary file ${entry.type}:`, error)
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
		magicProject: fileMap.magicProject?.file_id
			? await readTextFile(fileMap.magicProject.file_id).catch(() => undefined)
			: undefined,
		summary: Object.fromEntries(
			summaryEntries.filter((entry): entry is readonly [string, LoadedRecordingTextFile] =>
				Boolean(entry[1]),
			),
		),
	}
}

/** Resolves the temporary audio URL. */
async function loadAudioUrl(file?: AttachmentItem): Promise<string> {
	if (!file?.file_id) return ""
	const [urlItem] = await getTemporaryDownloadUrl({ file_ids: [file.file_id] })
	return urlItem?.url ?? ""
}

/** Derives the active audio bundle folder from the resolved HTML entry. */
function resolveRecordingBundleRootPath(
	tree: AttachmentItem[],
	list: AttachmentItem[],
): string | undefined {
	const audioEntryFile = findAudioEntryFile(tree)
	const audioEntryPath = getAttachmentPathCandidates(audioEntryFile).find(Boolean)
	if (audioEntryPath) return getParentDirectoryPath(audioEntryPath)

	const magicProjectFile = list.find(isMagicProjectFile)
	return getParentDirectoryPath(getAttachmentPathCandidates(magicProjectFile).find(Boolean))
}

function getAttachmentPathCandidates(file?: AttachmentItem): string[] {
	if (!file) return []

	return [file.relative_file_path, file.path, file.file_key, getAttachmentFileName(file)].filter(
		(candidate): candidate is string => Boolean(candidate),
	)
}

function getParentDirectoryPath(path?: string): string | undefined {
	if (!path) return undefined

	const normalizedPath = normalizeBundlePath(path)
	if (!normalizedPath) return undefined

	const lastSlashIndex = normalizedPath.lastIndexOf("/")
	return lastSlashIndex >= 0 ? normalizedPath.slice(0, lastSlashIndex) : undefined
}

function normalizeBundlePath(path?: string): string {
	return decodeURIComponent(path || "")
		.trim()
		.toLowerCase()
		.replace(/\\/g, "/")
		.replace(/^\/+|\/+$/g, "")
}

function isMagicProjectFile(file: AttachmentItem): boolean {
	return getAttachmentPathCandidates(file).some((candidate) =>
		normalizeBundlePath(candidate).endsWith("magic.project.js"),
	)
}
