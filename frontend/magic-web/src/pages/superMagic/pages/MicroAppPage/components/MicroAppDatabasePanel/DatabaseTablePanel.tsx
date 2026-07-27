import {
	ArrowLeft,
	Columns3Cog,
	Eye,
	Loader2,
	Pencil,
	Plus,
	RefreshCw,
	ShieldCheck,
	Trash2,
	X,
} from "lucide-react"
import { useTranslation } from "react-i18next"

import type {
	MagicBaseColumn,
	MagicBaseFilterGroup,
	MagicBasePermissionsResponse,
	MagicBaseRow,
	MagicBaseSortRule,
	MagicBaseTable,
} from "@/apis/modules/magicBase"
import { Button } from "@/components/shadcn-ui/button"
import { ScrollArea, ScrollBar } from "@/components/shadcn-ui/scroll-area"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/shadcn-ui/tooltip"
import { cn } from "@/lib/utils"

import DataFilterBar from "./DataFilterBar"
import DataFilterSummary from "./DataFilterSummary"
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
	tableListCollapsed: boolean
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
	totalKnown: boolean
	loadedRowCount: number
	hasMoreRows: boolean
	loadingMoreRows: boolean
	selectedRowCount: number
	canEditSelectedRow: boolean
	canDeleteSelectedRows: boolean
	canManagePermissions: boolean
	showSystemFields: boolean
	filter: MagicBaseFilterGroup
	onTabChange: (tab: DatabasePanelTab) => void
	onShowSystemFieldsChange: (show: boolean) => void
	onCreateRow: () => void
	onEditSelectedRow: () => void
	onDeleteSelectedRows: () => void
	onSortChange: (field: string) => void
	onSelectionChange: (selection: MagicBaseCellSelection) => void
	onClearSelection: () => void
	onFilterChange: (filter: MagicBaseFilterGroup) => void
	onLoadMoreRows: () => void
	onOpenEditRow: (recordId: string) => void
	onRequestDeleteRows: (selection: MagicBaseCellSelection) => void
	onOpenRowPermissions: (selection: MagicBaseCellSelection) => void
	onOpenColumnPermissions: (selection: MagicBaseCellSelection) => void
	onRefreshTable: () => void
	onRefreshRows: () => void
	onRefreshPermissions: () => void
	onRefresh: () => void
}

interface DataToolbarActionsProps {
	activeTab: DatabasePanelTab
	canManagePermissions: boolean
	showSystemFields: boolean
	onTabChange: (tab: DatabasePanelTab) => void
	onShowSystemFieldsChange: (show: boolean) => void
	onRefresh: () => void
}

function DataToolbarActions({
	activeTab,
	canManagePermissions,
	showSystemFields,
	onTabChange,
	onShowSystemFieldsChange,
	onRefresh,
}: DataToolbarActionsProps) {
	const { t } = useTranslation("super")

	return (
		<div className="flex items-center gap-1">
			{activeTab === "data" ? (
				<Tooltip>
					<TooltipTrigger asChild>
						<Button
							type="button"
							variant={showSystemFields ? "secondary" : "outline"}
							size="icon"
							className={cn("size-8 shadow-xs", !showSystemFields && "bg-background")}
							aria-label={t("microAppPage.databasePanel.showSystemFields")}
							aria-pressed={showSystemFields}
							onClick={() => onShowSystemFieldsChange(!showSystemFields)}
							data-testid="magicbase-system-fields-toggle"
						>
							<Eye className="size-4" />
						</Button>
					</TooltipTrigger>
					<TooltipContent side="bottom">
						{t("microAppPage.databasePanel.showSystemFields")}
					</TooltipContent>
				</Tooltip>
			) : null}
			<Tooltip>
				<TooltipTrigger asChild>
					<Button
						type="button"
						variant={activeTab === "structure" ? "secondary" : "outline"}
						size="icon"
						className={cn(
							"size-8 shadow-xs",
							activeTab !== "structure" && "bg-background",
						)}
						aria-label={t("microAppPage.databasePanel.fieldSettings")}
						aria-pressed={activeTab === "structure"}
						onClick={() => onTabChange("structure")}
						data-testid="magicbase-field-settings"
					>
						<Columns3Cog className="size-4" />
					</Button>
				</TooltipTrigger>
				<TooltipContent side="bottom">
					{t("microAppPage.databasePanel.fieldSettings")}
				</TooltipContent>
			</Tooltip>
			{canManagePermissions ? (
				<Tooltip>
					<TooltipTrigger asChild>
						<Button
							type="button"
							variant={activeTab === "permissions" ? "secondary" : "outline"}
							size="icon"
							className={cn(
								"size-8 shadow-xs",
								activeTab !== "permissions" && "bg-background",
							)}
							aria-label={t("microAppPage.databasePanel.accessPermissions")}
							aria-pressed={activeTab === "permissions"}
							onClick={() => onTabChange("permissions")}
							data-testid="magicbase-access-permissions"
						>
							<ShieldCheck className="size-4" />
						</Button>
					</TooltipTrigger>
					<TooltipContent side="bottom">
						{t("microAppPage.databasePanel.accessPermissions")}
					</TooltipContent>
				</Tooltip>
			) : null}
			<Tooltip>
				<TooltipTrigger asChild>
					<Button
						type="button"
						variant="outline"
						size="icon"
						className="size-8 bg-background shadow-xs"
						aria-label={t("microAppPage.databasePanel.refresh")}
						onClick={onRefresh}
						data-testid="magicbase-refresh"
					>
						<RefreshCw className="size-4" />
					</Button>
				</TooltipTrigger>
				<TooltipContent side="bottom">
					{t("microAppPage.databasePanel.refresh")}
				</TooltipContent>
			</Tooltip>
		</div>
	)
}

