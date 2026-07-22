import {
	createContext,
	useCallback,
	useContext,
	useEffect,
	useMemo,
	useRef,
	useState,
	type ReactNode,
} from "react"
import { IMAGE_EXTENSIONS } from "@/constants/file"
import {
	getTemporaryDownloadUrl,
	type GetTemporaryDownloadUrlItem,
} from "@/pages/superMagic/utils/api"
import { resolveSafePreviewUrl } from "@/pages/superMagic/components/Detail/components/FilesViewer/components/previewUrl"
import {
	isOssExpired,
	parseExpiresAt,
} from "@/components/CanvasDesign/runtime/resources/offline-cache/ossExpiryUtils"
import type { ImageProcessOptions } from "@/utils/image-processing"
import type { AttachmentItem } from "../hooks/types"

type PreviewStatus = "idle" | "loading" | "loaded" | "error"

export interface ProjectFileImagePreviewSource {
	item: AttachmentItem
	fileId: string
	cacheKey: string
	fileName: string
	directThumbnailUrl?: string
}

interface PreviewState {
	status: PreviewStatus
	url?: string
}

interface PreviewUrlCacheItem {
	url: string
	expiresAt?: string
}

interface ProjectFileImagePreviewManager {
	ensurePreview: (source: ProjectFileImagePreviewSource) => void
	getPreviewState: (source: ProjectFileImagePreviewSource) => PreviewState
	markPreviewImageError: (source: ProjectFileImagePreviewSource) => void
	setMountedItems: (items: AttachmentItem[]) => void
}

const PROJECT_FILE_IMAGE_PREVIEW_PROCESS: ImageProcessOptions = {
	resize: { w: 320, h: 320, m: "lfit" },
	quality: 45,
	format: "webp",
	autoOrient: 1,
}

const imageExtSet = new Set(IMAGE_EXTENSIONS.map((ext) => normalizeFileExtension(ext)))
const previewUrlCache = new Map<string, PreviewUrlCacheItem>()
const PREVIEW_CACHE_LIMIT = 500
const THUMBNAIL_BATCH_DELAY_MS = 80
const THUMBNAIL_BATCH_SIZE = 50
const TOOLTIP_IMAGE_MAX_WIDTH = 320
const TOOLTIP_IMAGE_MAX_HEIGHT = 320
const TOOLTIP_IMAGE_MIN_LONG_EDGE = 160
const EMPTY_PREVIEW_STATE: PreviewState = { status: "idle" }
const PREVIEW_CACHE_RESOURCE_FIELD_NAMES = [
	"id",
	"updated_at",
	"updatedAt",
	"modified_at",
	"modify_time",
	"version",
	"file_version",
	"resource_version",
	"resourceVersion",
	"file_key",
	"file_size",
	"content_length",
	"size",
	"md5",
	"etag",
	"hash",
	"checksum",
]

const ProjectFileImagePreviewContext = createContext<ProjectFileImagePreviewManager | null>(null)

function normalizeFileExtension(fileExtension?: string | null): string {
	return fileExtension?.replace(/^\./, "").toLowerCase() || ""
}

function pickScalarField(item: AttachmentItem, fieldName: string): string {
	const value = item[fieldName]
	if (typeof value === "string") return value.trim()
	if (typeof value === "number") return String(value)
	return ""
}

function pickStringUrlField(item: AttachmentItem, fieldName: string): string {
	const value = item[fieldName]
	if (typeof value !== "string") return ""
	const trimmed = value.trim()
	return trimmed ? resolveSafePreviewUrl(trimmed) || "" : ""
}

function getAttachmentFileId(item: AttachmentItem): string {
	const fileId = item.file_id
	if (typeof fileId === "string") return fileId
	if (fileId == null) return ""
	return String(fileId)
}

