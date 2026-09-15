import type { AttachmentItem } from "@/pages/superMagic/components/TopicFilesButton/hooks"
import type { ProjectResourceSelection } from "@/pages/superMagic/components/SelectPathModal/types"
import { MentionItemType, type MentionItem } from "../types"
import { getFolderMentionData } from "./directoryMention"

function normalizePath(path?: string) {
	return (path || "").replace(/\\/g, "/").replace(/\/+$/g, "")
}

function getAttachmentName(attachment: AttachmentItem) {
	return attachment.file_name || attachment.name || attachment.filename || ""
}

function getAttachmentPath(attachment: AttachmentItem) {
	return attachment.relative_file_path || attachment.path || ""
}

export function createOtherProjectMentionItem(selection: ProjectResourceSelection): MentionItem {
	const { project } = selection

	if (selection.level === "project") {
		return {
			id: `other-project:${project.id}`,
			type: MentionItemType.PROJECT,
			name: project.project_name,
			icon: "file-folder",
			isFolder: false,
			hasChildren: false,
			data: {
				project_id: project.id,
				project_name: project.project_name,
			},
		}
	}

	const attachment = selection.attachment
	const attachmentId = String(attachment.file_id || attachment.id || "")
	const attachmentName = getAttachmentName(attachment)
	const relativeAttachmentPath = getAttachmentPath(attachment)
	const normalizedAttachmentPath = normalizePath(relativeAttachmentPath).replace(/^\/+/, "")

	if (attachment.is_directory || attachment.type === "directory") {
		return {
			id: `other-project-directory:${project.id}:${attachmentId}`,
			type: MentionItemType.FOLDER,
			name: attachmentName,
			icon: "file-folder",
			isFolder: false,
			hasChildren: false,
			data: {
				...getFolderMentionData({
					directoryId: attachmentId,
					directoryName: attachmentName,
					directoryPath: normalizedAttachmentPath,
					directoryMetadata: attachment.display_config,
				}),
				project_id: project.id,
				project_name: project.project_name,
			},
		}
	}

	return {
		id: `other-project-file:${project.id}:${attachmentId}`,
		type: MentionItemType.PROJECT_FILE,
		name: attachmentName,
		icon: attachment.file_extension,
		extension: attachment.file_extension,
		isFolder: false,
		hasChildren: false,
		data: {
			file_id: attachmentId,
			file_name: attachmentName,
			file_path: normalizedAttachmentPath,
			relative_file_path: relativeAttachmentPath,
			file_extension: attachment.file_extension || "",
			project_id: project.id,
			project_name: project.project_name,
			file_size: attachment.file_size,
			is_hidden: attachment.is_hidden,
		},
	}
}
