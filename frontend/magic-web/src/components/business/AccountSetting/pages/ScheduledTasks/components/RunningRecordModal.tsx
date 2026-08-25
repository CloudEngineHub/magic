import { ScheduledTaskApi } from "@/apis"
import MagicModal, { MagicModalProps } from "@/components/base/MagicModal"
import { PageParams } from "@/types/other"
import { ScheduledTask } from "@/types/scheduledTask"
import { useMemoizedFn, useMount, useRequest } from "ahooks"
import { Flex } from "antd"
import { IconExternalLink, IconLoader } from "@tabler/icons-react"
import { colorUsages } from "@/providers/ThemeProvider/colors"
import dayjs from "@/infrastructure/vendors/dayjs"
import { SHARE_WORKSPACE_ID } from "@/pages/superMagic/constants"
import { StatusTag } from "@dtyq/magic-admin/components"
import InfiniteList from "@/components/base/InfiniteList"
import { useModalStyles, useStyles } from "../styles"
import { useTranslation } from "react-i18next"
import { useState, type ReactNode } from "react"
import { generateProjectTopicUrl } from "@/pages/superMagic/utils/project"
import { useIsMobile } from "@/hooks/useIsMobile"

interface RunningRecordProps extends MagicModalProps {
	taskId: string
	onClose?: () => void
}

interface RecordRowProps {
	item: ScheduledTask.RunningRecord
	workspacePath: string
	statusNode: ReactNode
	onOpenWorkspace: (record: ScheduledTask.RunningRecord) => void
}

/** Builds the workspace / project / topic breadcrumb shown on each running record. */
function buildWorkspacePath(
	item: ScheduledTask.RunningRecord,
	tSuper: (key: string) => string,
): string {
	const workspaceName =
		item.workspace_id && item.workspace_id !== "0"
			? (item.workspace_id === SHARE_WORKSPACE_ID
					? tSuper("workspace.teamSharedWorkspace")
					: item.workspace_name) || tSuper("workspace.unnamedWorkspace")
			: tSuper("workspace.unnamedWorkspace")

	return [workspaceName, item.project_name, item.topic_name].filter(Boolean).join(" / ")
}

/** Renders the clickable workspace breadcrumb that opens the related project/topic. */
function WorkspacePathTag({
	item,
	workspacePath,
	onOpenWorkspace,
}: Pick<RecordRowProps, "item" | "workspacePath" | "onOpenWorkspace">) {
	const { styles } = useStyles()

	return (
		<Flex
			gap={4}
			align="center"
			className={styles.tag}
			onClick={() => onOpenWorkspace(item)}
			data-testid="running-record-path"
			data-path-layout="chip"
		>
			<span className={styles.ellipsisText}>{workspacePath}</span>
			<span className={styles.tagIcon}>
				<IconExternalLink size={14} color={colorUsages.text[2]} />
			</span>
		</Flex>
	)
}

/** Full-width mobile path bar that keeps the breadcrumb on one truncated line. */
function MobileWorkspacePath({
	item,
	workspacePath,
	onOpenWorkspace,
}: Pick<RecordRowProps, "item" | "workspacePath" | "onOpenWorkspace">) {
	const { styles } = useStyles()

	return (
		<div
			className={styles.mobilePath}
			onClick={() => onOpenWorkspace(item)}
			onKeyDown={(event) => {
				if (event.key === "Enter" || event.key === " ") {
					event.preventDefault()
					onOpenWorkspace(item)
				}
			}}
			role="button"
			tabIndex={0}
			data-testid="running-record-path"
			data-path-layout="bar"
		>
			<span className={styles.mobilePathText}>{workspacePath}</span>
			<span className={styles.tagIcon}>
				<IconExternalLink size={16} color={colorUsages.text[2]} />
			</span>
		</div>
	)
}

/** Desktop table row: time, info, and status stay in dedicated columns without overlapping. */
function DesktopRecordRow({ item, workspacePath, statusNode, onOpenWorkspace }: RecordRowProps) {
	const { styles } = useStyles()

	return (
		<Flex
			className={styles.itemWrapper}
			align="center"
			data-testid="running-record-item"
			data-layout="table"
		>
			<div className={styles.timeCol}>
				{dayjs(item.executed_at).format("YYYY/MM/DD HH:mm")}
			</div>
			<Flex vertical gap={4} className={styles.infoCol}>
				<span className={styles.taskName}>{item.task_name}</span>
				<WorkspacePathTag
					item={item}
					workspacePath={workspacePath}
					onOpenWorkspace={onOpenWorkspace}
				/>
			</Flex>
			<div className={styles.resultCol}>{statusNode}</div>
		</Flex>
	)
}

/**
 * Mobile stacked row: time and status share the first line, then title and path
 * occupy full width so the status badge cannot overlap the breadcrumb.
 */
