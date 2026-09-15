import { observer } from "mobx-react-lite"
import { useTranslation } from "react-i18next"

import workspaceStore from "@/pages/superMagic/stores/core/workspace"
import ProjectResourceSelectorModal from "@/pages/superMagic/components/SelectPathModal/components/ProjectResourceSelectorModal"
import type { ProjectResourceSelection } from "@/pages/superMagic/components/SelectPathModal/types"
import type { ProjectListItem } from "@/pages/superMagic/pages/Workspace/types"
import { SuperMagicApi } from "@/apis"
import magicToast from "@/components/base/MagicToaster/utils"

interface OtherProjectFileMentionModalProps {
	visible: boolean
	currentProject?: ProjectListItem | null
	onClose: () => void
	onSelect: (selections: ProjectResourceSelection[]) => void
}

/**
 * Mention-specific adapter for the shared workspace/project/file selector.
 * It disables creation and destination constraints through `selectionMode="mention"`, while
 * keeping the same data source, breadcrumb and responsive modal UI as file operations.
 */
function OtherProjectFileMentionModal({
	visible,
	currentProject,
	onClose,
	onSelect,
}: OtherProjectFileMentionModalProps) {
	const { t } = useTranslation("super")

	return (
		<ProjectResourceSelectorModal
			visible={visible}
			title={t("selectPathModal.mentionOtherProjectFiles")}
			operationType="copy"
			selectionMode="mention"
			workspaces={workspaceStore.workspaces}
			fileIds={[]}
			sourceAttachments={[]}
			includeFixedWorkspaces
			closeOnSubmit={false}
			excludeProjectIds={currentProject?.id ? [currentProject.id] : []}
			emptyDirectoryDescription={t("selectPathModal.mentionEmptyProject")}
			emptyDirectoryActionLabel={null}
			onClose={onClose}
			onSubmit={async (data) => {
				const selections = data.selections || (data.selection ? [data.selection] : [])
				if (selections.length === 0) return
				try {
					const projectsById = new Map<string, ProjectListItem>()
					await Promise.all(
						Array.from(
							new Map(
								selections.map((selection) => [
									selection.project.id,
									selection.project,
								]),
							).values(),
						).map(async (project) => {
							const resolvedProject = project.work_dir
								? project
								: await SuperMagicApi.getProjectDetail({ id: project.id })
							projectsById.set(project.id, resolvedProject)
						}),
					)

					onSelect(
						selections.map((selection) => ({
							...selection,
							project: projectsById.get(selection.project.id) || selection.project,
						})),
					)
				} catch (error) {
					console.error("Failed to resolve mentioned project:", error)
					magicToast.error(t("selectPathModal.fetchProjectsFailed"))
				}
			}}
		/>
	)
}

export default observer(OtherProjectFileMentionModal)
