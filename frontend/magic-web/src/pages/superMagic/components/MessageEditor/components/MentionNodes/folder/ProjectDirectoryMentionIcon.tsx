import type { DirectoryMentionData } from "@/components/business/MentionPanel/types"
import type { AttachmentItem } from "@/pages/superMagic/components/TopicFilesButton/hooks"
import { ProjectResourceIcon } from "@/pages/superMagic/components/TopicFilesButton/components/ProjectResourceIcon"
import { normalizeWorkspacePathForComparison } from "@/pages/superMagic/utils/filePathMention"

interface ProjectDirectoryMentionIconProps {
	data: DirectoryMentionData
	workspaceFilesList: AttachmentItem[]
	size?: number
}

function isDirectory(item: AttachmentItem | undefined): item is AttachmentItem {
	return Boolean(item && (item.is_directory === true || item.type === "directory"))
}

function findDirectory(
	items: AttachmentItem[],
	data: DirectoryMentionData,
): AttachmentItem | undefined {
	if (data.directory_id) {
		const directoryById = items.find(
			(item) => String(item.file_id ?? "") === data.directory_id && isDirectory(item),
		)
		if (directoryById) return directoryById
	}

	const directoryPath = data.directory_path
	const normalizedPath = normalizeWorkspacePathForComparison(directoryPath)
	if (!normalizedPath) return undefined

	return items.find((item) => {
		if (!isDirectory(item)) return false
		const itemPath = normalizeWorkspacePathForComparison(
			item.relative_file_path || item.path || "",
		)
		return itemPath === normalizedPath
	})
}

function createFallbackDirectory(data: DirectoryMentionData): AttachmentItem {
	return {
		file_id: data.directory_id,
		file_name: data.directory_name,
		relative_file_path: data.directory_path,
		is_directory: true,
		type: "directory",
		display_config: data.directory_metadata,
		children: [],
	}
}

/** Resolve a project directory's icon from the same attachment data used by the file tree. */
export function ProjectDirectoryMentionIcon({
	data,
	workspaceFilesList,
	size = 16,
}: ProjectDirectoryMentionIconProps) {
	const directory = findDirectory(workspaceFilesList, data) || createFallbackDirectory(data)

	return <ProjectResourceIcon item={directory} resourceTree={workspaceFilesList} size={size} />
}
