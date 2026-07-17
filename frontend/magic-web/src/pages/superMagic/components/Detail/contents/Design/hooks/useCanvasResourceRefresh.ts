import { useEffect, useRef, type RefObject } from "react"
import type {
	CanvasDesignRef,
	CanvasResourceRefreshItem,
} from "@/components/CanvasDesign/public/props"
import {
	ElementTypeEnum,
	type CanvasDocument,
	type ImageElement,
	type LayerElement,
	type VideoElement,
} from "@/components/CanvasDesign/runtime/document/types"
import type { FileItem } from "@/pages/superMagic/components/Detail/components/FilesViewer/types"
import pubsub, { PubSubEvents } from "@/utils/pubsub"
import type { SuperMagicFileChangeMessage } from "@/types/chat/intermediate_message"
import type { SeqResponse } from "@/types/request"
import { resolveDesignAttachment, toWorkspaceRelativeCandidates } from "../utils/designPath"
import {
	findAttachmentByNormalizedWorkspacePath,
	normalizeCanvasAttachmentLookupPath,
	type DesignAttachmentIndex,
} from "../utils/designAttachmentIndex"
import { registerWaitForNextAttachmentsRefreshForProject } from "@/pages/superMagic/services/attachmentsTopicSync"

interface UseCanvasResourceRefreshOptions {
	canvasDesignRef: RefObject<CanvasDesignRef | null>
	canvas?: CanvasDocument
	flatAttachments?: FileItem[]
	attachmentIndex?: DesignAttachmentIndex | null
	designProjectBasePath?: string
	projectId?: string
	isNewestVersion: boolean
	isPlaybackMode: boolean
}

export function useCanvasResourceRefresh(options: UseCanvasResourceRefreshOptions): void {
	const {
		canvasDesignRef,
		canvas,
		flatAttachments,
		attachmentIndex,
		designProjectBasePath,
		projectId,
		isNewestVersion,
		isPlaybackMode,
	} = options
	const resourceSnapshotRef = useRef<CanvasResourceSnapshotState | null>(null)

	useEffect(() => {
		const nextSnapshot = buildCanvasResourceSnapshot({
			canvas,
			flatAttachments,
			attachmentIndex,
			designProjectBasePath,
		})
		const previousSnapshot = resourceSnapshotRef.current

		if (!isNewestVersion || isPlaybackMode) {
			if (!previousSnapshot) resourceSnapshotRef.current = nextSnapshot
			return
		}

		resourceSnapshotRef.current = nextSnapshot
		if (!previousSnapshot) return

		const changedResources = getChangedCanvasResources(previousSnapshot, nextSnapshot)
		if (changedResources.length === 0) return

		void canvasDesignRef.current?.refreshResources(changedResources)
	}, [
		canvas,
		canvasDesignRef,
		designProjectBasePath,
		flatAttachments,
		attachmentIndex,
		isNewestVersion,
		isPlaybackMode,
	])

	useEffect(() => {
		if (!projectId) return

		const handleFileChangeIntermediate = (seq: SeqResponse<SuperMagicFileChangeMessage>) => {
			const messageData = seq?.message
			if (!messageData || messageData.project_id !== projectId) return
			if (!Array.isArray(messageData.changes) || messageData.changes.length === 0) return
			if (!isNewestVersion || isPlaybackMode) return

			const snapshot = resourceSnapshotRef.current
			if (!snapshot?.items.size) return

			const changedResources = getChangedCanvasResourcesFromFileChanges(
				messageData.changes,
				snapshot,
			)
			if (changedResources.length === 0) return

			void canvasDesignRef.current?.refreshResources(changedResources)
			void registerWaitForNextAttachmentsRefreshForProject(projectId, { timeoutMs: 15_000 })
				.catch(() => undefined)
				.then(() => {
					void canvasDesignRef.current?.refreshResources(changedResources)
				})
		}

		pubsub.subscribe(
			PubSubEvents.Super_Magic_File_Change_Intermediate,
			handleFileChangeIntermediate,
		)

		return () => {
			pubsub.unsubscribe(
				PubSubEvents.Super_Magic_File_Change_Intermediate,
				handleFileChangeIntermediate,
			)
		}
	}, [canvasDesignRef, isNewestVersion, isPlaybackMode, projectId])
}

function buildCanvasResourceSnapshot(params: {
	canvas?: CanvasDocument
	flatAttachments?: FileItem[]
	attachmentIndex?: DesignAttachmentIndex | null
	designProjectBasePath?: string
}): CanvasResourceSnapshotState {
	const { canvas, flatAttachments, attachmentIndex, designProjectBasePath } = params
	const items = new Map<string, CanvasResourceSnapshot>()

	collectCanvasResourceSnapshots({
		elements: canvas?.elements,
		flatAttachments,
		attachmentIndex,
		designProjectBasePath,
		snapshot: items,
	})

	return {
		items,
		resourcesByResolvedPath: buildResourcesByResolvedPathIndex(items),
	}
}

function collectCanvasResourceSnapshots(params: {
	elements?: LayerElement[]
	flatAttachments?: FileItem[]
	attachmentIndex?: DesignAttachmentIndex | null
	designProjectBasePath?: string
	snapshot: Map<string, CanvasResourceSnapshot>
}): void {
	const { elements, flatAttachments, attachmentIndex, designProjectBasePath, snapshot } = params
	if (!elements?.length) return

	for (const element of elements) {
		if (element.type === ElementTypeEnum.Image) {
			addCanvasResourceSnapshot({
				src: (element as ImageElement).src,
				mediaType: "image",
				flatAttachments,
				attachmentIndex,
				designProjectBasePath,
				snapshot,
			})
		}

		if (element.type === ElementTypeEnum.Video) {
			addCanvasResourceSnapshot({
				src: (element as VideoElement).src,
				mediaType: "video",
				flatAttachments,
				attachmentIndex,
				designProjectBasePath,
				snapshot,
			})
		}

		if ("children" in element) {
			collectCanvasResourceSnapshots({
				elements: element.children,
				flatAttachments,
				attachmentIndex,
				designProjectBasePath,
				snapshot,
			})
		}
	}
}

