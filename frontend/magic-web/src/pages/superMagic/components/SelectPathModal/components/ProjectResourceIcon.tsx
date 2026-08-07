import MagicFileIcon from "@/components/base/MagicFileIcon"
import { CustomFolderMagicIcon } from "@/pages/superMagic/components/TopicFilesButton/components/CustomFolderMagicIcon"
import { MagicSystemFolderIcon } from "@/pages/superMagic/components/TopicFilesButton/components/MagicSystemFolderIcon"
import { TopicFileIcon } from "@/pages/superMagic/components/TopicFilesButton/components/TopicFileIcon"
import {
	isMagicSystemFolder,
	isProjectInstructionsFile,
} from "@/pages/superMagic/components/TopicFilesButton/utils/magic-system-folder"
import {
	getAttachmentType,
	getChildrenForCustomMetadataIconPath,
	getFileIconType,
	getFileTreeIconType,
} from "@/pages/superMagic/components/MessageList/components/MessageAttachment/utils"
import type { AttachmentItem } from "../../TopicFilesButton/hooks"
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
		if (item.file_id === id) return item
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
	const displayConfigType = item.display_config?.type
	const isCustomMetadata = displayConfigType === "custom"
	const isMicroAppMetadata = displayConfigType === "micro-app"
	const childrenItems =
		isCustomMetadata || isMicroAppMetadata
			? getChildrenForCustomMetadataIconPath(item, (id) =>
					findAttachmentById(resourceTree, id),
				)
			: undefined

	if (item.is_directory) {
		if (isMagicSystemFolder(item)) {
			return <MagicSystemFolderIcon size={size} />
		}

		if (isCustomMetadata || isMicroAppMetadata) {
			return (
				<CustomFolderMagicIcon
					displayConfig={item.display_config}
					childrenItems={childrenItems}
					typeFallback={displayConfigType}
					size={size}
				/>
			)
		}

		if (displayConfigType) {
			return (
				<MagicFileIcon type={getAttachmentType(item) || item.file_extension} size={size} />
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

	if (isProjectInstructionsFile(item)) {
		return <TopicFileIcon magicVariant="magic-file-agent" size={size} />
	}

	if (isCustomMetadata) {
		return (
			<CustomFolderMagicIcon
				displayConfig={item.display_config}
				childrenItems={childrenItems}
				typeFallback={displayConfigType}
				size={size}
			/>
		)
	}

	return (
		<MagicFileIcon
			type={getFileTreeIconType(item) || getFileIconType(item) || item.file_extension}
			size={size}
		/>
	)
}
