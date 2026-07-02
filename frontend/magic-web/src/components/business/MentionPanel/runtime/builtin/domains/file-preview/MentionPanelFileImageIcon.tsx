import { useEffect, useMemo, useRef, useState } from "react"
import MagicFileIcon from "@/components/base/MagicFileIcon"
import { cn } from "@/lib/utils"
import type { MentionItemRendererContext } from "../../../../renderers/types"
import {
	MentionItemType,
	type ProjectFileMentionData,
	type UploadFileMentionData,
} from "../../../../types"
import {
	getMentionProjectFileImageExtension,
	isMentionPanelImageFileExtension,
} from "./preview-utils"
import projectFilesStore from "@/stores/projectFiles"
import { CustomFolderMagicIcon } from "@/pages/superMagic/components/TopicFilesButton/components/CustomFolderMagicIcon"
import {
	getFileTreeIconType,
	type MagicProjectIconContext,
} from "@/pages/superMagic/components/MessageList/components/MessageAttachment/utils"
import { getCanvasElementSourcePreview } from "../canvas-elements/item-utils"
import { CanvasElementResourceIcon } from "../canvas-elements/CanvasElementResourceIcon"
import { MentionFileImagePreviewBox } from "./MentionFileImagePreviewBox"

function getFileRowIconSize(platform: MentionItemRendererContext["platform"]) {
	return platform === "desktop" ? 16 : 20
}

function getMagicFileIconType(context: MentionItemRendererContext): string {
	const { item } = context
	if (typeof item.icon === "string" && item.icon) return item.icon

	const fromData = (item.data as ProjectFileMentionData | UploadFileMentionData | undefined)
		?.file_extension
	if (fromData) return fromData

	return ""
}

type ImageLoadPhase = "loading" | "loaded" | "error"

function isDirectoryLikeMentionItem(item: unknown): boolean {
	return (item as { is_directory?: unknown })?.is_directory === true
}

function getCustomFolderId(displayConfig?: Record<string, unknown>): string | undefined {
	const value = displayConfig?._customFolderId
	return typeof value === "string" && value ? value : undefined
}

export function MentionPanelFileImageIcon(props: { context: MentionItemRendererContext }) {
	const { context } = props
	const iconSize = getFileRowIconSize(context.platform)
	const canvasElementPreview = getCanvasElementSourcePreview(context.item)
	if (canvasElementPreview) {
		return <CanvasElementResourceIcon preview={canvasElementPreview} iconSize={iconSize} />
	}

	return <ProjectMentionPanelFileImageIcon context={context} iconSize={iconSize} />
}

