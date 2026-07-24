import { Database, Loader2, RefreshCw } from "lucide-react"
import { useCallback, useEffect, useMemo, useState } from "react"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"
import useSWR from "swr"
import { MagicBaseApi } from "@/apis"
import type { MagicBaseRow, MagicBaseSortRule } from "@/apis/modules/magicBase"
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@/components/shadcn-ui/alert-dialog"
import { Button } from "@/components/shadcn-ui/button"
import type { CollaboratorPermission } from "@/pages/superMagic/types/collaboration"
import type { MagicBaseCellSelection } from "./DataGrid"
import DatabaseTablePanel, { type DatabasePanelTab } from "./DatabaseTablePanel"
import PermissionEditorDialog, { type PermissionEditorTarget } from "./PermissionEditorDialog"
import RowEditorDialog from "./RowEditorDialog"
import TableList from "./TableList"
import {
	MAGIC_BASE_PAGE_SIZE,
	buildGridColumns,
	buildMagicBaseRowsRequest,
	getDefaultSort,
	getDisplayColumns,
	getEnabledColumns,
} from "./utils"

interface MicroAppDatabasePanelProps {
	active: boolean
	projectId?: string
	projectName?: string
	projectRole?: CollaboratorPermission
}

type RowEditorState =
	| {
			mode: "create"
			row?: null
	  }
	| {
			mode: "edit"
			row: MagicBaseRow
	  }

function getRowRecordId(row: MagicBaseRow): string {
	return String(row.id ?? row.record_id ?? "")
}

