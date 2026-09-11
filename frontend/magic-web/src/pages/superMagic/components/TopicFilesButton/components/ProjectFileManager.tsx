import { useEffect, useMemo, useState } from "react"
import { observer } from "mobx-react-lite"
import { useTranslation } from "react-i18next"
import type { ProjectListItem, Topic } from "../../../pages/Workspace/types"
import type { AttachmentItem } from "../hooks/types"
import { buildAttachmentIndex } from "../utils/attachmentIndex"
import { getAttachmentKey, getAttachmentDisplayName } from "../utils/getAttachmentKey"
import { useFileReplace } from "../hooks/useFileReplace"
import TopicFilesCore from "../TopicFilesCore"
import { requestProjectAttachmentsFullRefresh } from "../../../services/attachmentsTopicSync"
import workspaceStore from "../../../stores/core/workspace"
import projectStore from "../../../stores/core/project"

export interface ProjectFileManagerProps {
	projectId: string
	initialDirectoryId?: string
	attachments: AttachmentItem[]
	selectedProject?: ProjectListItem | null
	selectedTopic?: Topic | null
	allowEdit?: boolean
	allowDownload?: boolean
	loading?: boolean
	onFileClick: (file: AttachmentItem) => void
}

/** 管理器只持有目录导航；操作、菜单和弹窗由原文件组件统一提供。 */
export default observer(function ProjectFileManager({
	projectId,
	initialDirectoryId,
	attachments,
	selectedProject,
	selectedTopic,
	allowEdit = false,
	allowDownload = true,
	loading,
	onFileClick,
}: ProjectFileManagerProps) {
	const { t } = useTranslation("super")
	const [directoryId, setDirectoryId] = useState(initialDirectoryId)
	const index = useMemo(() => buildAttachmentIndex(attachments), [attachments])
	const directory = directoryId ? index.getItemById(directoryId) : undefined
	const path =
		directoryId && directory ? [...index.getParentItemsById(directoryId), directory] : []
	const items = (directory?.children ?? attachments).filter((file) => !file.is_hidden)
	const { handleReplaceFile } = useFileReplace({ projectId, selectedProject, selectedTopic })
	useEffect(() => {
		setDirectoryId(initialDirectoryId)
	}, [initialDirectoryId])
	return (
		<div className="flex h-full min-h-0 flex-col bg-background">
			<div className="shrink-0 border-b px-4 py-3 text-sm font-semibold">
				{selectedProject?.project_name ?? t("topicFiles.title")}
			</div>
			<TopicFilesCore
				projectId={projectId}
				attachments={attachments}
				selectedProject={selectedProject}
				selectedTopic={selectedTopic}
				selectedWorkspace={
					selectedProject
						? workspaceStore.getWorkspaceById(selectedProject.workspace_id)
						: null
				}
				workspaces={workspaceStore.workspaces}
				projects={projectStore.projects}
				allowEdit={allowEdit}
				allowDownload={allowDownload}
				refreshLoading={loading}
				onFileClick={onFileClick}
				handleReplaceFile={handleReplaceFile}
				isInProject
				onUpdateAttachments={() => requestProjectAttachmentsFullRefresh({ projectId })}
				filterMenuItems={(menuItems) =>
					menuItems.filter((item) => {
						if (!item) return false
						if (item.key === "selectMultiple" || item.key === "toggleFolderContents")
							return false
						if (
							!allowDownload &&
							["download", "downloadFolder"].includes(String(item.key))
						)
							return false
						return (
							allowEdit ||
							[
								"openFile",
								"download",
								"downloadFolder",
								"showInfo",
								"copyPath",
								"addToCurrentChat",
								"addToNewChat",
							].includes(String(item.key))
						)
					})
				}
				directoryView={{
					directory,
					items,
					onNavigate: setDirectoryId,
					path: path.map((file) => ({
						id: getAttachmentKey(file),
						name: getAttachmentDisplayName(file),
					})),
				}}
			/>
		</div>
	)
})
