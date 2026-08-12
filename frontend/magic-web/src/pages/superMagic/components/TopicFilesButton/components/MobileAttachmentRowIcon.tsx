import MagicFileIcon from "@/components/base/MagicFileIcon"
import {
	getAttachmentType,
	getChildrenForCustomMetadataIconPath,
} from "@/pages/superMagic/components/MessageList/components/MessageAttachment/utils"
import type { AttachmentItem } from "@/pages/superMagic/components/TopicFilesButton/hooks/types"
import { findFileInTree } from "@/pages/superMagic/components/TopicFilesButton/hooks/fileSelectionUtils"
import {
	getAttachmentDisplayName,
	getVisibleAttachmentChildren,
} from "@/pages/superMagic/components/TopicFilesButton/utils/getAttachmentKey"
import { isEmpty } from "lodash-es"
import { CustomFolderMagicIcon } from "./CustomFolderMagicIcon"
import { ProjectFileImageThumbnailIcon } from "./ProjectFileImageThumbnailIcon"
import { TopicFileIcon, type TopicFileMagicVariant } from "./TopicFileIcon"
import {
	isMagicSystemFolder,
	resolveProjectInstructionsFileKind,
} from "../utils/magic-system-folder"

interface MobileAttachmentRowIconProps {
	item: AttachmentItem
	attachments: AttachmentItem[]
	size?: number
	className?: string
	dataTestId?: string
}

const MAGIC_CHILD_FOLDER_VARIANTS: Record<string, TopicFileMagicVariant> = {
	cron: "magic-cron",
	skills: "magic-skills",
	memory: "magic-memory",
}

const MAGIC_FILE_VARIANTS: Record<string, TopicFileMagicVariant> = {
	skills: "magic-file-skills",
	agents: "magic-file-agent",
	heartbeat: "magic-file-heartbeat",
	identity: "magic-file-identity",
	soul: "magic-file-soul",
	tools: "magic-file-tools",
	user: "magic-file-user",
	bootstrap: "magic-file-bootstrap",
	memory: "magic-file-memory",
}

/** Normalizes extensions so `.md`, `MD`, and `md` share the same icon lookup path. */
function normalizeFileExtension(fileExtension?: string): string {
	return fileExtension?.replace(/^\./, "").toLowerCase() || ""
}

/** Extracts path segments from either backend path field used by attachment payloads. */
function getNormalizedPathSegments(item: AttachmentItem): string[] {
	const pathCandidates = [item.relative_file_path, item.path]

	for (const pathCandidate of pathCandidates) {
		if (!pathCandidate) continue
		const segments = pathCandidate
			.replace(/\\/g, "/")
			.split("/")
			.map((segment) => segment.trim())
			.filter(Boolean)

		if (segments.length > 0) {
			return segments
		}
	}

	return []
}

/** Resolves the `.magic` icon variant without duplicating that rule in each mobile list. */
function resolveAttachmentMagicVariant(item: AttachmentItem): TopicFileMagicVariant | undefined {
	if (isMagicSystemFolder(item)) {
		return "magic-root"
	}
	if (resolveProjectInstructionsFileKind(item) === "project") {
		return "magic-file-agent"
	}

	const pathSegments = getNormalizedPathSegments(item)
	if (!pathSegments.includes(".magic")) {
		return undefined
	}

	const attachmentName = getAttachmentDisplayName(item).trim().toLowerCase()

	if (item.is_directory) {
		return MAGIC_CHILD_FOLDER_VARIANTS[attachmentName]
	}

	if (normalizeFileExtension(item.file_extension) !== "md") {
		return undefined
	}

	const baseName = attachmentName.replace(/\.md$/i, "")
	return MAGIC_FILE_VARIANTS[baseName]
}

/** Finds custom folder children from the latest attachment tree so metadata icons survive refreshes. */
function findAttachmentInTree(
	attachments: AttachmentItem[],
	fileId: string,
): AttachmentItem | undefined {
	const found = findFileInTree(attachments as Record<string, unknown>[], fileId)
	return (found as AttachmentItem | null) ?? undefined
}

/** Shares the mobile file-row icon rules between project detail and share default-file picker. */
export function MobileAttachmentRowIcon({
	item,
	attachments,
	size = 24,
	className,
	dataTestId,
}: MobileAttachmentRowIconProps) {
	if (item.is_directory && !isEmpty(item.display_config)) {
		if (item.display_config?.type === "custom") {
			// Summary rows may pass a flat item without children; use the full tree node for icon assets.
			const customIconSourceItem = item.file_id
				? findAttachmentInTree(attachments, item.file_id) || item
				: item

			return (
				<CustomFolderMagicIcon
					displayConfig={item.display_config}
					childrenItems={getChildrenForCustomMetadataIconPath(
						customIconSourceItem,
						(id) => findAttachmentInTree(attachments, id),
					)}
					typeFallback="custom"
					size={size}
					className={className}
				/>
			)
		}

		return (
			<MagicFileIcon
				type={getAttachmentType(item) || item.file_extension}
				size={size}
				className={className}
			/>
		)
	}

	const magicVariant = resolveAttachmentMagicVariant(item)

	return (
		<ProjectFileImageThumbnailIcon
			item={item}
			size={size}
			className={className}
			dataTestId={dataTestId}
			fallback={
				<TopicFileIcon
					isDirectory={item.is_directory}
					magicVariant={magicVariant}
					hasChildren={getVisibleAttachmentChildren(item).length > 0}
					fileExtension={item.file_extension}
					className={className}
					dataTestId={dataTestId}
				/>
			}
		/>
	)
}