function MobileRecordRow({ item, workspacePath, statusNode, onOpenWorkspace }: RecordRowProps) {
	const { styles } = useStyles()

	return (
		<div
			className={styles.mobileItemWrapper}
			data-testid="running-record-item"
			data-layout="stacked"
		>
			<div className={styles.mobileMetaRow}>
				<span className={styles.mobileTime}>
					{dayjs(item.executed_at).format("YYYY/MM/DD HH:mm")}
				</span>
				<div className={styles.mobileStatus}>{statusNode}</div>
			</div>
			<span className={styles.mobileTaskName}>{item.task_name}</span>
			<MobileWorkspacePath
				item={item}
				workspacePath={workspacePath}
				onOpenWorkspace={onOpenWorkspace}
			/>
		</div>
	)
}

function RunningRecordModal({ taskId, onClose, ...props }: RunningRecordProps) {
	const { t } = useTranslation("interface")
	const { t: tSuper } = useTranslation("super")
	const { styles } = useStyles()
	const { styles: modalStyles } = useModalStyles({ runningRecord: true })
	const isMobile = useIsMobile()
	const [open, setOpen] = useState(true)
	const [total, setTotal] = useState(30)
	const [list, setList] = useState<ScheduledTask.RunningRecord[]>([])
	const [params, setParams] = useState<Required<PageParams>>({
		page: 1,
		page_size: 10,
	})

	function onCancel() {
		setOpen(false)
		onClose?.()
	}

	const { runAsync: getData, loading } = useRequest(
		ScheduledTaskApi.getScheduledTaskRunningRecord,
		{
			manual: true,
			onSuccess: (response) => {
				setTotal(response.total)
				if (params.page === 1) setList(response.list)
				else setList((prevList) => [...prevList, ...response.list])
			},
		},
	)

	const goToWorkspace = useMemoizedFn((record: ScheduledTask.RunningRecord) => {
		const projectId = record.project_id && record.project_id !== "0" ? record.project_id : null
		const topicId = record.topic_id && record.topic_id !== "0" ? record.topic_id : null

		if (!projectId) return

		const url = generateProjectTopicUrl(projectId, topicId)
		window.open(url, "_blank")
	})

	useMount(() => {
		getData(taskId, params)
	})

	function loadMore() {
		if (list.length >= total) return
		const nextParams = {
			...params,
			page: params.page + 1,
		}
		setParams(nextParams)
		getData(taskId, nextParams)
	}

	function renderStatus(status: ScheduledTask.RunningRecordStatus) {
		switch (status) {
			case ScheduledTask.RunningRecordStatus.Success:
				return (
					<StatusTag color="success" className={styles.statusTag}>
						{t("accountPanel.timedTasks.success")}
					</StatusTag>
				)
			case ScheduledTask.RunningRecordStatus.Failed:
				return (
					<StatusTag color="error" className={styles.statusTag}>
						{t("accountPanel.timedTasks.failed")}
					</StatusTag>
				)
			default:
				return (
					<StatusTag color="processing" className={styles.statusTag}>
						{t("accountPanel.timedTasks.running")}
					</StatusTag>
				)
		}
	}

	return (
		<MagicModal
			className={modalStyles.modal}
			title={t("accountPanel.timedTasks.runningRecord")}
			centered
			open={open}
			onCancel={onCancel}
			width={700}
			height={500}
			footer={null}
			destroyOnClose
			{...props}
		>
			<Flex vertical>
				{isMobile ? null : (
					<Flex
						className={styles.headerWrapper}
						align="center"
						data-testid="running-record-header"
					>
						<span className={styles.timeCol}>
							{t("accountPanel.timedTasks.runningTime")}
						</span>
						<span className={styles.infoCol}>
							{t("accountPanel.timedTasks.runningInfo")}
						</span>
						<span className={styles.resultCol}>
							{t("accountPanel.timedTasks.runningResult")}
						</span>
					</Flex>
				)}
				<InfiniteList<ScheduledTask.RunningRecord>
					list={list}
					hasMore={list.length < total}
					isLoading={loading}
					grid={{ column: 1 }}
					loadMore={loadMore}
					itemClassName={isMobile ? styles.mobileListItem : styles.listItem}
					wrapperClassName={isMobile ? styles.mobileListWrapper : styles.listWrapper}
					loadingComponent={
						<Flex justify="center" align="center" gap={4} className={styles.footer}>
							<IconLoader size={20} />
							<span>{t("accountPanel.timedTasks.loading")}...</span>
						</Flex>
					}
					endMessageComponent={
						<Flex justify="center" align="center" gap={10} className={styles.footer}>
							<span>——————</span>
							<span>{t("accountPanel.timedTasks.noMore")}</span>
							<span>——————</span>
						</Flex>
					}
					renderItem={(item) => {
						const workspacePath = buildWorkspacePath(item, tSuper)
						const rowProps: RecordRowProps = {
							item,
							workspacePath,
							statusNode: renderStatus(item.status),
							onOpenWorkspace: goToWorkspace,
						}

						return isMobile ? (
							<MobileRecordRow
								key={`${item.task_name}-${workspacePath}`}
								{...rowProps}
							/>
						) : (
							<DesktopRecordRow
								key={`${item.task_name}-${workspacePath}`}
								{...rowProps}
							/>
						)
					}}
				/>
			</Flex>
		</MagicModal>
	)
}

export default RunningRecordModal
