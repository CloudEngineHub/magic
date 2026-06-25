import { memo, useEffect } from "react"
import { SharedResourceType, type FileShareItem, type SharedTopicFilterStatus } from "../types"
import { useShareData } from "../hooks/useShareData"
import FileShareListNew from "./FileShareListNew"
import type { FileShareUiConfig } from "../../Share/types"

export interface FileShareManagementListCoreProps {
	projectId: string
	filterStatus: SharedTopicFilterStatus
	currentPage: number
	pageSize?: number
	onTotalPagesChange?: (totalPages: number) => void
	fileShareUiConfig?: FileShareUiConfig
}

/** Reuses the generic file-share data and row actions while leaving shell layout to callers. */
function FileShareManagementListCore({
	projectId,
	filterStatus,
	currentPage,
	pageSize = 10,
	onTotalPagesChange,
	fileShareUiConfig,
}: FileShareManagementListCoreProps) {
	const { data, total, loading, refreshData, cancelShare } = useShareData({
		resourceType: SharedResourceType.File,
		filterStatus,
		searchText: "",
		projectId,
		currentPage,
		pageSize,
		enabled: Boolean(projectId),
	})

	useEffect(() => {
		// Keep pagination ownership in the caller so each scene can compose its own shell controls.
		onTotalPagesChange?.(Math.ceil(total / pageSize))
	}, [onTotalPagesChange, pageSize, total])

	return (
		<div className="h-full" data-testid="file-share-management-list-core">
			<FileShareListNew
				data={data as FileShareItem[]}
				loading={loading}
				onCancelShare={cancelShare}
				onRefresh={refreshData}
				fileShareUiConfig={fileShareUiConfig}
			/>
		</div>
	)
}

export default memo(FileShareManagementListCore)
