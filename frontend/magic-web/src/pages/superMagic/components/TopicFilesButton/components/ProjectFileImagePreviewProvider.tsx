import {
	createContext,
	useCallback,
	useContext,
	useEffect,
	useMemo,
	useRef,
	useState,
	useSyncExternalStore,
	type ReactNode,
} from "react"
import { IMAGE_EXTENSIONS } from "@/constants/file"
import { resolveSafePreviewUrl } from "@/pages/superMagic/components/Detail/components/FilesViewer/components/previewUrl"
import { getPreviewFileUrlWatermarkSignature } from "@/utils/aiWatermarkPreviewFileUrlMode"
import { getAiWatermarkPreferenceUserKey } from "@/utils/aiWatermarkPreferenceCache"
import type { AttachmentItem } from "../hooks/types"
import {
	cancelProjectFileImagePreviewRequest,
	deleteProjectFileImagePreviewCacheItem,
	getProjectFileImagePreviewCacheItem,
	getProjectFileImagePreviewMemoryCacheItem,
	PROJECT_FILE_IMAGE_PREVIEW_RENDITION_KEY,
	requestProjectFileImagePreview,
	requestProjectFileImagePreviewBatch,
} from "./projectFileImagePreviewCoordinator"

type PreviewStatus = "idle" | "loading" | "loaded" | "error" | "unavailable"

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

interface ProjectFileImagePreviewManager {
	ensurePreview: (source: ProjectFileImagePreviewSource) => void
	getPreviewState: (source: ProjectFileImagePreviewSource) => PreviewState
	getPreviewSnapshot: (source: ProjectFileImagePreviewSource) => string
	markPreviewImageError: (source: ProjectFileImagePreviewSource) => void
	subscribePreview: (cacheKey: string, listener: () => void) => () => void
	setMountedItems: (items: AttachmentItem[]) => void
	setPreviewVisible: (source: ProjectFileImagePreviewSource, visible: boolean) => void
}

const imageExtSet = new Set(IMAGE_EXTENSIONS.map((ext) => normalizeFileExtension(ext)))
const THUMBNAIL_BATCH_DELAY_MS = 32
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
	"topic_id",
	"project_id",
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
		PROJECT_FILE_IMAGE_PREVIEW_RENDITION_KEY,
		getPreviewFileUrlWatermarkSignature(),
		getAiWatermarkPreferenceUserKey(),
	].join("|")

	return {
		item,
		fileId,
		cacheKey,
		fileName,
		directThumbnailUrl: directThumbnailUrl || undefined,
	}
}

