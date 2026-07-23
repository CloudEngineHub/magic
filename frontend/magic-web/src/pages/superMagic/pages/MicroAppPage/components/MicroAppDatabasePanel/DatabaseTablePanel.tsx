import { Loader2, Pencil, Plus, Trash2 } from "lucide-react"
import { useTranslation } from "react-i18next"

import type {
	MagicBaseColumn,
	MagicBasePermissionsResponse,
	MagicBaseRow,
	MagicBaseSortRule,
	MagicBaseTable,
} from "@/apis/modules/magicBase"
import { Button } from "@/components/shadcn-ui/button"
import { ScrollArea, ScrollBar } from "@/components/shadcn-ui/scroll-area"
import { Separator } from "@/components/shadcn-ui/separator"
import { cn } from "@/lib/utils"

import DataGrid, { type MagicBaseCellSelection } from "./DataGrid"
import PermissionPanel from "./PermissionPanel"
import StructureTable from "./StructureTable"
import type { MagicBaseGridColumn } from "./utils"

export type DatabasePanelTab = "data" | "structure" | "permissions"

interface DatabaseTablePanelProps {
	projectId?: string
	selectedTableId: string | null
	selectedTable?: MagicBaseTable
	tableError?: unknown
	tableLoading: boolean
	activeTab: DatabasePanelTab
	rows: MagicBaseRow[]
	rowsError?: unknown
	rowsLoading: boolean
	gridColumns: MagicBaseGridColumn[]
	displayColumns: MagicBaseColumn[]
	sort: MagicBaseSortRule | null
	selectionResetKey: string
	permissions?: MagicBasePermissionsResponse
	permissionsLoading: boolean
	total: number
	page: number
	totalPages: number
	canEditSelectedRow: boolean
	canDeleteSelectedRows: boolean
	canManagePermissions: boolean
	onTabChange: (tab: DatabasePanelTab) => void
	onCreateRow: () => void
	onEditSelectedRow: () => void
	onDeleteSelectedRows: () => void
	onSortChange: (field: string) => void
	onSelectionChange: (selection: MagicBaseCellSelection) => void
	onOpenEditRow: (recordId: string) => void
	onRequestDeleteRows: (selection: MagicBaseCellSelection) => void
	onOpenRowPermissions: (selection: MagicBaseCellSelection) => void
	onOpenColumnPermissions: (selection: MagicBaseCellSelection) => void
	onRefreshTable: () => void
	onRefreshRows: () => void
	onRefreshPermissions: () => void
	onPageChange: (page: number) => void
}

export default function DatabaseTablePanel({
	projectId,
	selectedTableId,
	selectedTable,
	tableError,
	tableLoading,
	activeTab,
	rows,
	rowsError,
	rowsLoading,
	gridColumns,
	displayColumns,
	sort,
	selectionResetKey,
	permissions,
	permissionsLoading,
	total,
	page,
	totalPages,
	canEditSelectedRow,
	canDeleteSelectedRows,
	canManagePermissions,
	onTabChange,
	onCreateRow,
	onEditSelectedRow,
	onDeleteSelectedRows,
	onSortChange,
	onSelectionChange,
	onOpenEditRow,
	onRequestDeleteRows,
	onOpenRowPermissions,
	onOpenColumnPermissions,
	onRefreshTable,
	onRefreshRows,
	onRefreshPermissions,
	onPageChange,
}: DatabaseTablePanelProps) {
	const { t } = useTranslation("super")

	if (!selectedTableId) return null

	return (
		<>
			<div className="border-b border-border px-4 py-3">
				<div className="flex min-w-0 items-start justify-between gap-4">
					<div className="min-w-0">
						<h3 className="truncate text-sm font-medium text-foreground">
							{selectedTable?.table_name ||
								t("microAppPage.databasePanel.loadingTable")}
						</h3>
						<p className="mt-1 truncate text-xs text-muted-foreground">
							{selectedTable?.description || selectedTable?.table_key || "-"}
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
						{(["data", "structure", "permissions"] as const).map((tab) => (
							<button
								key={tab}
								type="button"
								role="tab"
								aria-selected={activeTab === tab}
								className={cn(
									"inline-flex h-7 items-center justify-center rounded-md px-2 py-1 text-xs text-foreground transition-colors",
									activeTab === tab && "bg-background shadow-sm",
								)}
								onClick={() => onTabChange(tab)}
							>
								{tab === "data"
									? t("microAppPage.databasePanel.dataTab")
									: tab === "structure"
										? t("microAppPage.databasePanel.structureTab")
										: t("microAppPage.databasePanel.permissionsTab")}
							</button>
						))}
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
								onClick={onCreateRow}
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
								onClick={onEditSelectedRow}
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
								onClick={onDeleteSelectedRows}
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
						<Button type="button" size="sm" variant="outline" onClick={onRefreshTable}>
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
											{t("microAppPage.databasePanel.loadRowsFailed")}
										</p>
										<Button
											type="button"
											size="sm"
											variant="outline"
											onClick={onRefreshRows}
										>
											{t("microAppPage.databasePanel.retry")}
										</Button>
									</div>
								) : (
									<div className="h-full">
										<DataGrid
											columns={gridColumns}
											rows={rows}
											sort={sort}
											loading={rowsLoading || tableLoading}
											selectionResetKey={selectionResetKey}
											onSortChange={onSortChange}
											onSelectionChange={onSelectionChange}
											onOpenEditRow={onOpenEditRow}
											onDeleteRows={onRequestDeleteRows}
											canManagePermissions={canManagePermissions}
											onOpenRowPermissions={onOpenRowPermissions}
											onOpenColumnPermissions={onOpenColumnPermissions}
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
									onRefreshPermissions={onRefreshPermissions}
									onRefreshTable={onRefreshTable}
								/>
							</div>
						) : null}
					</>
				)}
			</div>

			<Separator />
			<div className="flex h-12 shrink-0 items-center justify-between px-4 text-xs text-muted-foreground">
				<span>{t("microAppPage.databasePanel.pageInfo", { page, totalPages })}</span>
				<div className="flex items-center gap-2">
					<Button
						type="button"
						size="sm"
						variant="outline"
						className="h-8"
						disabled={page <= 1}
						onClick={() => onPageChange(Math.max(1, page - 1))}
					>
						{t("microAppPage.databasePanel.previous")}
					</Button>
					<Button
						type="button"
						size="sm"
						variant="outline"
						className="h-8"
						disabled={page >= totalPages}
						onClick={() => onPageChange(Math.min(totalPages, page + 1))}
					>
						{t("microAppPage.databasePanel.next")}
					</Button>
				</div>
			</div>
		</>
	)
}
