import { useTranslation } from "react-i18next"
import { workspaceStore } from "@/pages/superMagic/stores/core"
import {
	WorkspaceStatus,
	type ProjectListItem,
	type Workspace,
} from "@/pages/superMagic/pages/Workspace/types"
import { SHARE_WORKSPACE_DATA, SHARE_WORKSPACE_ID } from "@/pages/superMagic/constants"
import { isOwner } from "@/pages/superMagic/utils/permission"

/** 跨工作区列表的动作使用项目本身的归属；共享项目不暴露对方私人目录。 */
export default function useProjectWorkspace(project: ProjectListItem) {
	const { t } = useTranslation("super")
	const owner = isOwner(project.user_role)
	// 菜单使用快捷入口实际绑定的本方工作区；位置标签仍将他人项目显示为共享项目。
	const workspaceId = owner
		? project.workspace_id
		: project.is_bind_workspace && project.bind_workspace_id
			? project.bind_workspace_id
			: SHARE_WORKSPACE_ID
	const workspace: Workspace =
		workspaceId === SHARE_WORKSPACE_ID
			? SHARE_WORKSPACE_DATA(t)
			: (workspaceStore.getWorkspaceById(workspaceId) ?? {
					id: workspaceId,
					name: owner ? project.workspace_name : t("workspace.unnamedWorkspace"),
					workspace_type: "default",
					is_archived: 0,
					workspace_status: WorkspaceStatus.WAITING,
					project_count: 0,
					current_project_id: project.id,
					current_topic_id: project.current_topic_id ?? "",
				})

	return {
		workspace,
		locationName: owner
			? workspace.name || t("workspace.unnamedWorkspace")
			: t("workspace.shareWorkspaceName"),
	}
}
