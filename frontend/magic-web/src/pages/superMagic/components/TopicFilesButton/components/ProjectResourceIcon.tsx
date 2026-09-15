import MagicFileIcon from "@/components/base/MagicFileIcon"
import { CustomFolderMagicIcon } from "@/pages/superMagic/components/TopicFilesButton/components/CustomFolderMagicIcon"
import { MagicSystemFolderIcon } from "@/pages/superMagic/components/TopicFilesButton/components/MagicSystemFolderIcon"
import { TopicFileIcon } from "@/pages/superMagic/components/TopicFilesButton/components/TopicFileIcon"
import {
	isMagicSystemFolder,
	resolveProjectInstructionsFileKind,
} from "@/pages/superMagic/components/TopicFilesButton/utils/magic-system-folder"
import {
	getAttachmentType,
	getChildrenForCustomMetadataIconPath,
	getFileIconType,
	getFileTreeIconType,
} from "@/pages/superMagic/components/MessageList/components/MessageAttachment/utils"
import type { AttachmentItem } from "@/pages/superMagic/components/TopicFilesButton/hooks"
import FoldIcon from "@/pages/superMagic/assets/svg/file-folder.svg"

interface ProjectResourceIconProps {
	item: AttachmentItem
	resourceTree: AttachmentItem[]
	size?: number
	folderWidth?: number
	folderHeight?: number
	folderClassName?: string
	folderTestId?: string
}

function findAttachmentById(items: AttachmentItem[], id: string): AttachmentItem | null {
	for (const item of items) {
		if (String(item.file_id ?? "") === id) return item
		if (item.children?.length) {
			const found = findAttachmentById(item.children, id)
			if (found) return found
		}
	}

	return null
}

/** Shared resource icon rendering for desktop and mobile project selectors. */
export function ProjectResourceIcon({
	item,
	resourceTree,
	size = 16,
	folderWidth = size,
	folderHeight = size,
	folderClassName,
	folderTestId,
}: ProjectResourceIconProps) {
	const isDirectory = item.is_directory === true || item.type === "directory"
	const resourceItem =
		isDirectory && item.is_directory !== true ? { ...item, is_directory: true } : item
	const displayConfigType = resourceItem.display_config?.type
	const projectInstructionsFileKind = resolveProjectInstructionsFileKind(resourceItem)
	const isCustomMetadata = displayConfigType === "custom"
	const isMicroAppMetadata = displayConfigType === "micro-app"
	const childrenItems =
		isCustomMetadata || isMicroAppMetadata
			? getChildrenForCustomMetadataIconPath(resourceItem, (id) =>
					findAttachmentById(resourceTree, id),
				)
			: undefined

	if (isDirectory) {
		if (isMagicSystemFolder(resourceItem)) {
			return <MagicSystemFolderIcon size={size} />
		}

		if (isCustomMetadata || isMicroAppMetadata) {
			return (
				<CustomFolderMagicIcon
					displayConfig={resourceItem.display_config}
					childrenItems={childrenItems}
					typeFallback={displayConfigType}
					size={size}
				/>
			)
		}

		if (displayConfigType) {
			return (
				<MagicFileIcon
					type={getAttachmentType(resourceItem) || resourceItem.file_extension}
					size={size}
				/>
			)
		}

		return (
			<img
				src={FoldIcon}
				alt=""
				width={folderWidth}
				height={folderHeight}
				className={folderClassName}
				aria-hidden
				data-testid={folderTestId}
			/>
		)
	}

	if (projectInstructionsFileKind) {
		return <TopicFileIcon magicVariant="magic-file-agent" size={size} />
	}

	if (isCustomMetadata) {
		return (
			<CustomFolderMagicIcon
				displayConfig={resourceItem.display_config}
				childrenItems={childrenItems}
				typeFallback={displayConfigType}
				size={size}
			/>
		)
	}

	return (
		<MagicFileIcon
			type={
				getFileTreeIconType(resourceItem) ||
				getFileIconType(resourceItem) ||
				resourceItem.file_extension
			}
			size={size}
		/>
	)
}
