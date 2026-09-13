import type { ComponentProps } from "react"
import { observer } from "mobx-react-lite"
import ProjectItem, { SortType } from "../../EmptyWorkspacePanel/components/ProjectItem"
import useProjectItemActionProps from "../../EmptyWorkspacePanel/hooks/useProjectItemActionProps"
import useProjectWorkspace from "@/pages/superMagic/hooks/useProjectWorkspace"
import type { ProjectListItem } from "@/pages/superMagic/pages/Workspace/types"

/** 目录内的项目共用一个归属，最近分类的每一行则有自己的归属与权限动作。 */
function RecentProjectItem(props: ComponentProps<typeof ProjectItem<ProjectListItem>>) {
	const { workspace, locationName } = useProjectWorkspace(props.project)
	const actions = useProjectItemActionProps({ selectedWorkspace: workspace })
	return (
		<>
			<ProjectItem
				{...props}
				locationName={locationName}
				sortType={SortType.MY_LAST_ACTIVE_TIME}
				relativeActiveTime
				onRenameProject={actions.handleRenameProject}
				onPinProject={actions.handlePinProject}
				onDeleteProject={actions.handleDeleteProjectConfirm}
				onMoveProject={actions.handleMoveProject}
				onTransferProject={actions.handleTransferProject}
				onAddCollaborators={actions.onAddCollaborators}
				onCancelWorkspaceShortcut={actions.handleCancelWorkspaceShortcut}
			/>
			{actions.projectModals}
		</>
	)
}

export default observer(RecentProjectItem)
