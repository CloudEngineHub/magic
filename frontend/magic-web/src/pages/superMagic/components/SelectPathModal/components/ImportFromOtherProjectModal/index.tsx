import { useEffect, useRef, useState } from "react"
import { useTranslation } from "react-i18next"

import type { AttachmentItem } from "@/pages/superMagic/components/TopicFilesButton/hooks"
import type { ProjectListItem } from "../../../../pages/Workspace/types"
import ProjectResourceSelectorModal from "../ProjectResourceSelectorModal"
import type { ImportFromOtherProjectModalProps, ProjectResourceSelection } from "../../types"
import { getItemId } from "../../utils/attachmentUtils"

/**
 * 导入只复用资源选择器的浏览和勾选；重名检查、冲突处理、复制进度仍由原导入 hook 负责。
 */
function ImportFromOtherProjectModal({
	visible,
	workspaces,
	currentProjectId,
	onClose,
	onSubmit,
}: ImportFromOtherProjectModalProps) {
	const { t } = useTranslation("super")
	const pending = useRef(false)
	const [submitting, setSubmitting] = useState(false)

	useEffect(() => {
		if (!visible) {
			pending.current = false
			setSubmitting(false)
		}
	}, [visible])

	const handleSubmit = async (data: {
		selections?: ProjectResourceSelection[]
		selection?: ProjectResourceSelection
	}) => {
		if (pending.current) return
		const selections = (data.selections || (data.selection ? [data.selection] : [])).filter(
			(selection): selection is Extract<ProjectResourceSelection, { level: "attachment" }> =>
				selection.level === "attachment",
		)
		if (selections.length === 0) return

		const groups = new Map<string, { project: ProjectListItem; files: AttachmentItem[] }>()
		for (const selection of selections) {
			const fileId = getItemId(selection.attachment)
			if (!fileId) continue
			const group = groups.get(selection.project.id) ?? {
				project: selection.project,
				files: [],
			}
			group.files.push(selection.attachment)
			groups.set(selection.project.id, group)
		}
		if (groups.size === 0) return

		pending.current = true
		setSubmitting(true)
		try {
			await onSubmit({
				filesByProject: Array.from(groups.values()).map((group) => ({
					sourceProjectId: group.project.id,
					selectedFileIds: group.files.map(getItemId).filter(Boolean),
					selectedFiles: group.files,
				})),
			})
			onClose()
		} finally {
			pending.current = false
			setSubmitting(false)
		}
	}

	return (
		<ProjectResourceSelectorModal
			visible={visible}
			title={t("selectPathModal.importFromOtherProject")}
			operationType="copy"
			selectionMode="import"
			submitting={submitting}
			workspaces={workspaces}
			selectedWorkspace={undefined}
			selectedProject={undefined}
			fileIds={[]}
			sourceAttachments={[]}
			includeFixedWorkspaces
			closeOnSubmit={false}
			excludeProjectIds={[currentProjectId]}
			emptyDirectoryDescription={t("selectPathModal.mentionEmptyProject")}
			emptyDirectoryActionLabel={null}
			onClose={onClose}
			onSubmit={handleSubmit}
		/>
	)
}

export default ImportFromOtherProjectModal
