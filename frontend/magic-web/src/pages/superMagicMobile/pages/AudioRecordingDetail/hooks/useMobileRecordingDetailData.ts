import { useEffect, useMemo, useState } from "react"
import { SuperMagicApi } from "@/apis"
import { getFileContentById, getTemporaryDownloadUrl } from "@/pages/superMagic/utils/api"
import { AttachmentDataProcessor } from "@/pages/superMagic/utils/attachmentDataProcessor"
import type { AudioProjectListItem } from "@/types/audioProject"
import type { ProjectListItem } from "@/pages/superMagic/pages/Workspace/types"
import { audioRecordingsService } from "@/services/audioRecordings"
import type { AttachmentItem } from "@/pages/superMagic/components/TopicFilesButton/hooks/types"
import { findAudioEntryFile } from "@/pages/superMagic/pages/AudioRecordings/utils/find-audio-entry-file"
import type { LoadedRecordingTextFile, RecordingDetailFileMap } from "../types"
import { parseMagicProjectConfig } from "../utils/magic-project-config"
import { buildRecordingDetailFileMap, getAttachmentFileName } from "../utils/recording-detail-files"
import { mergeProjectDetailIntoAudioItem } from "../utils/project-detail-merge"
import { resolveRecordingDetailTitle } from "../utils/recording-detail-title"

interface UseMobileRecordingDetailDataInput {
	projectId: string
	initialTitle?: string
}

interface RecordingDetailTextState {
	transcript?: LoadedRecordingTextFile
	notes?: LoadedRecordingTextFile
	summary: Record<string, LoadedRecordingTextFile>
	magicProject?: LoadedRecordingTextFile
}

/** Loads mobile recording preview data from project attachments and completed markdown files. */
export function useMobileRecordingDetailData(input: UseMobileRecordingDetailDataInput) {
	const { projectId } = input
	const [loading, setLoading] = useState(true)
	const [error, setError] = useState(false)
	const [audioProjectItem, setAudioProjectItem] = useState<AudioProjectListItem | null>(null)
	const [projectDetail, setProjectDetail] = useState<ProjectListItem | null>(null)
	const [fileMap, setFileMap] = useState<RecordingDetailFileMap | null>(null)
	const [texts, setTexts] = useState<RecordingDetailTextState>({ summary: {} })
	const [audioUrl, setAudioUrl] = useState<string>("")

	useEffect(() => {
		let cancelled = false

		/** Loads all completed preview assets for the current route project. */
		async function loadDetail() {
			if (!projectId) {
				setLoading(false)
				setError(true)
				return
			}

			setLoading(true)
			setError(false)
			setProjectDetail(null)
			setTexts({ summary: {} })
			setAudioUrl("")

			try {
				const [attachmentsResponse, projectDetail, item] = await Promise.all([
					SuperMagicApi.getAttachmentsByProjectId({ projectId, temporaryToken: "" }),
					loadProjectDetail(projectId),
					loadSingleProject(projectId),
				])
				if (cancelled) return

				const processed = AttachmentDataProcessor.processAttachmentData(attachmentsResponse)
				// Resolve the HTML bundle root first so all later file lookups stay inside one recording package.
				const bundleRootPath = resolveRecordingBundleRootPath(
					processed.tree,
					processed.list,
				)
				const magicProjectFile = findMagicProjectFile(processed.list, bundleRootPath)
				const magicProjectContent = magicProjectFile
					? await readTextFile(magicProjectFile.file_id)
					: undefined
				const magicProjectConfig = magicProjectContent
					? parseMagicProjectConfig(magicProjectContent.content)
					: null
				const nextFileMap = buildRecordingDetailFileMap({
					tree: processed.tree,
					list: processed.list,
					magicProjectConfig,
					bundleRootPath,
				})
				if (cancelled) return

				const [nextTexts, nextAudioUrl] = await Promise.all([
					loadTextFiles(nextFileMap),
					loadAudioUrl(nextFileMap.audio),
				])
				if (cancelled) return

				setAudioProjectItem(item)
				setProjectDetail(projectDetail)
				setFileMap(nextFileMap)
				setTexts(nextTexts)
				setAudioUrl(nextAudioUrl)
			} catch (loadError) {
				console.error("Failed to load mobile recording detail:", loadError)
				if (!cancelled) setError(true)
			} finally {
				if (!cancelled) setLoading(false)
			}
		}

		void loadDetail()

		return () => {
			cancelled = true
		}
	}, [projectId])

	const projectItem = useMemo(
		() => mergeProjectDetailIntoAudioItem(audioProjectItem, projectDetail),
		[audioProjectItem, projectDetail],
	)

	const title = useMemo(() => {
		return resolveRecordingDetailTitle({
			projectName: projectDetail?.project_name,
		})
	}, [projectDetail?.project_name])

	return {
		loading,
		error,
		projectItem,
		fileMap,
		texts,
		audioUrl,
		title,
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

/** Loads canonical project metadata so title/workspace fields match the same source used by legacy PC detail flows. */
async function loadProjectDetail(projectId: string): Promise<ProjectListItem | null> {
	try {
		return await SuperMagicApi.getProjectDetail({ id: projectId })
	} catch {
		return null
	}
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

/** Reads a text attachment by file id and preserves the id for cache-safe rendering keys. */
async function readTextFile(fileId?: string): Promise<LoadedRecordingTextFile | undefined> {
	if (!fileId) return undefined
	const content = await getFileContentById(fileId, { responseType: "text" })
	return {
		fileId,
		content: typeof content === "string" ? content : "",
	}
}

/** Loads transcript, notes, and summary markdown files without failing the whole detail page. */
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

/** Resolves the temporary audio URL used by the single shared detail player. */
async function loadAudioUrl(file?: AttachmentItem): Promise<string> {
	if (!file?.file_id) return ""
	const [urlItem] = await getTemporaryDownloadUrl({ file_ids: [file.file_id] })
	return urlItem?.url ?? ""
}

/** Derives the active audio bundle folder from the resolved HTML entry so mobile detail mirrors desktop bundle scoping. */
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

/** Collects path variants from one attachment row so bundle-root checks survive API payload differences. */
function getAttachmentPathCandidates(file?: AttachmentItem): string[] {
	if (!file) return []

	return [file.relative_file_path, file.path, file.file_key, getAttachmentFileName(file)].filter(
		(candidate): candidate is string => Boolean(candidate),
	)
}

/** Returns the parent directory path used to scope recording bundle lookups. */
function getParentDirectoryPath(path?: string): string | undefined {
	if (!path) return undefined

	const normalizedPath = normalizeBundlePath(path)
	if (!normalizedPath) return undefined

	const lastSlashIndex = normalizedPath.lastIndexOf("/")
	return lastSlashIndex >= 0 ? normalizedPath.slice(0, lastSlashIndex) : undefined
}

/** Normalizes attachment paths so absolute and relative bundle roots can be compared reliably. */
function normalizeBundlePath(path?: string): string {
	return decodeURIComponent(path || "")
		.trim()
		.toLowerCase()
		.replace(/\\/g, "/")
		.replace(/^\/+|\/+$/g, "")
}

/** Matches magic.project.js across attachment fields that may contain either basenames or prefixed paths. */
function isMagicProjectFile(file: AttachmentItem): boolean {
	return getAttachmentPathCandidates(file).some((candidate) =>
		normalizeBundlePath(candidate).endsWith("magic.project.js"),
	)
}