function addCanvasResourceSnapshot(params: {
	src?: string
	mediaType: CanvasResourceRefreshItem["mediaType"]
	flatAttachments?: FileItem[]
	attachmentIndex?: DesignAttachmentIndex | null
	designProjectBasePath?: string
	snapshot: Map<string, CanvasResourceSnapshot>
}): void {
	const { src, mediaType, flatAttachments, attachmentIndex, designProjectBasePath, snapshot } =
		params
	if (!src) return

	const resourcePath = normalizeCanvasResourcePath(src)
	if (!resourcePath) return

	const resolvedAttachment = resolveDesignAttachment(
		src,
		{
			flatAttachments,
			attachmentIndex,
			designProjectBasePath,
		},
		{ mode: "strict-current-canvas" },
	)
	const resolvedCandidates = toWorkspaceRelativeCandidates(src, {
		designProjectBasePath,
	})
	const resolvedPath =
		resolvedAttachment.status === "found"
			? resolvedAttachment.resolvedPath
			: (resolvedCandidates[0] ?? src)
	const attachment =
		resolvedAttachment.status === "found"
			? resolvedAttachment.fileItem
			: findCanvasResourceAttachment(resolvedPath, flatAttachments, attachmentIndex)
	const key = `${mediaType}\0${resourcePath}`
	const signature = [
		normalizeCanvasResourcePath(resolvedPath),
		attachment?.file_id ?? "",
		attachment?.updated_at ?? "",
		attachment?.file_size ?? "",
	].join("\0")

	snapshot.set(key, {
		path: src,
		resolvedPath: normalizeCanvasResourcePath(resolvedPath),
		mediaType,
		signature,
	})
}

function getChangedCanvasResources(
	previousSnapshot: CanvasResourceSnapshotState,
	nextSnapshot: CanvasResourceSnapshotState,
): CanvasResourceRefreshItem[] {
	const changedMap = new Map<string, CanvasResourceRefreshItem>()

	nextSnapshot.items.forEach((nextItem, key) => {
		const previousItem = previousSnapshot.items.get(key)
		if (!previousItem) return
		if (previousItem.signature === nextItem.signature) return

		changedMap.set(`${nextItem.mediaType}\0${nextItem.path}`, {
			path: nextItem.path,
			mediaType: nextItem.mediaType,
		})
	})

	return Array.from(changedMap.values())
}

function getChangedCanvasResourcesFromFileChanges(
	changes: SuperMagicFileChangeMessage["changes"],
	snapshot: CanvasResourceSnapshotState,
): CanvasResourceRefreshItem[] {
	const changedMap = new Map<string, CanvasResourceRefreshItem>()

	for (const change of changes) {
		const changedPath = normalizeCanvasResourcePath(change.file?.relative_file_path || "")
		if (!changedPath || !isDesignMediaResourcePath(changedPath)) continue

		const resources = snapshot.resourcesByResolvedPath.get(changedPath)
		if (!resources?.length) continue
		resources.forEach((resource) => {
			changedMap.set(`${resource.mediaType}\0${resource.path}`, {
				path: resource.path,
				mediaType: resource.mediaType,
			})
		})
	}

	return Array.from(changedMap.values())
}

function buildResourcesByResolvedPathIndex(
	snapshot: Map<string, CanvasResourceSnapshot>,
): Map<string, CanvasResourceSnapshot[]> {
	const index = new Map<string, CanvasResourceSnapshot[]>()
	snapshot.forEach((resource) => {
		const resources = index.get(resource.resolvedPath)
		if (resources) {
			resources.push(resource)
			return
		}
		index.set(resource.resolvedPath, [resource])
	})
	return index
}

function findCanvasResourceAttachment(
	resolvedPath: string,
	flatAttachments?: FileItem[],
	attachmentIndex?: DesignAttachmentIndex | null,
): FileItem | null {
	const normalizedTargetPath = normalizeCanvasAttachmentLookupPath(resolvedPath)
	if (!normalizedTargetPath) return null

	const indexed = findAttachmentByNormalizedWorkspacePath(attachmentIndex, normalizedTargetPath)
	if (indexed) return indexed

	return (
		flatAttachments?.find((item) => {
			if (item.is_directory) return false
			return (
				normalizeCanvasAttachmentLookupPath(item.relative_file_path || "") ===
				normalizedTargetPath
			)
		}) ?? null
	)
}

function normalizeCanvasResourcePath(path?: string): string {
	if (!path) return ""
	return path.replace(/\\/g, "/").replace(/^\/+|\/+$/g, "")
}

function isDesignMediaResourcePath(path: string): boolean {
	const parts = normalizeCanvasResourcePath(path).split("/")
	return parts.includes("images") || parts.includes("videos")
}

interface CanvasResourceSnapshot extends CanvasResourceRefreshItem {
	resolvedPath: string
	signature: string
}

interface CanvasResourceSnapshotState {
	items: Map<string, CanvasResourceSnapshot>
	resourcesByResolvedPath: Map<string, CanvasResourceSnapshot[]>
}