function ProjectMentionPanelFileImageIcon(props: {
	context: MentionItemRendererContext
	iconSize: number
}) {
	const { context, iconSize } = props
	const { item, filePreviewById } = context

	const extension =
		item.type === MentionItemType.PROJECT_FILE
			? getMentionProjectFileImageExtension(item)
			: item.extension ||
				(item.data as UploadFileMentionData | undefined)?.file_extension ||
				(typeof item.icon === "string" && !item.icon.startsWith("ts-") ? item.icon : "")

	const projectData =
		item.type === MentionItemType.PROJECT_FILE
			? (item.data as ProjectFileMentionData | undefined)
			: undefined
	const uploadData =
		item.type === MentionItemType.UPLOAD_FILE
			? (item.data as UploadFileMentionData | undefined)
			: undefined

	const resolvedProjectPreview = projectData?.file_id
		? filePreviewById?.[projectData.file_id]
		: undefined

	const uploadFile = uploadData?.file
	const objectUrl = useMemo(() => {
		if (resolvedProjectPreview) return undefined
		if (!uploadFile) return undefined

		const ext = uploadData?.file_extension || uploadFile.name
		if (!isMentionPanelImageFileExtension(ext)) return undefined

		return URL.createObjectURL(uploadFile)
	}, [resolvedProjectPreview, uploadData?.file_extension, uploadFile])

	useEffect(() => {
		if (!objectUrl) return
		return () => URL.revokeObjectURL(objectUrl)
	}, [objectUrl])

	const resolvedPreviewUrl = resolvedProjectPreview || objectUrl
	const [imagePhase, setImagePhase] = useState<ImageLoadPhase>("loading")
	const previewWaitTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
	const isImageExtension = isMentionPanelImageFileExtension(extension)

	useEffect(() => {
		if (previewWaitTimeoutRef.current) {
			clearTimeout(previewWaitTimeoutRef.current)
			previewWaitTimeoutRef.current = null
		}

		if (!isImageExtension) {
			setImagePhase("error")
			return
		}

		setImagePhase("loading")

		if (resolvedPreviewUrl) {
			return
		}

		previewWaitTimeoutRef.current = setTimeout(() => {
			setImagePhase("error")
			previewWaitTimeoutRef.current = null
		}, 1500)

		return () => {
			if (previewWaitTimeoutRef.current) {
				clearTimeout(previewWaitTimeoutRef.current)
				previewWaitTimeoutRef.current = null
			}
		}
	}, [isImageExtension, resolvedPreviewUrl])

	if (!isImageExtension) {
		// Normalize path for comparison (remove leading slash)
		const normalizePath = (path: string) => {
			return path.startsWith("/") ? path.slice(1) : path
		}

		// Try to find file data from store if not in item
		let fileDisplayConfig = item.displayConfig
		let parentId = item.parentId
		const fileData = item.data as ProjectFileMentionData | undefined
		let fileIconSource: MagicProjectIconContext = {
			...fileData,
			name: item.name,
			file_extension: fileData?.file_extension || (item.icon as string),
			display_config: fileDisplayConfig,
		}

		if (!fileDisplayConfig || !parentId) {
			const fileNode = projectFilesStore.workspaceFilesList.find((f) => {
				if (fileData?.file_id) {
					return f.file_id === fileData.file_id
				}
				if (fileData?.file_path) {
					return (
						normalizePath(f.relative_file_path || "") ===
						normalizePath(fileData.file_path || "")
					)
				}
				return false
			})

			if (fileNode) {
				fileDisplayConfig = fileNode.display_config
				parentId = fileNode.parent_id || undefined
				fileIconSource = fileNode
			}
		}

		if (
			fileDisplayConfig?.type === "custom" ||
			(fileDisplayConfig?.type === "micro-app" && isDirectoryLikeMentionItem(item))
		) {
			// 优先使用 _customFolderId（入口文件需从原始 custom 文件夹解析 icon_path）
			const customFolderId = getCustomFolderId(fileDisplayConfig)
			const targetFolderId = customFolderId || parentId

			const targetNode = targetFolderId
				? projectFilesStore.getFolderData(targetFolderId)
				: null
			const childrenItems = (targetNode?.children as unknown[]) || []

			return (
				<CustomFolderMagicIcon
					displayConfig={fileDisplayConfig}
					childrenItems={childrenItems}
					size={iconSize}
					typeFallback="custom"
				/>
			)
		}

		const iconType = getFileTreeIconType(fileIconSource)
		return <MagicFileIcon type={iconType || (item.icon as string)} size={iconSize} />
	}

	if (imagePhase === "error") {
		return <MagicFileIcon type={getMagicFileIconType(context)} size={iconSize} />
	}

	if (!resolvedPreviewUrl) {
		return (
			<MentionFileImagePreviewBox iconSize={iconSize}>
				<div
					className={cn(
						"h-full w-full rounded bg-muted",
						"animate-pulse motion-reduce:animate-none",
					)}
				/>
			</MentionFileImagePreviewBox>
		)
	}

	if (imagePhase === "loaded") {
		return (
			<MentionFileImagePreviewBox iconSize={iconSize}>
				<img
					src={resolvedPreviewUrl}
					alt=""
					className="block h-full w-full object-cover"
					loading="lazy"
					decoding="async"
					referrerPolicy="no-referrer"
				/>
			</MentionFileImagePreviewBox>
		)
	}

	return (
		<MentionFileImagePreviewBox iconSize={iconSize}>
			<div
				className={cn(
					"absolute inset-0 rounded bg-muted",
					"animate-pulse motion-reduce:animate-none",
				)}
			/>
			<img
				src={resolvedPreviewUrl}
				alt=""
				className="absolute inset-0 z-[1] h-full w-full object-cover opacity-0"
				loading="lazy"
				decoding="async"
				referrerPolicy="no-referrer"
				onLoad={() => setImagePhase("loaded")}
				onError={() => setImagePhase("error")}
			/>
		</MentionFileImagePreviewBox>
	)
}
