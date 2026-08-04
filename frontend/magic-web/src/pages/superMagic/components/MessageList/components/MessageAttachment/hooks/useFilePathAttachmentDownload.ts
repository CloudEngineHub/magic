import { useMemoizedFn } from "ahooks"
import { useMessageListContext } from "@/pages/superMagic/components/MessageList/context"
import { findAttachmentByPath } from "@/pages/superMagic/components/MessageList/components/Text/components/Markdown/parser/helper"
import {
	downloadFileByPath as publishDownloadFileByPath,
	type FilePathAttachment,
} from "@/pages/superMagic/components/MessageList/utils/attachmentByFilePath"
import { useMessageAttachmentDownload } from "./useMessageAttachmentDownload"

/** Resolves path attachments before downloading related resources. */
export function useFilePathAttachmentDownload() {
	const { projectFilesStore } = useMessageListContext()
	const downloadFile = useMessageAttachmentDownload()

	return useMemoizedFn((attachment: FilePathAttachment) => {
		const file = findAttachmentByPath(
			projectFilesStore?.workspaceFilesList || [],
			attachment.filePath,
		)

		if (file?.file_id) {
			return downloadFile(file.file_id)
		}

		publishDownloadFileByPath(attachment)
	})
}