function getFileNameExtension(fileName?: string): string {
	if (!fileName) return ""
	const normalizedName = fileName.split("?")[0]?.split("#")[0] || ""
	const dotIndex = normalizedName.lastIndexOf(".")
	if (dotIndex < 0 || dotIndex === normalizedName.length - 1) return ""
	return normalizedName.slice(dotIndex + 1)
}

function resolveProjectFileImageExtension(item: AttachmentItem): string {
	return (
		normalizeFileExtension(item.file_extension) ||
		normalizeFileExtension(getFileNameExtension(item.file_name)) ||
		normalizeFileExtension(getFileNameExtension(item.display_filename)) ||
		normalizeFileExtension(getFileNameExtension(item.filename)) ||
		normalizeFileExtension(getFileNameExtension(item.name))
	)
}

function resolveDirectThumbnailUrl(item: AttachmentItem): string {
	return pickStringUrlField(item, "thumbnail_url") || pickStringUrlField(item, "preview_url")
}

function getAttachmentDisplayNameFallback(item: AttachmentItem): string {
	return item.display_filename || item.file_name || item.filename || item.name || ""
}

export function resolveProjectFileImagePreviewSource(
	item: AttachmentItem,
): ProjectFileImagePreviewSource | null {
	if (item.is_directory) return null

	const extension = resolveProjectFileImageExtension(item)
	if (!extension || !imageExtSet.has(extension)) return null

	const fileId = getAttachmentFileId(item)
	const directThumbnailUrl = resolveDirectThumbnailUrl(item)
	if (!fileId && !directThumbnailUrl) return null

	const fileName = getAttachmentDisplayNameFallback(item)
	const cacheKey = [
		fileId,
		extension,
		fileName,
		...PREVIEW_CACHE_RESOURCE_FIELD_NAMES.map((fieldName) => pickScalarField(item, fieldName)),
		directThumbnailUrl,
		pickStringUrlField(item, "file_url"),
		pickStringUrlField(item, "url"),
	].join("|")

	return {
		item,
		fileId,
		cacheKey,
		fileName,
		directThumbnailUrl: directThumbnailUrl || undefined,
	}
}

function isPreviewUrlCacheItemValid(
	cachedItem?: PreviewUrlCacheItem,
): cachedItem is PreviewUrlCacheItem {
	if (!cachedItem?.url) return false
	const expiresAtTs = parseExpiresAt(cachedItem.expiresAt)
	return !isOssExpired(expiresAtTs)
}

function getCachedPreviewUrl(cacheKey: string): string | undefined {
	const cache = previewUrlCache
	const cachedItem = cache.get(cacheKey)
	if (isPreviewUrlCacheItemValid(cachedItem)) return cachedItem.url
	if (cachedItem) cache.delete(cacheKey)
	return undefined
}

function setCachedPreviewUrl(cacheKey: string, cachedItem: PreviewUrlCacheItem) {
	const cache = previewUrlCache
	if (cache.has(cacheKey)) cache.delete(cacheKey)
	cache.set(cacheKey, cachedItem)

	const limit = PREVIEW_CACHE_LIMIT
	while (cache.size > limit) {
		const oldestKey = cache.keys().next().value
		if (!oldestKey) break
		cache.delete(oldestKey)
	}
}

function deleteCachedPreviewUrl(cacheKey: string) {
	previewUrlCache.delete(cacheKey)
}

function pickTemporaryPreviewRow(
	fileId: string,
	rows: GetTemporaryDownloadUrlItem[],
): GetTemporaryDownloadUrlItem | undefined {
	return rows.find((row) => row.file_id === fileId)
}

function collectCurrentPreviewKeys(items: AttachmentItem[]): Set<string> {
	const keys = new Set<string>()

	const visit = (nodes: AttachmentItem[]) => {
		for (const node of nodes) {
			const source = resolveProjectFileImagePreviewSource(node)
			if (source) keys.add(source.cacheKey)
			if (node.children?.length) visit(node.children)
		}
	}

	visit(items)
	return keys
}

