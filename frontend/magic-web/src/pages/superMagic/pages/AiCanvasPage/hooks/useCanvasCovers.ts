import { useEffect, useState } from "react"
import type { AttachmentItem } from "@/pages/superMagic/components/TopicFilesButton/hooks/types"
import type { ProjectListItem } from "@/pages/superMagic/pages/Workspace/types"
import { loadProjectAttachments } from "@/pages/superMagic/services/projectAttachmentsLoader"
import {
	getFileMediaMetadata,
	type FileMediaMetadata,
} from "@/pages/superMagic/services/useFileMediaSource"

const IMAGE_EXTENSIONS = new Set(["png", "jpg", "jpeg", "webp", "gif"])
/** Covers load per project; a small pool keeps the home from flooding the attachments API. */
const MAX_CONCURRENT_LOADS = 3

/** Newest-first cover images: at most four fill a 2x2 grid. */
export const MAX_COVER_IMAGES = 4

/** null = project has no image yet; undefined = not resolved yet. */
export type CanvasCoverMap = Record<string, FileMediaMetadata[] | null | undefined>

// Keyed by project id + updated_at so an edited project resolves its newest image again,
// while returning to the home reuses covers that cannot have changed.
const coverCache = new Map<string, FileMediaMetadata[] | null>()

function getCoverCacheKey(project: ProjectListItem) {
	return `${project.id}:${project.updated_at ?? ""}`
}

function getTime(item: AttachmentItem) {
	const time = Date.parse(String(item.updated_at || item.created_at || ""))
	return Number.isNaN(time) ? 0 : time
}

/**
 * Picks up to four newest visible images of a canvas project for its cover. Hidden files and
 * files under dot-folders (for example `.tmp`) are runtime artifacts, not artwork.
 */
export function pickCanvasCovers(
	list: AttachmentItem[],
	projectId: string,
): FileMediaMetadata[] | null {
	const images = list.filter((item) => {
		if (item.is_directory || item.is_hidden) return false
		const extension = String(item.file_extension || item.file_name?.split(".").pop() || "")
			.replace(/^\./, "")
			.toLowerCase()
		if (!IMAGE_EXTENSIONS.has(extension)) return false
		return !String(item.relative_file_path || "")
			.split("/")
			.some((segment) => segment.startsWith("."))
	})
	if (images.length === 0) return null
	return [...images]
		.sort((left, right) => getTime(right) - getTime(left))
		.slice(0, MAX_COVER_IMAGES)
		.map((item) => getFileMediaMetadata(item, projectId))
		.filter((file): file is FileMediaMetadata => Boolean(file))
}

/**
 * Resolves cover images for the given AI canvas projects.
 *
 * Projects are read with the shared attachments loader (same API and fallback as the file
 * panel), at most three at a time. Leaving the page aborts pending reads; a failed read leaves
 * the cover unresolved so the card keeps its placeholder instead of showing an error.
 */
export function useCanvasCovers(projects: ProjectListItem[]): CanvasCoverMap {
	const [covers, setCovers] = useState<CanvasCoverMap>(() =>
		Object.fromEntries(
			projects.map((project) => [project.id, coverCache.get(getCoverCacheKey(project))]),
		),
	)
	const projectKey = projects.map(getCoverCacheKey).join(",")

	useEffect(() => {
		const controller = new AbortController()
		const pending = projects.filter((project) => !coverCache.has(getCoverCacheKey(project)))
		setCovers((current) => {
			const next: CanvasCoverMap = {}
			for (const project of projects) {
				const cached = coverCache.get(getCoverCacheKey(project))
				next[project.id] = cached !== undefined ? cached : current[project.id]
			}
			return next
		})

		let index = 0
		const worker = async () => {
			while (index < pending.length && !controller.signal.aborted) {
				const project = pending[index]
				index += 1
				try {
					const result = await loadProjectAttachments({
						projectId: project.id,
						signal: controller.signal,
						enableErrorMessagePrompt: false,
					})
					if (controller.signal.aborted) return
					const cover = pickCanvasCovers(result.list, project.id)
					coverCache.set(getCoverCacheKey(project), cover)
					setCovers((current) => ({ ...current, [project.id]: cover }))
				} catch {
					// Keep the placeholder; the next visit retries because nothing was cached.
				}
			}
		}
		void Promise.all(Array.from({ length: MAX_CONCURRENT_LOADS }, worker))
		return () => controller.abort()
		// projectKey captures every input that changes which covers are needed.
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [projectKey])

	return covers
}
