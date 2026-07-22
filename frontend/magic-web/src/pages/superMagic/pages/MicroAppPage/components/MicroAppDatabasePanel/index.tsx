import { Database, Loader2, Pencil, Plus, RefreshCw, Trash2, X } from "lucide-react"
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
import { ScrollArea, ScrollBar } from "@/components/shadcn-ui/scroll-area"
import { Separator } from "@/components/shadcn-ui/separator"
import {
	Sheet,
	SheetClose,
	SheetContent,
	SheetDescription,
	SheetHeader,
	SheetTitle,
} from "@/components/shadcn-ui/sheet"
import { cn } from "@/lib/utils"
import type { CollaboratorPermission } from "@/pages/superMagic/types/collaboration"
import DataGrid, { type MagicBaseCellSelection } from "./DataGrid"
import PermissionEditorDialog, { type PermissionEditorTarget } from "./PermissionEditorDialog"
import PermissionPanel from "./PermissionPanel"
import RowEditorDialog from "./RowEditorDialog"
import StructureTable from "./StructureTable"
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
	open: boolean
	projectId?: string
	projectName?: string
	projectRole?: CollaboratorPermission
	onOpenChange: (open: boolean) => void
}

type PanelTab = "data" | "structure" | "permissions"

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
	open,
	projectId,
	projectName,
	projectRole,
	onOpenChange,
}: MicroAppDatabasePanelProps) {
	const { t } = useTranslation("super")
	const [selectedTableId, setSelectedTableId] = useState<string | null>(null)
	const [activeTab, setActiveTab] = useState<PanelTab>("data")
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
		open && projectId ? ["magicbase", "tables", projectId] : null,
		([, , currentProjectId]) => MagicBaseApi.getTables(currentProjectId),
	)

	useEffect(() => {
		if (!open) return
		if (tables.length === 0) {
			setSelectedTableId(null)
			return
		}

		const selectedTableExists = tables.some((table) => table.id === selectedTableId)
		if (selectedTableExists) return

		const firstEnabledTable = tables.find((table) => table.status !== "disabled") || tables[0]
		setSelectedTableId(firstEnabledTable.id)
	}, [open, selectedTableId, tables])

	const {
		data: selectedTable,
		error: tableError,
		isLoading: tableLoading,
		mutate: refreshTable,
	} = useSWR(
		open && projectId && selectedTableId
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
		open && projectId && selectedTableId && selectedTable
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
		open && projectId && selectedTableId && selectedTable
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
		? `${selectedTable.table_key} · ${enabledColumns.length} ${t("microAppPage.databasePanel.columns")}`
		: projectName || ""
	const canEditSelectedRow = selectedCells.rowIds.length === 1
	const canDeleteSelectedRows = selectedCells.rowIds.length > 0
	const selectionResetKey = `${selectedTableId || ""}:${page}:${sort?.field || ""}:${
		sort?.order || ""
	}`

	return (
		<Sheet open={open} onOpenChange={onOpenChange}>
			<SheetContent
				side="right"
				showClose={false}
				overlayClassName="bg-transparent"
				className="gap-0 p-0 sm:max-w-none"
				style={{ width: 1120, maxWidth: "calc(100vw - 48px)" }}
				data-testid="micro-app-database-panel"
			>
				<SheetHeader className="border-b border-border px-4 py-3">
					<div className="flex min-w-0 items-center gap-3">
						<div className="flex size-8 shrink-0 items-center justify-center rounded-md border border-border bg-muted">
							<Database className="size-4 text-muted-foreground" />
						</div>
						<div className="min-w-0 flex-1">
							<SheetTitle className="truncate text-sm">
								{t("microAppPage.databasePanel.title")}
							</SheetTitle>
							<SheetDescription className="truncate text-xs">
								{subtitle}
							</SheetDescription>
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
						<SheetClose asChild>
							<Button
								type="button"
								variant="ghost"
								size="icon-sm"
								aria-label={t("common.close")}
							>
								<X className="size-4" />
							</Button>
						</SheetClose>
					</div>
				</SheetHeader>

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

						{selectedTableId ? (
							<>
								<div className="border-b border-border px-4 py-3">
									<div className="flex min-w-0 items-start justify-between gap-4">
										<div className="min-w-0">
											<h3 className="truncate text-sm font-medium text-foreground">
												{selectedTable?.table_name ||
													t("microAppPage.databasePanel.loadingTable")}
											</h3>
											<p className="mt-1 truncate text-xs text-muted-foreground">
												{selectedTable?.description ||
													selectedTable?.table_key ||
													"-"}
											</p>
										</div>
										<div className="shrink-0 text-xs text-muted-foreground">
											{t("microAppPage.databasePanel.totalRows", { total })}
										</div>
									</div>
								</div>

								<div className="flex min-h-0 flex-1 flex-col">
									<div className="flex items-center justify-between border-b border-border px-4 py-2">
										<div
											role="tablist"
											className="inline-flex h-8 w-fit items-center justify-center rounded-lg bg-muted p-[3px] text-muted-foreground"
										>
											<button
												type="button"
												role="tab"
												aria-selected={activeTab === "data"}
												className={cn(
													"inline-flex h-7 items-center justify-center rounded-md px-2 py-1 text-xs text-foreground transition-colors",
													activeTab === "data" &&
														"bg-background shadow-sm",
												)}
												onClick={() => setActiveTab("data")}
											>
												{t("microAppPage.databasePanel.dataTab")}
											</button>
											<button
												type="button"
												role="tab"
												aria-selected={activeTab === "structure"}
												className={cn(
													"inline-flex h-7 items-center justify-center rounded-md px-2 py-1 text-xs text-foreground transition-colors",
													activeTab === "structure" &&
														"bg-background shadow-sm",
												)}
												onClick={() => setActiveTab("structure")}
											>
												{t("microAppPage.databasePanel.structureTab")}
											</button>
											<button
												type="button"
												role="tab"
												aria-selected={activeTab === "permissions"}
												className={cn(
													"inline-flex h-7 items-center justify-center rounded-md px-2 py-1 text-xs text-foreground transition-colors",
													activeTab === "permissions" &&
														"bg-background shadow-sm",
												)}
												onClick={() => setActiveTab("permissions")}
											>
												{t("microAppPage.databasePanel.permissionsTab")}
											</button>
										</div>
										{tableLoading ? (
											<span className="flex items-center gap-2 text-xs text-muted-foreground">
												<Loader2 className="size-3.5 animate-spin" />
												{t("microAppPage.databasePanel.loading")}
											</span>
										) : activeTab === "data" ? (
											<div className="flex items-center gap-2">
												<Button
													type="button"
													size="sm"
													variant="outline"
													className="h-8 gap-1.5"
													disabled={!selectedTable}
													onClick={handleCreateRow}
												>
													<Plus className="size-3.5" />
													{t("microAppPage.databasePanel.rowCreate")}
												</Button>
												<Button
													type="button"
													size="sm"
													variant="outline"
													className="h-8 gap-1.5"
													disabled={!canEditSelectedRow}
													onClick={handleEditSelectedRow}
												>
													<Pencil className="size-3.5" />
													{t("microAppPage.databasePanel.rowEdit")}
												</Button>
												<Button
													type="button"
													size="sm"
													variant="outline"
													className="h-8 gap-1.5 text-destructive hover:text-destructive"
													disabled={!canDeleteSelectedRows}
													onClick={handleDeleteSelectedRows}
												>
													<Trash2 className="size-3.5" />
													{t("microAppPage.databasePanel.rowDelete")}
												</Button>
											</div>
										) : null}
									</div>

									{tableError ? (
										<div className="flex flex-1 flex-col items-center justify-center gap-3 text-sm">
											<p className="text-destructive">
												{t("microAppPage.databasePanel.loadTableFailed")}
											</p>
											<Button
												type="button"
												size="sm"
												variant="outline"
												onClick={() => refreshTable()}
											>
												{t("microAppPage.databasePanel.retry")}
											</Button>
										</div>
									) : (
										<>
											{activeTab === "data" ? (
												<div className="min-h-0 flex-1">
													{rowsError ? (
														<div className="flex h-full flex-col items-center justify-center gap-3 text-sm">
															<p className="text-destructive">
																{t(
																	"microAppPage.databasePanel.loadRowsFailed",
																)}
															</p>
															<Button
																type="button"
																size="sm"
																variant="outline"
																onClick={() => refreshRows()}
															>
																{t(
																	"microAppPage.databasePanel.retry",
																)}
															</Button>
														</div>
													) : (
														<div className="h-full">
															<DataGrid
																columns={gridColumns}
																rows={rows}
																sort={sort}
																loading={
																	rowsLoading || tableLoading
																}
																selectionResetKey={
																	selectionResetKey
																}
																onSortChange={handleSortChange}
																onSelectionChange={setSelectedCells}
																onOpenEditRow={handleOpenEditRow}
																onDeleteRows={
																	handleRequestDeleteRows
																}
																canManagePermissions={
																	canManagePermissions
																}
																onOpenRowPermissions={
																	handleOpenRowPermissions
																}
																onOpenColumnPermissions={
																	handleOpenColumnPermissions
																}
															/>
														</div>
													)}
												</div>
											) : null}

											{activeTab === "structure" ? (
												<div className="min-h-0 flex-1">
													<ScrollArea className="h-full">
														<StructureTable columns={displayColumns} />
														<ScrollBar orientation="horizontal" />
													</ScrollArea>
												</div>
											) : null}

											{activeTab === "permissions" && selectedTable ? (
												<div className="min-h-0 flex-1">
													<PermissionPanel
														projectId={projectId || ""}
														table={selectedTable}
														permissions={permissions}
														loading={permissionsLoading}
														columns={displayColumns}
														canManagePermissions={canManagePermissions}
														onRefreshPermissions={() =>
															refreshPermissions()
														}
														onRefreshTable={() => {
															refreshTable()
															refreshTables()
														}}
													/>
												</div>
											) : null}
										</>
									)}
								</div>

								<Separator />
								<div className="flex h-12 shrink-0 items-center justify-between px-4 text-xs text-muted-foreground">
									<span>
										{t("microAppPage.databasePanel.pageInfo", {
											page,
											totalPages,
										})}
									</span>
									<div className="flex items-center gap-2">
										<Button
											type="button"
											size="sm"
											variant="outline"
											className="h-8"
											disabled={page <= 1}
											onClick={() =>
												setPage((current) => Math.max(1, current - 1))
											}
										>
											{t("microAppPage.databasePanel.previous")}
										</Button>
										<Button
											type="button"
											size="sm"
											variant="outline"
											className="h-8"
											disabled={page >= totalPages}
											onClick={() =>
												setPage((current) =>
													Math.min(totalPages, current + 1),
												)
											}
										>
											{t("microAppPage.databasePanel.next")}
										</Button>
									</div>
								</div>
							</>
						) : null}
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
			</SheetContent>
		</Sheet>
	)
}