function compactPreviewStates(
	states: Record<string, PreviewState>,
	currentKeys: ReadonlySet<string>,
) {
	let changed = false
	const next: Record<string, PreviewState> = {}

	for (const [key, value] of Object.entries(states)) {
		if (!currentKeys.has(key)) {
			changed = true
			continue
		}
		next[key] = value
	}

	return changed ? next : states
}

function shouldRequestPreview(
	source: ProjectFileImagePreviewSource,
	states: Record<string, PreviewState>,
	pendingKeys: ReadonlySet<string>,
) {
	if (!source.fileId) return false
	if (source.directThumbnailUrl) return false
	if (getCachedPreviewUrl(source.cacheKey)) return false
	if (pendingKeys.has(source.cacheKey)) return false

	const state = states[source.cacheKey]
	return !state || state.status === "idle"
}

function resolveTooltipImageSize(naturalWidth: number, naturalHeight: number) {
	if (naturalWidth <= 0 || naturalHeight <= 0) {
		return {
			width: TOOLTIP_IMAGE_MIN_LONG_EDGE,
			height: TOOLTIP_IMAGE_MIN_LONG_EDGE,
		}
	}

	const maxScale = Math.min(
		TOOLTIP_IMAGE_MAX_WIDTH / naturalWidth,
		TOOLTIP_IMAGE_MAX_HEIGHT / naturalHeight,
	)
	const minScale = TOOLTIP_IMAGE_MIN_LONG_EDGE / Math.max(naturalWidth, naturalHeight)
	const scale = Math.min(maxScale, Math.max(minScale, 1))

	return {
		width: Math.round(naturalWidth * scale),
		height: Math.round(naturalHeight * scale),
	}
}

