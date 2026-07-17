import { memo, useEffect, useState } from "react"
import { useTranslation } from "react-i18next"
import MagicModal from "@/components/base/MagicModal"
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/shadcn-ui/select"
import FileShareManagementListCore from "@/pages/superMagic/components/ShareManagement/components/FileShareManagementListCore"
import ShareListFooter from "@/pages/superMagic/components/ShareManagement/components/ShareListFooter"
import { SharedTopicFilterStatus } from "@/pages/superMagic/components/ShareManagement/types"
import { createRecordingShareUiConfig } from "@/pages/superMagic/components/Share/utils/recordingShareUiConfig"

export interface RecordingShareManagementDialogProps {
	open: boolean
	projectId: string
	onClose: () => void
}

const PAGE_SIZE = 10

/** Status choices supported by the existing share-management list API. */
const STATUS_OPTIONS = [
	SharedTopicFilterStatus.Active,
	SharedTopicFilterStatus.Expired,
	SharedTopicFilterStatus.Cancelled,
]
const RECORDING_SHARE_UI_CONFIG = createRecordingShareUiConfig()

/** PC recording-only share-management shell; the global share manager keeps its original tabs. */
function RecordingShareManagementDialog({
	open,
	projectId,
	onClose,
}: RecordingShareManagementDialogProps) {
	const { t: tAudio } = useTranslation("audioRecordings")
	const { t: tSuper } = useTranslation("super")
	const [filterStatus, setFilterStatus] = useState<SharedTopicFilterStatus>(
		SharedTopicFilterStatus.Active,
	)
	const [currentPage, setCurrentPage] = useState(1)
	const [totalPages, setTotalPages] = useState(0)

	useEffect(() => {
		// Reset scene-local filters when the dialog is reopened for another recording project.
		if (!open) return
		setFilterStatus(SharedTopicFilterStatus.Active)
		setCurrentPage(1)
	}, [open, projectId])

	/** Applies the only recording-share filter and returns pagination to the first page. */
	function handleStatusChange(value: string) {
		setFilterStatus(value as SharedTopicFilterStatus)
		setCurrentPage(1)
	}

	/** Keeps footer pagination aligned with the shared file-share list response total. */
	function handleTotalPagesChange(nextTotalPages: number) {
		setTotalPages(nextTotalPages)
		if (nextTotalPages > 0 && currentPage > nextTotalPages) {
			setCurrentPage(nextTotalPages)
		}
	}

	/** Resolves status labels with literal i18n keys so static extraction remains reliable. */
	function getStatusLabel(status: SharedTopicFilterStatus) {
		switch (status) {
			case SharedTopicFilterStatus.Expired:
				return tSuper("shareManagement.filterStatus.expired")
			case SharedTopicFilterStatus.Cancelled:
				return tSuper("shareManagement.filterStatus.cancelled")
			case SharedTopicFilterStatus.Active:
			default:
				return tSuper("shareManagement.filterStatus.active")
		}
	}

	return (
		<MagicModal
			title={tAudio("detail.shareManagementTitle")}
			open={open}
			onCancel={onClose}
			width={700}
			footer={null}
			centered
			zIndex={1200}
			classNames={{
				header: "!px-4 !py-4",
				body: "!p-0",
			}}
			maskClosable={false}
		>
			<div
				className="flex h-[512px] flex-col"
				data-testid="recording-share-management-dialog"
			>
				<div className="flex justify-end px-3 pb-3 pt-5">
					<div
						className="flex flex-shrink-0 items-center gap-2"
						data-testid="recording-share-management-status-filter"
					>
						<span className="text-sm font-medium leading-none text-gray-900">
							{tAudio("detail.shareStatusFilter")}
						</span>
						<Select value={filterStatus} onValueChange={handleStatusChange}>
							<SelectTrigger
								className="w-[140px] text-left"
								data-testid="recording-share-management-status-select"
							>
								<SelectValue />
							</SelectTrigger>
							<SelectContent align="start" style={{ zIndex: 1300 }}>
								{STATUS_OPTIONS.map((status) => (
									<SelectItem
										key={status}
										value={status}
										data-testid={`recording-share-management-status-${status}`}
									>
										{getStatusLabel(status)}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</div>
				</div>

				<div className="flex-1 overflow-y-auto px-3" style={{ maxHeight: "388px" }}>
					<FileShareManagementListCore
						projectId={projectId}
						filterStatus={filterStatus}
						currentPage={currentPage}
						pageSize={PAGE_SIZE}
						onTotalPagesChange={handleTotalPagesChange}
						fileShareUiConfig={RECORDING_SHARE_UI_CONFIG}
					/>
				</div>

				<div className="mt-auto">
					<ShareListFooter
						currentPage={currentPage}
						totalPages={totalPages}
						onPageChange={setCurrentPage}
					/>
				</div>
			</div>
		</MagicModal>
	)
}

export default memo(RecordingShareManagementDialog)