export default function DatabaseTablePanel({
	projectId,
	selectedTableId,
	selectedTable,
	tableError,
	tableLoading,
	tableListCollapsed,
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
	totalKnown,
	loadedRowCount,
	hasMoreRows,
	loadingMoreRows,
	selectedRowCount,
	canEditSelectedRow,
	canDeleteSelectedRows,
	canManagePermissions,
	showSystemFields,
	filter,
	onTabChange,
	onShowSystemFieldsChange,
	onCreateRow,
	onEditSelectedRow,
	onDeleteSelectedRows,
	onSortChange,
	onSelectionChange,
	onClearSelection,
	onFilterChange,
	onLoadMoreRows,
	onOpenEditRow,
	onRequestDeleteRows,
	onOpenRowPermissions,
	onOpenColumnPermissions,
	onRefreshTable,
	onRefreshRows,
	onRefreshPermissions,
	onRefresh,
}: DatabaseTablePanelProps) {
	const { t } = useTranslation("super")

	if (!selectedTableId) return null

	return (
		<>
			<div
				data-testid="magicbase-table-header"
				className={cn(
					"border-b border-border/60 bg-background/95 px-4 py-3",
					tableListCollapsed && "pl-10",
				)}
			>
				<div className="flex min-w-0 items-center justify-between gap-4">
					<div className="flex min-w-0 items-center gap-2">
						{activeTab !== "data" ? (
							<Button
								type="button"
								variant="ghost"
								size="icon"
								className="size-8 shrink-0"
								aria-label={t("microAppPage.databasePanel.backToData")}
								onClick={() => onTabChange("data")}
							>
								<ArrowLeft className="size-4" />
							</Button>
						) : null}
						<div className="flex min-w-0 items-center gap-2.5">
							<h3
								className="truncate text-sm font-semibold text-foreground"
								title={selectedTable?.description}
							>
								{selectedTable?.table_name ||
									t("microAppPage.databasePanel.loadingTable")}
							</h3>
							<span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">
								{totalKnown
									? t("microAppPage.databasePanel.totalRows", { total })
									: t("microAppPage.databasePanel.loadedRows", { total })}
							</span>
							{activeTab === "structure" ? (
								<span className="shrink-0 rounded-md bg-primary/5 px-1.5 py-0.5 text-xs text-primary">
									{t("microAppPage.databasePanel.fieldSettings")}
								</span>
							) : null}
							{activeTab === "permissions" ? (
								<span className="shrink-0 rounded-md bg-primary/5 px-1.5 py-0.5 text-xs text-primary">
									{t("microAppPage.databasePanel.accessPermissions")}
								</span>
							) : null}
						</div>
					</div>
					<div className="flex shrink-0 items-center gap-2">
						{tableLoading ? (
							<span className="flex items-center gap-2 text-xs text-muted-foreground">
								<Loader2 className="size-3.5 animate-spin" />
								{t("microAppPage.databasePanel.loading")}
							</span>
						) : null}
						{activeTab === "data" && selectedRowCount > 0 ? (
							<div
								className="flex h-8 items-center gap-1 rounded-md border border-primary/15 bg-primary/5 px-1.5"
								data-testid="magicbase-selection-actions"
								data-preserve-grid-selection
							>
								<span className="px-1 text-xs text-muted-foreground">
									{t("microAppPage.databasePanel.selectedRows", {
										total: selectedRowCount,
									})}
								</span>
								<Button
									type="button"
									size="sm"
									variant="ghost"
									className="h-7 gap-1 px-2"
									onClick={onClearSelection}
								>
									<X className="size-3.5" />
									{t("microAppPage.databasePanel.contextMenu.clearSelection")}
								</Button>
								{canEditSelectedRow ? (
									<Button
										type="button"
										size="sm"
										variant="ghost"
										className="h-7 gap-1 px-2"
										onClick={onEditSelectedRow}
									>
										<Pencil className="size-3.5" />
										{t("microAppPage.databasePanel.rowEdit")}
									</Button>
								) : null}
								{canDeleteSelectedRows ? (
									<Button
										type="button"
										size="sm"
										variant="ghost"
										className="h-7 gap-1 px-2 text-destructive hover:text-destructive"
										onClick={onDeleteSelectedRows}
									>
										<Trash2 className="size-3.5" />
										{t("microAppPage.databasePanel.rowDelete")}
									</Button>
								) : null}
							</div>
						) : null}
						{activeTab === "data" ? (
							<DataFilterBar
								columns={displayColumns}
								value={filter}
								onChange={onFilterChange}
							/>
						) : null}
						{activeTab === "data" ? (
							<Button
								type="button"
								size="sm"
								className="h-8 gap-1.5 shadow-sm"
								disabled={!selectedTable}
								onClick={onCreateRow}
							>
								<Plus className="size-3.5" />
								{t("microAppPage.databasePanel.rowCreate")}
							</Button>
						) : null}
						<DataToolbarActions
							activeTab={activeTab}
							canManagePermissions={canManagePermissions}
							showSystemFields={showSystemFields}
							onTabChange={onTabChange}
							onShowSystemFieldsChange={onShowSystemFieldsChange}
							onRefresh={onRefresh}
						/>
					</div>
				</div>
			</div>

			<div className="flex min-h-0 flex-1 flex-col bg-background">
				{activeTab === "data" ? (
					<DataFilterSummary
						columns={displayColumns}
						value={filter}
						onChange={onFilterChange}
					/>
				) : null}
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
											total={total}
											totalKnown={totalKnown}
											loadedRowCount={loadedRowCount}
											hasMore={hasMoreRows}
											loadingMore={loadingMoreRows}
											onLoadMore={onLoadMoreRows}
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
		</>
	)
}
