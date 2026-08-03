import { lazy, Suspense, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import type { ProjectListItem } from "@/pages/superMagic/pages/Workspace/types"
import projectFilesStore from "@/stores/projectFiles"
import mentionPanelStore from "@/components/business/MentionPanel/builtin-store"
import MagicModal from "@/components/base/MagicModal"
import magicToast from "@/components/base/MagicToaster/utils"
import { Spinner } from "@/components/shadcn-ui/spinner"
import { useModalStyles } from "@/components/business/AccountSetting/pages/ScheduledTasks/styles"
import mcpTempStorage from "@/components/business/AccountSetting/pages/ScheduledTasks/store/MCPTempStorage"
import type { FormValues } from "@/components/business/AccountSetting/pages/ScheduledTasks/types"
import type {
	ScheduledTasksModifyModalController,
	ScheduledTasksModifyRef,
} from "@/components/business/AccountSetting/pages/ScheduledTasks/types/ScheduledTasksModify"
import type { ScheduledTask } from "@/types/scheduledTask"
import type { MicroAppScheduledTaskContext } from "./types"

const MicroAppScheduledTasksModify = lazy(async () => {
	const module = await import("./MicroAppScheduledTasksModify")
	return { default: module.MicroAppScheduledTasksModify }
})

interface ModalState {
	visible: boolean
	mode: "create" | "edit"
	editingTask?: ScheduledTask.UpdateTask
	createTask?: Partial<ScheduledTask.UpdateTask>
	onSubmit?: (task: ScheduledTask.UpdateTask, callback: () => void) => void
}

export function useMicroAppScheduledTasksModifyModal(
	context: MicroAppScheduledTaskContext,
): ScheduledTasksModifyModalController {
	const { t } = useTranslation("interface")
	const { styles } = useModalStyles({ runningRecord: false })
	const modifyRef = useRef<ScheduledTasksModifyRef>(null)
	const rawProjectRef = useRef<ProjectListItem | null>(null)
	const hasCapturedProjectRef = useRef(false)
	const [state, setState] = useState<ModalState>({ visible: false, mode: "create" })

	function captureCurrentProject() {
		// 表单会临时切换项目；同步保存首次打开前的上下文，避免 effect 时序采集到临时项目。
		if (hasCapturedProjectRef.current) return
		rawProjectRef.current = mentionPanelStore.currentSelectedProject
		hasCapturedProjectRef.current = true
	}

	function openCreateModal(
		onSubmit: (task: ScheduledTask.UpdateTask) => void,
		initialValues?: Partial<ScheduledTask.UpdateTask>,
	) {
		captureCurrentProject()
		setState({ visible: true, mode: "create", createTask: initialValues, onSubmit })
	}

	function openEditModal(
		task: ScheduledTask.UpdateTask,
		onSubmit: (task: ScheduledTask.UpdateTask) => void,
	) {
		if (task.workspace_id !== context.workspaceId || task.project_id !== context.projectId) {
			magicToast.error(t("accountPanel.timedTasks.microAppContextMismatch"))
			return
		}
		captureCurrentProject()
		setState({ visible: true, mode: "edit", editingTask: task, onSubmit })
	}

	async function restoreProject() {
		mcpTempStorage.saveMCP([])
		if (!hasCapturedProjectRef.current) return

		const rawProject = rawProjectRef.current
		hasCapturedProjectRef.current = false
		rawProjectRef.current = null
		projectFilesStore.setSelectedProject(rawProject)
		if (rawProject) await modifyRef.current?.updateAttachments(rawProject.id)
	}

	async function closeModal() {
		await restoreProject()
		setState({
			visible: false,
			mode: "create",
			editingTask: undefined,
			createTask: undefined,
			onSubmit: undefined,
		})
	}

	function handleFormSubmit(values: ScheduledTask.UpdateTask) {
		state.onSubmit?.(values, closeModal)
	}

	function getInitialValues(): Partial<FormValues> {
		if (state.mode === "edit" && state.editingTask) return state.editingTask
		if (state.createTask) return state.createTask
		return {}
	}

	const content = (
		<MagicModal
			centered
			className={styles.modal}
			open={state.visible}
			onCancel={closeModal}
			footer={null}
			width={460}
			title={
				state.mode === "edit"
					? t("chat.timedTask.editTimedTask")
					: t("chat.timedTask.createTask")
			}
			destroyOnHidden
			classNames={{ content: "p-0" }}
		>
			<Suspense
				fallback={
					<div className="flex h-[300px] items-center justify-center">
						<Spinner size={20} className="animate-spin" />
					</div>
				}
			>
				<MicroAppScheduledTasksModify
					ref={modifyRef}
					context={context}
					initialValues={getInitialValues()}
					onSubmit={handleFormSubmit}
					onClose={closeModal}
					mode={state.mode}
				/>
			</Suspense>
		</MagicModal>
	)

	return { state, openCreateModal, openEditModal, closeModal, content }
}