export function useProjectFileImagePreviewManager({
	attachments,
}: {
	attachments: AttachmentItem[]
}): ProjectFileImagePreviewManager {
	const mountedSourcesRef = useRef<ProjectFileImagePreviewSource[]>([])
	const mountedSourcesFingerprintRef = useRef("")
	const pendingKeysRef = useRef<Set<string>>(new Set())
	const thumbnailQueueRef = useRef<Map<string, ProjectFileImagePreviewSource>>(new Map())
	const thumbnailFlushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
	const [mountedSourcesVersion, setMountedSourcesVersion] = useState(0)
	const [previewStates, setPreviewStates] = useState<Record<string, PreviewState>>({})

	const currentPreviewKeys = useMemo(() => collectCurrentPreviewKeys(attachments), [attachments])

	const requestPreviewSources = useCallback((sources: ProjectFileImagePreviewSource[]) => {
		const requestSources = sources.filter((source) => source.fileId)
		if (requestSources.length === 0) return

		const pendingKeys = pendingKeysRef.current
		const nextPendingSources = requestSources.filter((source) => {
			if (pendingKeys.has(source.cacheKey)) return false
			if (getCachedPreviewUrl(source.cacheKey)) return false
			pendingKeys.add(source.cacheKey)
			return true
		})
		if (nextPendingSources.length === 0) return

		setPreviewStates((prev) => {
			let changed = false
			const next = { ...prev }
			for (const source of nextPendingSources) {
				const current = next[source.cacheKey]
				if (current?.status === "loaded" || current?.status === "loading") continue
				next[source.cacheKey] = { status: "loading" }
				changed = true
			}
			return changed ? next : prev
		})

		const fileIds = Array.from(new Set(nextPendingSources.map((source) => source.fileId)))
		void getTemporaryDownloadUrl({
			file_ids: fileIds,
			options: {
				xMagicImageProcess: PROJECT_FILE_IMAGE_PREVIEW_PROCESS,
			},
			enableErrorMessagePrompt: false,
		})
			.then((rows) => {
				setPreviewStates((prev) => {
					const next = { ...prev }
					for (const source of nextPendingSources) {
						const previewRow = pickTemporaryPreviewRow(source.fileId, rows ?? [])
						const previewUrl = previewRow?.url?.trim()
						const safePreviewUrl = previewUrl
							? resolveSafePreviewUrl(previewUrl) || ""
							: ""

						if (safePreviewUrl) {
							setCachedPreviewUrl(source.cacheKey, {
								url: safePreviewUrl,
								expiresAt: previewRow?.expires_at,
							})
							next[source.cacheKey] = { status: "loaded", url: safePreviewUrl }
						} else {
							next[source.cacheKey] = { status: "error" }
						}
					}
					return next
				})
			})
			.catch(() => {
				setPreviewStates((prev) => {
					const next = { ...prev }
					for (const source of nextPendingSources) {
						next[source.cacheKey] = { status: "error" }
					}
					return next
				})
			})
			.finally(() => {
				for (const source of nextPendingSources) {
					pendingKeys.delete(source.cacheKey)
				}
			})
	}, [])

	const flushThumbnailQueue = useCallback(() => {
		thumbnailFlushTimerRef.current = null

		const queuedSources = Array.from(thumbnailQueueRef.current.values()).slice(
			0,
			THUMBNAIL_BATCH_SIZE,
		)
		for (const source of queuedSources) {
			thumbnailQueueRef.current.delete(source.cacheKey)
		}

		if (queuedSources.length > 0) {
			requestPreviewSources(queuedSources)
		}

		if (thumbnailQueueRef.current.size > 0) {
			thumbnailFlushTimerRef.current = setTimeout(
				flushThumbnailQueue,
				THUMBNAIL_BATCH_DELAY_MS,
			)
		}
	}, [requestPreviewSources])

	const scheduleThumbnailFlush = useCallback(() => {
		if (thumbnailFlushTimerRef.current) return
		thumbnailFlushTimerRef.current = setTimeout(flushThumbnailQueue, THUMBNAIL_BATCH_DELAY_MS)
	}, [flushThumbnailQueue])

	const enqueueThumbnailSources = useCallback(
		(sources: ProjectFileImagePreviewSource[]) => {
			let queued = false
			for (const source of sources) {
				if (source.directThumbnailUrl || !source.fileId) continue
				if (thumbnailQueueRef.current.has(source.cacheKey)) continue
				thumbnailQueueRef.current.set(source.cacheKey, source)
				queued = true
			}
			if (queued) scheduleThumbnailFlush()
		},
		[scheduleThumbnailFlush],
	)

	const setMountedItems = useCallback((items: AttachmentItem[]) => {
		const sourcesByKey = new Map<string, ProjectFileImagePreviewSource>()
		for (const item of items) {
			const source = resolveProjectFileImagePreviewSource(item)
			if (source) sourcesByKey.set(source.cacheKey, source)
		}

		const sources = Array.from(sourcesByKey.values())
		const fingerprint = sources.map((source) => source.cacheKey).join("\n")
		if (mountedSourcesFingerprintRef.current === fingerprint) return

		mountedSourcesRef.current = sources
		mountedSourcesFingerprintRef.current = fingerprint
		setMountedSourcesVersion((version) => version + 1)
	}, [])

	useEffect(() => {
		const requestableThumbnailSources = mountedSourcesRef.current.filter((source) =>
			shouldRequestPreview(source, previewStates, pendingKeysRef.current),
		)

		if (requestableThumbnailSources.length > 0) {
			enqueueThumbnailSources(requestableThumbnailSources)
		}
	}, [enqueueThumbnailSources, mountedSourcesVersion, previewStates])

	useEffect(() => {
		setPreviewStates((prev) => compactPreviewStates(prev, currentPreviewKeys))
	}, [currentPreviewKeys])

	useEffect(() => {
		return () => {
			if (thumbnailFlushTimerRef.current) clearTimeout(thumbnailFlushTimerRef.current)
		}
	}, [])

	const getPreviewState = useCallback(
		(source: ProjectFileImagePreviewSource): PreviewState => {
			if (source.directThumbnailUrl) {
				return { status: "loaded", url: source.directThumbnailUrl }
			}

			const cachedPreviewUrl = getCachedPreviewUrl(source.cacheKey)
			if (cachedPreviewUrl) return { status: "loaded", url: cachedPreviewUrl }

			return previewStates[source.cacheKey] || EMPTY_PREVIEW_STATE
		},
		[previewStates],
	)

	const markPreviewImageError = useCallback((source: ProjectFileImagePreviewSource) => {
		deleteCachedPreviewUrl(source.cacheKey)
		setPreviewStates((prev) => ({
			...prev,
			[source.cacheKey]: { status: "error" },
		}))
	}, [])

	const ensurePreview = useCallback(
		(source: ProjectFileImagePreviewSource) => {
			if (shouldRequestPreview(source, previewStates, pendingKeysRef.current)) {
				requestPreviewSources([source])
			}
		},
		[previewStates, requestPreviewSources],
	)

	return useMemo(
		() => ({
			ensurePreview,
			getPreviewState,
			markPreviewImageError,
			setMountedItems,
		}),
		[ensurePreview, getPreviewState, markPreviewImageError, setMountedItems],
	)
}