function getMemoryCachedPreviewUrl(cacheKey: string): string | undefined {
	return getProjectFileImagePreviewMemoryCacheItem(cacheKey)?.url
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

function shouldRequestPreview(
	source: ProjectFileImagePreviewSource,
	states: ReadonlyMap<string, PreviewState>,
	pendingKeys: ReadonlySet<string>,
) {
	if (!source.fileId) return false
	if (source.directThumbnailUrl) return false
	if (getMemoryCachedPreviewUrl(source.cacheKey)) return false
	if (pendingKeys.has(source.cacheKey)) return false

	const state = states.get(source.cacheKey)
	return !state || state.status === "idle" || state.status === "error"
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
	const mountedSourceKeysRef = useRef<Set<string>>(new Set())
	const visibleSourcesRef = useRef<
		Map<string, { source: ProjectFileImagePreviewSource; count: number }>
	>(new Map())
	const mountedSourcesFingerprintRef = useRef("")
	const pendingKeysRef = useRef<Set<string>>(new Set())
	const thumbnailQueueRef = useRef<Map<string, ProjectFileImagePreviewSource>>(new Map())
	const thumbnailFlushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
	const previewStatesRef = useRef<Map<string, PreviewState>>(new Map())
	const previewListenersRef = useRef<Map<string, Set<() => void>>>(new Map())
	const disposedRef = useRef(false)

	const currentPreviewKeys = useMemo(() => collectCurrentPreviewKeys(attachments), [attachments])
	const isSourceAdmitted = useCallback((cacheKey: string) => {
		return mountedSourceKeysRef.current.has(cacheKey) || visibleSourcesRef.current.has(cacheKey)
	}, [])
	const releasePendingPreviewRequest = useCallback((cacheKey: string) => {
		if (!pendingKeysRef.current.delete(cacheKey)) return
		cancelProjectFileImagePreviewRequest(cacheKey)
	}, [])
	const notifyPreviewKeys = useCallback((cacheKeys: Iterable<string>) => {
		for (const cacheKey of cacheKeys) {
			for (const listener of previewListenersRef.current.get(cacheKey) || []) {
				listener()
			}
		}
	}, [])
	const applyPreviewStateChanges = useCallback(
		(changes: Array<[cacheKey: string, state: PreviewState | undefined]>) => {
			const changedKeys: string[] = []
			for (const [cacheKey, nextState] of changes) {
				const currentState = previewStatesRef.current.get(cacheKey)
				if (
					currentState?.status === nextState?.status &&
					currentState?.url === nextState?.url
				) {
					continue
				}

				if (nextState) previewStatesRef.current.set(cacheKey, nextState)
				else previewStatesRef.current.delete(cacheKey)
				changedKeys.push(cacheKey)
			}

			notifyPreviewKeys(changedKeys)
		},
		[notifyPreviewKeys],
	)
	const hydrateCachedPreview = useCallback(
		(source: ProjectFileImagePreviewSource) => {
			if (!getProjectFileImagePreviewCacheItem(source.cacheKey)) return false

			notifyPreviewKeys([source.cacheKey])
			return true
		},
		[notifyPreviewKeys],
	)
	const getPreviewState = useCallback((source: ProjectFileImagePreviewSource): PreviewState => {
		if (source.directThumbnailUrl) {
			return { status: "loaded", url: source.directThumbnailUrl }
		}

		const cachedPreviewUrl = getMemoryCachedPreviewUrl(source.cacheKey)
		if (cachedPreviewUrl) return { status: "loaded", url: cachedPreviewUrl }

		return previewStatesRef.current.get(source.cacheKey) || EMPTY_PREVIEW_STATE
	}, [])
	const getPreviewSnapshot = useCallback(
		(source: ProjectFileImagePreviewSource) => {
			const state = getPreviewState(source)
			return `${state.status}\0${state.url || ""}`
		},
		[getPreviewState],
	)
	const subscribePreview = useCallback((cacheKey: string, listener: () => void) => {
		let listeners = previewListenersRef.current.get(cacheKey)
		if (!listeners) {
			listeners = new Set()
			previewListenersRef.current.set(cacheKey, listeners)
		}
		listeners.add(listener)

		return () => {
			listeners?.delete(listener)
			if (listeners?.size === 0) previewListenersRef.current.delete(cacheKey)
		}
	}, [])

	const requestPreviewSources = useCallback(
		(sources: ProjectFileImagePreviewSource[], options?: { prebatched?: boolean }) => {
			const requestSources = sources.filter((source) => source.fileId)
			if (requestSources.length === 0) return

			const pendingKeys = pendingKeysRef.current
			const nextPendingSources = requestSources.filter((source) => {
				if (pendingKeys.has(source.cacheKey)) return false
				if (getMemoryCachedPreviewUrl(source.cacheKey)) return false
				pendingKeys.add(source.cacheKey)
				return true
			})
			if (nextPendingSources.length === 0) return

			applyPreviewStateChanges(
				nextPendingSources.map((source) => [source.cacheKey, { status: "loading" }]),
			)

			const request = options?.prebatched
				? requestProjectFileImagePreviewBatch(nextPendingSources)
				: Promise.all(
						nextPendingSources.map((source) => requestProjectFileImagePreview(source)),
					)

			void request
				.then((results) => {
					if (disposedRef.current) return
					applyPreviewStateChanges(
						nextPendingSources.map<[string, PreviewState | undefined]>(
							(source, index) => {
								const result = results[index]
								if (
									!result ||
									result.status === "cancelled" ||
									!isSourceAdmitted(source.cacheKey)
								) {
									return [source.cacheKey, undefined]
								}

								if (result.status === "unavailable") {
									return [source.cacheKey, { status: "unavailable" }]
								}
								if (result.status === "failed") {
									return [source.cacheKey, { status: "error" }]
								}
								return [source.cacheKey, undefined]
							},
						),
					)
				})
				.catch(() => {
					if (disposedRef.current) return
					applyPreviewStateChanges(
						nextPendingSources.map<[string, PreviewState | undefined]>((source) => [
							source.cacheKey,
							isSourceAdmitted(source.cacheKey) ? { status: "error" } : undefined,
						]),
					)
				})
				.finally(() => {
					for (const source of nextPendingSources) {
						pendingKeys.delete(source.cacheKey)
					}
				})
		},
		[applyPreviewStateChanges, isSourceAdmitted],
	)

	const flushThumbnailQueue = useCallback(() => {
		thumbnailFlushTimerRef.current = null

		const queuedSources: ProjectFileImagePreviewSource[] = []
		for (const [cacheKey, source] of thumbnailQueueRef.current) {
			thumbnailQueueRef.current.delete(cacheKey)
			if (isSourceAdmitted(cacheKey)) queuedSources.push(source)
			if (queuedSources.length >= THUMBNAIL_BATCH_SIZE) break
		}

		if (queuedSources.length > 0) {
			requestPreviewSources(queuedSources, { prebatched: true })
		}

		if (thumbnailQueueRef.current.size > 0) {
			thumbnailFlushTimerRef.current = setTimeout(
				flushThumbnailQueue,
				THUMBNAIL_BATCH_DELAY_MS,
			)
		}
	}, [isSourceAdmitted, requestPreviewSources])

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

	const setMountedItems = useCallback(
		(items: AttachmentItem[]) => {
			const sourcesByKey = new Map<string, ProjectFileImagePreviewSource>()
			for (const item of items) {
				const source = resolveProjectFileImagePreviewSource(item)
				if (source) sourcesByKey.set(source.cacheKey, source)
			}

			const sources = Array.from(sourcesByKey.values())
			const fingerprint = sources.map((source) => source.cacheKey).join("\n")
			if (mountedSourcesFingerprintRef.current === fingerprint) return

			const previousMountedKeys = mountedSourceKeysRef.current
			mountedSourcesRef.current = sources
			mountedSourceKeysRef.current = new Set(sourcesByKey.keys())
			mountedSourcesFingerprintRef.current = fingerprint
			for (const cacheKey of thumbnailQueueRef.current.keys()) {
				if (
					!mountedSourceKeysRef.current.has(cacheKey) &&
					!visibleSourcesRef.current.has(cacheKey)
				) {
					thumbnailQueueRef.current.delete(cacheKey)
					releasePendingPreviewRequest(cacheKey)
				}
			}
			for (const cacheKey of previousMountedKeys) {
				if (
					!mountedSourceKeysRef.current.has(cacheKey) &&
					!visibleSourcesRef.current.has(cacheKey) &&
					pendingKeysRef.current.has(cacheKey)
				) {
					releasePendingPreviewRequest(cacheKey)
				}
			}

			const requestableSources = sources.filter((source) => {
				if (hydrateCachedPreview(source)) return false
				return shouldRequestPreview(
					source,
					previewStatesRef.current,
					pendingKeysRef.current,
				)
			})
			if (requestableSources.length > 0) enqueueThumbnailSources(requestableSources)
		},
		[enqueueThumbnailSources, hydrateCachedPreview, releasePendingPreviewRequest],
	)

	const setPreviewVisible = useCallback(
		(source: ProjectFileImagePreviewSource, visible: boolean) => {
			const current = visibleSourcesRef.current.get(source.cacheKey)

			if (visible) {
				if (current) {
					current.count += 1
					current.source = source
					return
				}

				visibleSourcesRef.current.set(source.cacheKey, { source, count: 1 })
				if (hydrateCachedPreview(source)) return
				if (
					shouldRequestPreview(source, previewStatesRef.current, pendingKeysRef.current)
				) {
					enqueueThumbnailSources([source])
				}
				return
			}

			if (!current) return
			if (current.count > 1) {
				current.count -= 1
				return
			}

			visibleSourcesRef.current.delete(source.cacheKey)
			if (!mountedSourceKeysRef.current.has(source.cacheKey)) {
				thumbnailQueueRef.current.delete(source.cacheKey)
				releasePendingPreviewRequest(source.cacheKey)
			}
		},
		[enqueueThumbnailSources, hydrateCachedPreview, releasePendingPreviewRequest],
	)

	useEffect(() => {
		const staleStateChanges: Array<[string, undefined]> = []
		for (const cacheKey of previewStatesRef.current.keys()) {
			if (!currentPreviewKeys.has(cacheKey)) staleStateChanges.push([cacheKey, undefined])
		}
		if (staleStateChanges.length > 0) applyPreviewStateChanges(staleStateChanges)
	}, [applyPreviewStateChanges, currentPreviewKeys])

	useEffect(() => {
		disposedRef.current = false
		return () => {
			disposedRef.current = true
			if (thumbnailFlushTimerRef.current) clearTimeout(thumbnailFlushTimerRef.current)
			for (const cacheKey of Array.from(pendingKeysRef.current)) {
				releasePendingPreviewRequest(cacheKey)
			}
			previewListenersRef.current.clear()
		}
	}, [releasePendingPreviewRequest])

	const markPreviewImageError = useCallback(
		(source: ProjectFileImagePreviewSource) => {
			if (source.directThumbnailUrl || getMemoryCachedPreviewUrl(source.cacheKey)) return

			deleteProjectFileImagePreviewCacheItem(source.cacheKey)
			applyPreviewStateChanges([[source.cacheKey, undefined]])
			if (isSourceAdmitted(source.cacheKey)) requestPreviewSources([source])
		},
		[applyPreviewStateChanges, isSourceAdmitted, requestPreviewSources],
	)

	const ensurePreview = useCallback(
		(source: ProjectFileImagePreviewSource) => {
			if (hydrateCachedPreview(source)) return
			if (shouldRequestPreview(source, previewStatesRef.current, pendingKeysRef.current)) {
				requestPreviewSources([source])
			}
		},
		[hydrateCachedPreview, requestPreviewSources],
	)

	return useMemo(
		() => ({
			ensurePreview,
			getPreviewState,
			getPreviewSnapshot,
			markPreviewImageError,
			subscribePreview,
			setMountedItems,
			setPreviewVisible,
		}),
		[
			ensurePreview,
			getPreviewSnapshot,
			getPreviewState,
			markPreviewImageError,
			setMountedItems,
			setPreviewVisible,
			subscribePreview,
		],
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

export function useProjectFileImagePreviewState(
	source: ProjectFileImagePreviewSource | null,
): PreviewState | null {
	const manager = useProjectFileImagePreviewContext()
	const sourceRef = useRef(source)
	sourceRef.current = source

	const subscribe = useCallback(
		(listener: () => void) => {
			const currentSource = sourceRef.current
			if (!manager || !currentSource) return () => undefined
			return manager.subscribePreview(currentSource.cacheKey, listener)
		},
		[manager?.subscribePreview, source?.cacheKey],
	)
	const getSnapshot = useCallback(() => {
		const currentSource = sourceRef.current
		if (!currentSource) return "unavailable\0"
		if (manager) return manager.getPreviewSnapshot(currentSource)
		return currentSource.directThumbnailUrl
			? `loaded\0${currentSource.directThumbnailUrl}`
			: "idle\0"
	}, [manager?.getPreviewSnapshot, source?.cacheKey, source?.directThumbnailUrl])

	useSyncExternalStore(subscribe, getSnapshot, getSnapshot)

	if (!source) return null
	if (manager) return manager.getPreviewState(source)
	if (source.directThumbnailUrl) {
		return { status: "loaded", url: source.directThumbnailUrl }
	}
	return EMPTY_PREVIEW_STATE
}

export function ProjectFileImagePreviewTooltipContent({
	source,
	onPreviewUnavailable,
}: {
	source: ProjectFileImagePreviewSource
	onPreviewUnavailable?: () => void
}) {
	const manager = useProjectFileImagePreviewContext()
	const previewState = useProjectFileImagePreviewState(source)
	const [previewImageSize, setPreviewImageSize] = useState<{
		width: number
		height: number
	} | null>(null)
	const [imageFailed, setImageFailed] = useState(false)

	useEffect(() => {
		setPreviewImageSize(null)
		setImageFailed(false)
	}, [previewState?.url, source.cacheKey])

	if (!manager || !previewState) return null
	if (previewState.status === "error" || previewState.status === "unavailable" || imageFailed) {
		return null
	}

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
					key={previewState.url}
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
					onError={() => {
						setImageFailed(true)
						onPreviewUnavailable?.()
						manager.markPreviewImageError(source)
					}}
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
