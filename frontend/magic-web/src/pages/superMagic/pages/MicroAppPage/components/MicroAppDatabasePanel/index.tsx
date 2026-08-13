import { Database, Info, Loader2, X } from "lucide-react"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"
import useSWR from "swr"
import { MagicBaseApi } from "@/apis"
import type { MagicBaseFilterGroup, MagicBaseSortRule } from "@/apis/modules/magicBase"
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
import { MicroAppDatabaseEmptyIllustration } from "@/pages/superMagic/components/MicroAppStateIllustration"
import type { CollaboratorPermission } from "@/pages/superMagic/types/collaboration"
import { STATIC_DATABASE_PERMISSIONS_ENABLED } from "../databasePermissionFeatures"
import type { MagicBaseCellSelection } from "./DataGrid"
import DatabaseTablePanel from "./DatabaseTablePanel"
import { DATABASE_INTRO_DISMISSED_KEY, getRowRecordId, type RowEditorState } from "./panelState"
import PermissionEditorDialog, { type PermissionEditorTarget } from "./PermissionEditorDialog"
import RowEditorDialog from "./RowEditorDialog"
import TableList, { TableListToggle } from "./TableList"
import useDatabaseGridSelection from "./useDatabaseGridSelection"
import useDatabaseRefresh from "./useDatabaseRefresh"
import useDatabaseSidePanel from "./useDatabaseSidePanel"
import useMagicBaseRows from "./useMagicBaseRows"
import {
	buildGridColumns,
	createEmptyMagicBaseFilter,
	getDefaultSort,
	getDisplayColumns,
	getEnabledColumns,
} from "./utils"

interface MicroAppDatabasePanelProps {
	active: boolean
	projectId?: string
	projectRole?: CollaboratorPermission
}

