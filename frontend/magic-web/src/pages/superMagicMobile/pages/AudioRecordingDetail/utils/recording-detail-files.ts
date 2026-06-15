import type { AttachmentItem } from "@/pages/superMagic/components/TopicFilesButton/hooks/types"
import type {
	MagicProjectConfig,
	MobileRecordingSummaryType,
	RecordingDetailFileMap,
	RecordingDetailFileRef,
} from "../types"

const SUMMARY_TYPE_ORDER: MobileRecordingSummaryType[] = [
	"summary",
	"topics",
	"highlights",
	"insights",
	"mindmap",
	"followup",
	"power_dynamics",
	"intent",
]

const EXCLUDED_DYNAMIC_TYPES = new Set(["audio", "notes", "transcript", "magic_project"])

/** Returns the most stable display filename available on an attachment item. */
export function getAttachmentFileName(file: AttachmentItem | undefined): string {
	return file?.file_name || file?.filename || file?.display_filename || file?.name || ""
}

/** Flattens tree/list attachment data into one deduplicated file list for lookup. */
export function flattenRecordingAttachments(
	tree: AttachmentItem[] = [],
	list: AttachmentItem[] = [],
): AttachmentItem[] {
	const result: AttachmentItem[] = []
	const seen = new Set<string>()

	function visit(item: AttachmentItem) {
		const key = item.file_id || `${item.path || ""}/${getAttachmentFileName(item)}`
		if (!seen.has(key)) {
			seen.add(key)
			result.push(item)
		}
		item.children?.forEach(visit)
	}

	tree.forEach(visit)
	list.forEach(visit)

	return result.filter((item) => !item.is_directory)
}

/** Builds a typed file map from magic.project.js first, falling back to names and extensions. */
export function buildRecordingDetailFileMap(input: {
	tree: AttachmentItem[]
	list: AttachmentItem[]
	magicProjectConfig?: MagicProjectConfig | null
	bundleRootPath?: string
}): RecordingDetailFileMap {
	const files = flattenRecordingAttachments(input.tree, input.list)
	// Scope lookups to the resolved audio bundle so sibling recording folders cannot hijack matches.
	const scopedFiles = scopeFilesToBundle(files, input.bundleRootPath)
	const magicProject = scopedFiles.find(isMagicProjectFile) || files.find(isMagicProjectFile)
	const configFiles = input.magicProjectConfig?.files ?? {}

	function findByConfiguredName(type: string) {
		const configuredName = configFiles[type]
		if (!configuredName) return undefined
		return findFileByName(scopedFiles, configuredName)
	}

	const audio =
		findByConfiguredName("audio") ?? findFileByExtension(scopedFiles, ["wav", "mp3", "m4a"])
	const transcript =
		findByConfiguredName("transcript") ?? findByNameHint(scopedFiles, ["transcript", "文字稿"])
	const notes =
		findByConfiguredName("notes") ?? findByNameHint(scopedFiles, ["notes", "笔记", "流式识别"])

	return {
		audio,
		transcript,
		notes,
		magicProject,
		magicProjectConfig: input.magicProjectConfig ?? undefined,
		summaryFiles: resolveSummaryFiles(scopedFiles, configFiles),
	}
}

/** Resolves dynamic summary tabs while keeping the same type/file index relationship as APP/H5 HTML. */
function resolveSummaryFiles(
	files: AttachmentItem[],
	configFiles: Record<string, string>,
): RecordingDetailFileRef[] {
	const result: RecordingDetailFileRef[] = []
	const added = new Set<string>()

	function addType(type: string) {
		if (added.has(type)) return
		const configuredName = configFiles[type]
		if (!configuredName) return
		const file = findFileByName(files, configuredName)
		if (!file) return
		result.push({ type, fileName: configuredName, file })
		added.add(type)
	}

	SUMMARY_TYPE_ORDER.forEach(addType)

	Object.keys(configFiles).forEach((type) => {
		if (EXCLUDED_DYNAMIC_TYPES.has(type) || added.has(type)) return
		const file = findFileByName(files, configFiles[type])
		if (!file) return
		result.push({ type: "unsupported", fileName: configFiles[type], file })
		added.add(type)
	})

	return result
}

/** Finds a file by exact filename or relative path suffix from magic.project.js. */
function findFileByName(files: AttachmentItem[], expectedName: string): AttachmentItem | undefined {
	const normalizedExpected = normalizeFileLookupText(expectedName)
	return files.find((file) => {
		const candidates = [
			getAttachmentFileName(file),
			file.path,
			file.relative_file_path,
			file.file_key,
		].filter(Boolean)
		return candidates.some((candidate) =>
			normalizeFileLookupText(String(candidate)).endsWith(normalizedExpected),
		)
	})
}

/** Finds a likely file by generated filename hints when magic.project.js is absent or incomplete. */
function findByNameHint(files: AttachmentItem[], hints: string[]): AttachmentItem | undefined {
	return files.find((file) => {
		const name = normalizeFileLookupText(getAttachmentFileName(file))
		return hints.some((hint) => name.includes(normalizeFileLookupText(hint)))
	})
}

/** Finds a likely audio file by extension for non-summarized preview fallback. */
function findFileByExtension(
	files: AttachmentItem[],
	extensions: string[],
): AttachmentItem | undefined {
	const allowed = new Set(extensions.map((extension) => extension.toLowerCase()))
	return files.find((file) => {
		const extension = (
			file.file_extension ||
			getAttachmentFileName(file).split(".").pop() ||
			""
		)
			.toLowerCase()
			.replace(/^\./, "")
		return allowed.has(extension)
	})
}

/** Normalizes paths and filenames so API path variants still match configured file names. */
function normalizeFileLookupText(value: string): string {
	return decodeURIComponent(value).trim().toLowerCase().replace(/\\/g, "/")
}

/** Narrows attachment lookups to one audio bundle folder while keeping absolute and relative paths comparable. */
function scopeFilesToBundle(files: AttachmentItem[], bundleRootPath?: string): AttachmentItem[] {
	if (!bundleRootPath) return files

	const normalizedRoot = trimSlashes(normalizeFileLookupText(bundleRootPath))
	if (!normalizedRoot) return files

	const scopedFiles = files.filter((file) =>
		getFileLookupCandidates(file).some((candidate) => {
			const normalizedCandidate = trimSlashes(normalizeFileLookupText(candidate))
			return (
				normalizedCandidate === normalizedRoot ||
				normalizedCandidate.startsWith(`${normalizedRoot}/`)
			)
		}),
	)

	return scopedFiles.length > 0 ? scopedFiles : files
}

/** Collects all path variants used by attachment payloads so bundle scoping survives API shape differences. */
function getFileLookupCandidates(file: AttachmentItem): string[] {
	return [getAttachmentFileName(file), file.path, file.relative_file_path, file.file_key].filter(
		(candidate): candidate is string => Boolean(candidate),
	)
}

/** Removes leading and trailing slashes so relative and absolute bundle paths match consistently. */
function trimSlashes(value: string): string {
	return value.replace(/^\/+|\/+$/g, "")
}

/** Detects magic.project.js even when backend fields include directory prefixes instead of a bare basename. */
function isMagicProjectFile(file: AttachmentItem): boolean {
	return getFileLookupCandidates(file).some((candidate) =>
		normalizeFileLookupText(candidate).endsWith("/magic.project.js"),
	)
		? true
		: normalizeFileLookupText(getAttachmentFileName(file)) === "magic.project.js"
}
