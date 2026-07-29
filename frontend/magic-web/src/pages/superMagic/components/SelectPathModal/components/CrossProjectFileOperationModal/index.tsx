import ProjectResourceSelectorModal from "../ProjectResourceSelectorModal"
import type {
	CrossProjectFileOperationModalProps,
	ProjectResourceSelectorSubmitData,
} from "../../types"

/**
 * 移动/复制文件仍使用目标目录语义；公共选择器只负责承载层级浏览 UI。
 * 将业务模式固定在 wrapper 中，避免移动逻辑误接收到 Mention 的项目级选择结果。
 */
function CrossProjectFileOperationModal(props: CrossProjectFileOperationModalProps) {
	return (
		<ProjectResourceSelectorModal
			{...props}
			selectionMode="destination"
			onSubmit={(data: ProjectResourceSelectorSubmitData) => {
				props.onSubmit({
					targetProjectId: data.targetProjectId,
					targetWorkspaceId: data.targetWorkspaceId,
					targetProject: data.targetProject,
					targetPath: data.targetPath,
					targetAttachments: data.targetAttachments,
					sourceAttachments: data.sourceAttachments,
				})
			}}
		/>
	)
}

export default CrossProjectFileOperationModal