export default function MicroAppDatabasePanel({
	active,
	projectId,
	projectName,
	projectRole,
}: MicroAppDatabasePanelProps) {
	const { t } = useTranslation("super")
	const [selectedTableId, setSelectedTableId] = useState<string | null>(null)
	const [activeTab, setActiveTab] = useState<DatabasePanelTab>("data")
	const [page, setPage] = useState(1)
	const [sort, setSort] = useState<MagicBaseSortRule | null>(null)
	const [permissionEditor, setPermissionEditor] = useState<{
		tableId: string
		target: PermissionEditorTarget
	} | null>(null)
	const [selectedCells, setSelectedCells] = useState<MagicBaseCellSelection>({
		rowIds: [],
		columnIds: [],
		columnKeys: [],
	})
	const [rowEditor, setRowEditor] = useState<RowEditorState | null>(null)
	const [deleteSelection, setDeleteSelection] = useState<MagicBaseCellSelection | null>(null)
	const [deletingRows, setDeletingRows] = useState(false)

	const {
		data: tables = [],
		error: tablesError,
		isLoading: tablesLoading,
		mutate: refreshTables,
	} = useSWR(
		active && projectId ? ["magicbase", "tables", projectId] : null,
		([, , currentProjectId]) => MagicBaseApi.getTables(currentProjectId),
	)

	useEffect(() => {
		if (!active) return
		if (tables.length === 0) {
			setSelectedTableId(null)
			return
		}

		const selectedTableExists = tables.some((table) => table.id === selectedTableId)
		if (selectedTableExists) return

		const firstEnabledTable = tables.find((table) => table.status !== "disabled") || tables[0]
		setSelectedTableId(firstEnabledTable.id)
	}, [active, selectedTableId, tables])

	const {
		data: selectedTable,
		error: tableError,
		isLoading: tableLoading,
		mutate: refreshTable,
	} = useSWR(
		active && projectId && selectedTableId
			? ["magicbase", "table", projectId, selectedTableId]
			: null,
		([, , currentProjectId, currentTableId]) =>
			MagicBaseApi.getTable(currentProjectId, currentTableId),
	)

	useEffect(() => {
		setPage(1)
		setSort(getDefaultSort())
	}, [selectedTable?.id])

	const rowsRequest = useMemo(
		() => buildMagicBaseRowsRequest({ table: selectedTable, sort, page }),
		[selectedTable, sort, page],
	)

	const {
		data: rowsData,
		error: rowsError,
		isLoading: rowsLoading,
		mutate: refreshRows,
	} = useSWR(
		active && projectId && selectedTableId && selectedTable
			? ["magicbase", "rows", projectId, selectedTableId, rowsRequest]
			: null,
		([, , currentProjectId, currentTableId, currentRowsRequest]) =>
			MagicBaseApi.queryRows(currentProjectId, currentTableId, currentRowsRequest),
		{ keepPreviousData: true },
	)

	const {
		data: permissions,
		isLoading: permissionsLoading,
		mutate: refreshPermissions,
	} = useSWR(
		active && projectId && selectedTableId && selectedTable
			? ["magicbase", "permissions", projectId, selectedTableId]
			: null,
		([, , currentProjectId, currentTableId]) =>
			MagicBaseApi.getPermissions(currentProjectId, currentTableId),
	)

	const rows = useMemo(() => rowsData?.list || [], [rowsData?.list])
	const total = rowsData?.total || 0
	const totalPages = Math.max(1, Math.ceil(total / MAGIC_BASE_PAGE_SIZE))
	const gridColumns = useMemo(() => buildGridColumns(selectedTable, rows), [rows, selectedTable])
	const displayColumns = useMemo(() => getDisplayColumns(selectedTable), [selectedTable])

	const handleSelectTable = (tableId: string) => {
		setSelectedTableId(tableId)
		setActiveTab("data")
		setPage(1)
		setSelectedCells({ rowIds: [], columnIds: [], columnKeys: [] })
	}

	const handleSortChange = (field: string) => {
		setPage(1)
		setSort((current) => {
			if (current?.field !== field) return { field, order: "asc" }
			return { field, order: current.order === "asc" ? "desc" : "asc" }
		})
	}

	const handleOpenTablePermissions = (tableId: string) => {
		setPermissionEditor({ tableId, target: { mode: "table" } })
	}

	const handleOpenRowPermissions = (selection: MagicBaseCellSelection) => {
		if (!selectedTableId || selection.rowIds.length === 0) return
		setPermissionEditor({
			tableId: selectedTableId,
			target: { mode: "row", rowIds: selection.rowIds },
		})
	}

	const handleOpenColumnPermissions = (selection: MagicBaseCellSelection) => {
		if (!selectedTableId || selection.columnKeys.length === 0) return
		const selectedColumnKeys = new Set(selection.columnKeys)
		const resolvedColumnIds = getEnabledColumns(selectedTable)
			.filter((column) => selectedColumnKeys.has(column.column_key))
			.map((column) => column.id)
			.filter(Boolean)
		const columnIds = [...new Set([...selection.columnIds, ...resolvedColumnIds])]
		setPermissionEditor({
			tableId: selectedTableId,
			target: {
				mode: "column",
				columnIds,
				columnKeys: selection.columnKeys,
			},
		})
	}

	const findRowById = useCallback(
		(recordId: string) => rows.find((row) => getRowRecordId(row) === recordId) || null,
		[rows],
	)

	const handleCreateRow = () => {
		setActiveTab("data")
		setRowEditor({ mode: "create", row: null })
	}

	const handleOpenEditRow = (recordId: string) => {
		const row = findRowById(recordId)
		if (!row) return
		setRowEditor({ mode: "edit", row })
	}

	const handleEditSelectedRow = () => {
		if (selectedCells.rowIds.length !== 1) return
		handleOpenEditRow(selectedCells.rowIds[0])
	}

	const handleRequestDeleteRows = (selection: MagicBaseCellSelection) => {
		if (selection.rowIds.length === 0) return
		setDeleteSelection(selection)
	}

	const handleDeleteSelectedRows = () => {
		handleRequestDeleteRows(selectedCells)
	}

	const confirmDeleteRows = async () => {
		if (!projectId || !selectedTableId || !deleteSelection?.rowIds.length) return
		setDeletingRows(true)
		try {
			await MagicBaseApi.batchDeleteRows(projectId, selectedTableId, {
				record_ids: deleteSelection.rowIds,
			})
			toast.success(
				t("microAppPage.databasePanel.rowDeleteSuccess", {
					total: deleteSelection.rowIds.length,
				}),
			)
			setSelectedCells({ rowIds: [], columnIds: [], columnKeys: [] })
			setDeleteSelection(null)
			refreshRows()
			refreshPermissions()
		} catch {
			toast.error(t("microAppPage.databasePanel.rowDeleteFailed"))
		} finally {
			setDeletingRows(false)
		}
	}

	const handleRefresh = () => {
		refreshTables()
		refreshTable()
		refreshRows()
		refreshPermissions()
	}

	const enabledColumns = getEnabledColumns(selectedTable)
	const canManagePermissions = !projectRole || projectRole === "owner" || projectRole === "manage"
	const editorTable =
		permissionEditor?.tableId === selectedTable?.id
			? selectedTable
			: tables.find((table) => table.id === permissionEditor?.tableId) || null
	const subtitle = selectedTable
		? `${enabledColumns.length} ${t("microAppPage.databasePanel.columns")}`
		: projectName || ""
	const canEditSelectedRow = selectedCells.rowIds.length === 1
	const canDeleteSelectedRows = selectedCells.rowIds.length > 0
	const selectionResetKey = `${selectedTableId || ""}:${page}:${sort?.field || ""}:${
		sort?.order || ""
	}`

	return (
		<section
			className="flex h-full min-h-0 flex-col overflow-hidden bg-background"
			data-testid="micro-app-database-panel"
		>
			<header className="border-b border-border px-4 py-3">
				<div className="flex min-w-0 items-center gap-3">
					<div className="flex size-8 shrink-0 items-center justify-center rounded-md border border-border bg-muted">
						<Database className="size-4 text-muted-foreground" />
					</div>
					<div className="min-w-0 flex-1">
						<h2 className="truncate text-sm font-semibold text-foreground">
							{t("microAppPage.databasePanel.title")}
						</h2>
						<p className="truncate text-xs text-muted-foreground">{subtitle}</p>
					</div>
					<Button
						type="button"
						variant="outline"
						size="sm"
						className="h-8 gap-2"
						onClick={handleRefresh}
						disabled={!projectId}
					>
						<RefreshCw className="size-3.5" />
						{t("microAppPage.databasePanel.refresh")}
					</Button>
				</div>
			</header>

			<div className="flex min-h-0 flex-1">
				<TableList
					tables={tables}
					selectedTableId={selectedTableId}
					loading={tablesLoading}
					error={tablesError}
					onSelect={handleSelectTable}
					canManagePermissions={canManagePermissions}
					onOpenTablePermissions={handleOpenTablePermissions}
					onRetry={() => refreshTables()}
				/>

				<section className="flex min-w-0 flex-1 flex-col">
					{!selectedTableId && !tablesLoading && !tablesError ? (
						<div className="flex h-full items-center justify-center text-sm text-muted-foreground">
							{t("microAppPage.databasePanel.noTables")}
						</div>
					) : null}

					<DatabaseTablePanel
						projectId={projectId}
						selectedTableId={selectedTableId}
						selectedTable={selectedTable}
						tableError={tableError}
						tableLoading={tableLoading}
						activeTab={activeTab}
						rows={rows}
						rowsError={rowsError}
						rowsLoading={rowsLoading}
						gridColumns={gridColumns}
						displayColumns={displayColumns}
						sort={sort}
						selectionResetKey={selectionResetKey}
						permissions={permissions}
						permissionsLoading={permissionsLoading}
						total={total}
						page={page}
						totalPages={totalPages}
						canEditSelectedRow={canEditSelectedRow}
						canDeleteSelectedRows={canDeleteSelectedRows}
						canManagePermissions={canManagePermissions}
						onTabChange={setActiveTab}
						onCreateRow={handleCreateRow}
						onEditSelectedRow={handleEditSelectedRow}
						onDeleteSelectedRows={handleDeleteSelectedRows}
						onSortChange={handleSortChange}
						onSelectionChange={setSelectedCells}
						onOpenEditRow={handleOpenEditRow}
						onRequestDeleteRows={handleRequestDeleteRows}
						onOpenRowPermissions={handleOpenRowPermissions}
						onOpenColumnPermissions={handleOpenColumnPermissions}
						onRefreshTable={() => refreshTable()}
						onRefreshRows={() => refreshRows()}
						onRefreshPermissions={() => refreshPermissions()}
						onPageChange={setPage}
					/>
				</section>
			</div>
			<PermissionEditorDialog
				open={Boolean(permissionEditor)}
				projectId={projectId || ""}
				table={editorTable}
				target={permissionEditor?.target || null}
				permissions={permissions}
				onOpenChange={(nextOpen) => {
					if (!nextOpen) setPermissionEditor(null)
				}}
				onSaved={() => refreshPermissions()}
			/>
			<RowEditorDialog
				open={Boolean(rowEditor)}
				mode={rowEditor?.mode || "create"}
				projectId={projectId || ""}
				table={selectedTable || null}
				row={rowEditor?.mode === "edit" ? rowEditor.row : null}
				onOpenChange={(nextOpen) => {
					if (!nextOpen) setRowEditor(null)
				}}
				onSaved={() => {
					refreshRows()
					refreshTable()
				}}
			/>
			<AlertDialog
				open={Boolean(deleteSelection)}
				onOpenChange={(nextOpen) => {
					if (!nextOpen && !deletingRows) setDeleteSelection(null)
				}}
			>
				<AlertDialogContent style={{ zIndex: 1302 }}>
					<AlertDialogHeader>
						<AlertDialogTitle>
							{t("microAppPage.databasePanel.rowDeleteTitle")}
						</AlertDialogTitle>
						<AlertDialogDescription>
							{t("microAppPage.databasePanel.rowDeleteDescription", {
								total: deleteSelection?.rowIds.length || 0,
							})}
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel disabled={deletingRows}>
							{t("common.cancel")}
						</AlertDialogCancel>
						<AlertDialogAction
							variant="destructive"
							disabled={deletingRows}
							onClick={(event) => {
								event.preventDefault()
								confirmDeleteRows()
							}}
						>
							{deletingRows ? <Loader2 className="size-4 animate-spin" /> : null}
							{t("microAppPage.databasePanel.rowDeleteConfirm")}
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</section>
	)
}
