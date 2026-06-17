import { useEffect, useMemo, useState } from "react"
import { SuperMagicApi } from "@/apis"
import { getFileContentById, getTemporaryDownloadUrl } from "@/pages/superMagic/utils/api"
import { AttachmentDataProcessor } from "@/pages/superMagic/utils/attachmentDataProcessor"
import type { AudioProjectListItem } from "@/types/audioProject"
import type { ProjectListItem } from "@/pages/superMagic/pages/Workspace/types"
import { audioRecordingsService } from "@/services/audioRecordings"
import type { AttachmentItem } from "@/pages/superMagic/components/TopicFilesButton/hooks/types"
import { findAudioEntryFile } from "../utils/find-audio-entry-file"
import type { LoadedRecordingTextFile, RecordingDetailFileMap } from "../types/recording-detail"
import { parseMagicProjectConfig } from "../utils/magic-project-config"
import { buildRecordingDetailFileMap, getAttachmentFileName } from "../utils/recording-detail-files"
import { mergeProjectDetailIntoAudioItem } from "../utils/project-detail-merge"
import { resolveRecordingDetailTitle } from "../utils/recording-detail-title"

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
	const { projectId } = input
	const [loading, setLoading] = useState(true)
	const [error, setError] = useState(false)
	const [audioProjectItem, setAudioProjectItem] = useState<AudioProjectListItem | null>(null)
	const [projectDetail, setProjectDetail] = useState<ProjectListItem | null>(null)
	const [fileMap, setFileMap] = useState<RecordingDetailFileMap | null>(null)
	const [texts, setTexts] = useState<RecordingDetailTextState>({ summary: {} })
	const [audioUrl, setAudioUrl] = useState<string>("")
	const [attachmentTree, setAttachmentTree] = useState<AttachmentItem[]>([])
	const [attachmentList, setAttachmentList] = useState<AttachmentItem[]>([])

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
			setAttachmentTree([])
			setAttachmentList([])

			try {
				const [attachmentsResponse, projectDetail, item] = await Promise.all([
					SuperMagicApi.getAttachmentsByProjectId({ projectId, temporaryToken: "" }),
					loadProjectDetail(projectId),
					loadSingleProject(projectId),
				])
				if (cancelled) return

				const processed = AttachmentDataProcessor.processAttachmentData(attachmentsResponse)
				setAttachmentTree(processed.tree)
				setAttachmentList(processed.list)

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
				console.error("Failed to load recording detail:", loadError)
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
		attachmentTree,
		attachmentList,
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

/** Loads canonical project metadata. */
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