export default function MicroAppDatabasePanel({
	active,
	projectId,
	projectRole,
}: MicroAppDatabasePanelProps) {
	const { t } = useTranslation("super")
	const [selectedTableId, setSelectedTableId] = useState<string | null>(null)
	const [tableListCollapsed, setTableListCollapsed] = useState(false)
	const [showSystemFields, setShowSystemFields] = useState(false)
	const [introDismissed, setIntroDismissed] = useState(
		() =>
			typeof window !== "undefined" &&
			window.localStorage.getItem(DATABASE_INTRO_DISMISSED_KEY) === "1",
	)
	const tableListModeRef = useRef<"auto" | "manual">("auto")
	const [sort, setSort] = useState<MagicBaseSortRule | null>(null)
	const [filter, setFilter] = useState<MagicBaseFilterGroup>(createEmptyMagicBaseFilter)
	const [permissionEditor, setPermissionEditor] = useState<{
		tableId: string
		target: PermissionEditorTarget
	} | null>(null)
	const [rowEditor, setRowEditor] = useState<RowEditorState | null>(null)
	const [deleteSelection, setDeleteSelection] = useState<MagicBaseCellSelection | null>(null)
	const [deletingRows, setDeletingRows] = useState(false)
	const {
		selectedCells,
		setSelectedCells,
		selectionResetVersion,
		clearSelection: handleClearSelection,
		handlePanelMouseDown,
	} = useDatabaseGridSelection()
	const { resetSidePanel, ...sidePanel } = useDatabaseSidePanel()

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

	useEffect(() => {
		tableListModeRef.current = "auto"
		setTableListCollapsed(false)
		setShowSystemFields(false)
		setFilter(createEmptyMagicBaseFilter())
		resetSidePanel()
	}, [projectId, resetSidePanel])

	// 单表不需要持续占用分类栏；用户手动操作后不再用自动规则覆盖其选择。
	useEffect(() => {
		if (!active || tablesLoading || tableListModeRef.current === "manual") return
		setTableListCollapsed(tables.length === 1)
	}, [active, tables.length, tablesLoading])

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
		setSort(getDefaultSort())
	}, [selectedTable?.id])

	const {
		rows,
		total,
		totalKnown,
		hasMore: hasMoreRows,
		loadingMore: loadingMoreRows,
		error: rowsError,
		isLoading: rowsLoading,
		loadMore: handleLoadMoreRows,
		refresh: refreshRows,
	} = useMagicBaseRows({
		active,
		projectId,
		tableId: selectedTableId,
		table: selectedTable,
		sort,
		filter,
	})

	const {
		data: permissions,
		isLoading: permissionsLoading,
		mutate: refreshPermissions,
	} = useSWR(
		STATIC_DATABASE_PERMISSIONS_ENABLED &&
			active &&
			projectId &&
			selectedTableId &&
			selectedTable
			? ["magicbase", "permissions", projectId, selectedTableId]
			: null,
		([, , currentProjectId, currentTableId]) =>
			MagicBaseApi.getPermissions(currentProjectId, currentTableId),
	)
	const { refreshing, refresh: handleRefresh } = useDatabaseRefresh({
		refreshTables,
		refreshTable,
		refreshRows,
		refreshPermissions: STATIC_DATABASE_PERMISSIONS_ENABLED ? refreshPermissions : undefined,
	})

	const gridColumns = useMemo(
		() => buildGridColumns(selectedTable, rows, showSystemFields),
		[rows, selectedTable, showSystemFields],
	)
	const displayColumns = useMemo(() => getDisplayColumns(selectedTable), [selectedTable])

	const handleSelectTable = (tableId: string) => {
		sidePanel.runWithPermissionGuard(() => {
			setSelectedTableId(tableId)
			resetSidePanel()
			handleClearSelection()
			setFilter(createEmptyMagicBaseFilter())
		})
	}

	const handleSortChange = (field: string) => {
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
		sidePanel.runWithPermissionGuard(() => {
			resetSidePanel()
			setRowEditor({ mode: "create", row: null })
		})
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

	const handleFilterChange = (nextFilter: MagicBaseFilterGroup) => {
		setFilter(nextFilter)
		handleClearSelection()
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
			handleClearSelection()
			setDeleteSelection(null)
			refreshRows()
			refreshPermissions()
		} catch {
			toast.error(t("microAppPage.databasePanel.rowDeleteFailed"))
		} finally {
			setDeletingRows(false)
		}
	}

	const handleToggleTableList = () => {
		tableListModeRef.current = "manual"
		setTableListCollapsed((collapsed) => !collapsed)
	}

	const handleDismissIntro = () => {
		setIntroDismissed(true)
		window.localStorage.setItem(DATABASE_INTRO_DISMISSED_KEY, "1")
	}

	const canManagePermissions = !projectRole || projectRole === "owner" || projectRole === "manage"
	const canManageStaticPermissions = STATIC_DATABASE_PERMISSIONS_ENABLED && canManagePermissions
	const editorTable =
		permissionEditor?.tableId === selectedTable?.id
			? selectedTable
			: tables.find((table) => table.id === permissionEditor?.tableId) || null
	const canEditSelectedRow = selectedCells.rowIds.length === 1
	const canDeleteSelectedRows = selectedCells.rowIds.length > 0
	const tableListToggleLabel = tableListCollapsed
		? t("microAppPage.databasePanel.expandTableList")
		: t("microAppPage.databasePanel.collapseTableList")
	const selectionResetKey = `${selectedTableId || ""}:${sort?.field || ""}:${
		sort?.order || ""
	}:${selectionResetVersion}`
	return (
		<section
			className="flex h-full min-h-0 flex-col overflow-hidden bg-muted/30"
			data-testid="micro-app-database-panel"
			onMouseDown={handlePanelMouseDown}
		>
			<header className="border-b border-border/60 bg-gradient-to-r from-background via-background to-primary/[0.04] px-5 py-3.5">
				<div className="flex min-w-0 items-center gap-3">
					<div className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-primary/15 bg-primary/10 shadow-sm">
						<Database className="size-4.5 text-primary" />
					</div>
					<div className="min-w-0 flex-1">
						<h2 className="truncate text-base font-semibold text-foreground">
							{t("microAppPage.databasePanel.title")}
						</h2>
						<p className="mt-0.5 truncate text-xs text-muted-foreground">
							{t("microAppPage.databasePanel.description")}
						</p>
					</div>
				</div>
			</header>
			{!introDismissed ? (
				<div className="flex items-center gap-2.5 border-b border-primary/10 bg-primary/[0.04] px-5 py-2 text-xs text-foreground/75">
					<Info className="size-3.5 shrink-0 text-primary" />
					<span className="min-w-0 flex-1">{t("microAppPage.databasePanel.intro")}</span>
					<Button
						type="button"
						variant="ghost"
						size="icon"
						className="size-6 shrink-0 text-muted-foreground hover:bg-primary/10 hover:text-foreground"
						aria-label={t("microAppPage.databasePanel.dismissIntro")}
						onClick={handleDismissIntro}
					>
						<X className="size-4" />
					</Button>
				</div>
			) : null}

			<div className="relative flex min-h-0 flex-1 overflow-hidden bg-background shadow-sm">
				{tableListCollapsed ? (
					<TableListToggle
						collapsed
						label={tableListToggleLabel}
						onToggle={handleToggleTableList}
						className="absolute left-0 top-[14px] z-20 size-7 rounded-l-none border border-l-0 border-border/70 bg-background shadow-sm hover:bg-primary/5"
						data-testid="magicbase-table-list-floating-toggle"
					/>
				) : (
					<TableList
						tables={tables}
						selectedTableId={selectedTableId}
						loading={tablesLoading}
						error={tablesError}
						onSelect={handleSelectTable}
						canManagePermissions={canManageStaticPermissions}
						onOpenTablePermissions={handleOpenTablePermissions}
						onRetry={() => refreshTables()}
						onToggle={handleToggleTableList}
					/>
				)}

				<section className="flex min-w-0 flex-1 flex-col">
					{!selectedTableId && !tablesLoading && !tablesError ? (
						<div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center text-sm text-muted-foreground">
							<MicroAppDatabaseEmptyIllustration size="md" />
							<p>{t("microAppPage.databasePanel.noTables")}</p>
						</div>
					) : null}

					<DatabaseTablePanel
						projectId={projectId}
						selectedTableId={selectedTableId}
						selectedTable={selectedTable}
						tableError={tableError}
						tableLoading={tableLoading}
						tableListCollapsed={tableListCollapsed}
						activeSidePanel={sidePanel.activeSidePanel}
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
						totalKnown={totalKnown}
						loadedRowCount={rows.length}
						hasMoreRows={hasMoreRows}
						loadingMoreRows={loadingMoreRows}
						selectedRowCount={selectedCells.rowIds.length}
						canEditSelectedRow={canEditSelectedRow}
						canDeleteSelectedRows={canDeleteSelectedRows}
						canManagePermissions={canManagePermissions}
						canManageStaticPermissions={canManageStaticPermissions}
						refreshing={refreshing}
						showSystemFields={showSystemFields}
						filter={filter}
						onSidePanelChange={sidePanel.requestSidePanelChange}
						permissionDiscardConfirmOpen={sidePanel.discardConfirmOpen}
						onPermissionDirtyChange={sidePanel.setPermissionDirty}
						onDiscardPermissionChanges={sidePanel.discardPermissionChanges}
						onContinueEditingPermissions={sidePanel.continueEditing}
						onShowSystemFieldsChange={setShowSystemFields}
						onCreateRow={handleCreateRow}
						onEditSelectedRow={handleEditSelectedRow}
						onDeleteSelectedRows={handleDeleteSelectedRows}
						onSortChange={handleSortChange}
						onSelectionChange={setSelectedCells}
						onClearSelection={handleClearSelection}
						onFilterChange={handleFilterChange}
						onLoadMoreRows={handleLoadMoreRows}
						onOpenEditRow={handleOpenEditRow}
						onRequestDeleteRows={handleRequestDeleteRows}
						onOpenRowPermissions={handleOpenRowPermissions}
						onOpenColumnPermissions={handleOpenColumnPermissions}
						onRefreshTable={() => refreshTable()}
						onRefreshRows={() => refreshRows()}
						onRefreshPermissions={() => refreshPermissions()}
						onRefresh={() => void handleRefresh()}
					/>
				</section>
			</div>
			{STATIC_DATABASE_PERMISSIONS_ENABLED ? (
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
			) : null}
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