export function ProjectFileImagePreviewProvider({
	children,
	manager,
}: {
	children: ReactNode
	manager: ProjectFileImagePreviewManager
}) {
	return (
		<ProjectFileImagePreviewContext.Provider value={manager}>
			{children}
		</ProjectFileImagePreviewContext.Provider>
	)
}

export function useProjectFileImagePreviewContext() {
	return useContext(ProjectFileImagePreviewContext)
}

export function ProjectFileImagePreviewTooltipContent({
	source,
}: {
	source: ProjectFileImagePreviewSource
}) {
	const manager = useProjectFileImagePreviewContext()
	const [previewImageSize, setPreviewImageSize] = useState<{
		width: number
		height: number
	} | null>(null)

	useEffect(() => {
		setPreviewImageSize(null)
	}, [source.cacheKey])

	if (!manager) return null

	const previewState = manager.getPreviewState(source)
	if (previewState.status === "error") return null

	return (
		<div
			className="inline-flex max-w-none flex-col whitespace-nowrap pb-1.5"
			data-testid="project-file-image-preview-tooltip"
		>
			<div
				className="mb-2 max-w-none whitespace-nowrap leading-5"
				data-testid="project-file-image-preview-tooltip-title"
			>
				{source.fileName}
			</div>
			{previewState.url ? (
				<img
					src={previewState.url}
					alt=""
					className="block self-center rounded-sm object-contain"
					style={{
						...(previewImageSize
							? {
									width: previewImageSize.width,
									height: previewImageSize.height,
								}
							: {
									maxWidth: TOOLTIP_IMAGE_MAX_WIDTH,
									maxHeight: TOOLTIP_IMAGE_MAX_HEIGHT,
									minWidth: TOOLTIP_IMAGE_MIN_LONG_EDGE,
								}),
					}}
					loading="lazy"
					decoding="async"
					referrerPolicy="no-referrer"
					onLoad={(event) => {
						setPreviewImageSize(
							resolveTooltipImageSize(
								event.currentTarget.naturalWidth,
								event.currentTarget.naturalHeight,
							),
						)
					}}
					onError={() => manager.markPreviewImageError(source)}
					data-testid="project-file-image-preview-tooltip-image"
				/>
			) : (
				<div
					className="animate-pulse self-center rounded-sm bg-background/20 motion-reduce:animate-none"
					style={{
						width: TOOLTIP_IMAGE_MIN_LONG_EDGE,
						height: TOOLTIP_IMAGE_MIN_LONG_EDGE,
					}}
					data-testid="project-file-image-preview-tooltip-loading"
				/>
			)}
		</div>
	)
}
