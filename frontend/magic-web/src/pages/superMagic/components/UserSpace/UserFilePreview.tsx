import type { ReactNode } from "react"
import { useTranslation } from "react-i18next"
import { MessageSquarePlus } from "lucide-react"
import { Button } from "@/components/shadcn-ui/button"
import magicToast from "@/components/base/MagicToaster/utils"
import type { FileItem } from "../Detail/components/FilesViewer/types"
import { addFileToCurrentChat } from "../../utils/topics"

/** 所有用户文件格式共用空间路径和引用操作；正文仍由原有预览器负责。 */
export default function UserFilePreview({
	file,
	topicId,
	children,
}: {
	file: FileItem
	topicId?: string
	children: ReactNode
}) {
	const { t } = useTranslation("super")
	const path = "~/" + (file.file_reference?.space_relative_path ?? file.relative_file_path ?? "")
	const addToChat = async () => {
		if (!topicId) {
			magicToast.info(t("userSpace.openChatFirst"))
			return
		}
		try {
			await addFileToCurrentChat({
				fileItem: {
					file_id: file.file_id,
					file_name: file.file_name,
					file_extension: file.file_extension,
					file_reference: file.file_reference,
					relative_file_path: file.relative_file_path,
					space_type: "user",
					is_directory: false,
				},
				autoFocus: true,
			})
		} catch {
			magicToast.error(t("common.fileNotFoundOrLoadFailed"))
		}
	}
	return (
		<div className="flex h-full min-h-0 flex-col">
			<div className="flex shrink-0 items-center gap-2 border-b px-3 py-1 text-xs">
				<span className="shrink-0 text-muted-foreground">{t("userSpace.title")}</span>
				<span className="min-w-0 flex-1 truncate" title={path}>
					{path}
				</span>
				<Button
					variant="ghost"
					size="sm"
					className="h-7 shrink-0 text-xs"
					onClick={() => void addToChat()}
				>
					<MessageSquarePlus size={14} />
					{t("userSpace.addToChat")}
				</Button>
			</div>
			<div className="min-h-0 flex-1">{children}</div>
		</div>
	)
}
