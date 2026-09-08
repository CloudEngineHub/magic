import { observer } from "mobx-react-lite"
import { decodePathForDisplay, findAttachmentByPath } from "./helper"
import pubsub, { PubSubEvents } from "@/utils/pubsub"
import { useMessageListContext } from "@/pages/superMagic/components/MessageList/context"
import { FileReference, getFileExtensionFromPath } from "./FileReference"

export const FilePath = observer((props: { path?: unknown }) => {
	const { path } = props
	const { projectFilesStore } = useMessageListContext()
	const normalizedPath = typeof path === "string" ? path : ""
	// 只解码展示文本，内部匹配和打开逻辑仍使用原始路径。
	const displayPath = decodePathForDisplay(normalizedPath)
	// 获取附件列表
	const attachments = projectFilesStore?.workspaceFilesList ?? []

	// 根据相对路径查找文件信息
	const fileInfo = findAttachmentByPath(attachments, normalizedPath)

	const onClick = () => {
		if (fileInfo) {
			pubsub.publish(PubSubEvents.Open_File_Tab, {
				fileId: fileInfo?.file_id,
				fileData: fileInfo,
			})
		}
	}

	if (fileInfo) {
		return (
			<FileReference
				label={displayPath}
				fileType={fileInfo.file_extension || getFileExtensionFromPath(displayPath)}
				onClick={onClick}
				title={displayPath}
			/>
		)
	}

	return (
		<FileReference
			label={displayPath}
			fileType={getFileExtensionFromPath(displayPath)}
			disabled
			title={`File does not exist: ${displayPath}`}
		/>
	)
})
