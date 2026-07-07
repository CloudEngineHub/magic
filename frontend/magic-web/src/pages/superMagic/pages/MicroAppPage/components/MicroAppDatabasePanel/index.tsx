import { Database, Loader2, RefreshCw, X } from "lucide-react"
import { useEffect, useMemo, useState } from "react"
import { useTranslation } from "react-i18next"
import useSWR from "swr"
import { MagicBaseApi } from "@/apis"
import type { MagicBaseSortRule } from "@/apis/modules/magicBase"
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
import DataGrid from "./DataGrid"
import StructureTable from "./StructureTable"
import TableList from "./TableList"
import {
	MAGIC_BASE_PAGE_SIZE,
	buildGridColumns,
	buildMagicBaseRowsRequest,
	getDefaultSort,
	getEnabledColumns,
} from "./utils"

interface MicroAppDatabasePanelProps {
	open: boolean
	projectId?: string
	projectName?: string
	onOpenChange: (open: boolean) => void
}

type PanelTab = "data" | "structure"

export default function MicroAppDatabasePanel({
	open,
	projectId,
	projectName,
	onOpenChange,
}: MicroAppDatabasePanelProps) {
	const { t } = useTranslation("super")
	const [selectedTableId, setSelectedTableId] = useState<string | null>(null)
	const [activeTab, setActiveTab] = useState<PanelTab>("data")
	const [page, setPage] = useState(1)
	const [sort, setSort] = useState<MagicBaseSortRule | null>(null)

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
		setSort(getDefaultSort(selectedTable))
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

	const rows = rowsData?.list || []
	const total = rowsData?.total || 0
	const totalPages = Math.max(1, Math.ceil(total / MAGIC_BASE_PAGE_SIZE))
	const gridColumns = useMemo(() => buildGridColumns(selectedTable, rows), [rows, selectedTable])

	const handleSelectTable = (tableId: string) => {
		setSelectedTableId(tableId)
		setActiveTab("data")
		setPage(1)
	}

	const handleSortChange = (field: string) => {
		setPage(1)
		setSort((current) => {
			if (current?.field !== field) return { field, order: "asc" }
			return { field, order: current.order === "asc" ? "desc" : "asc" }
		})
	}

	const handleRefresh = () => {
		refreshTables()
		refreshTable()
		refreshRows()
	}

	const enabledColumns = getEnabledColumns(selectedTable)
	const subtitle = selectedTable
		? `${selectedTable.table_key} · ${enabledColumns.length} ${t("microAppPage.databasePanel.columns")}`
		: projectName || ""

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
							<SheetDescription className="truncate text-xs">{subtitle}</SheetDescription>
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
											<button
												type="button"
												role="tab"
												aria-selected={activeTab === "data"}
												className={cn(
													"inline-flex h-7 items-center justify-center rounded-md px-2 py-1 text-xs text-foreground transition-colors",
													activeTab === "data" && "bg-background shadow-sm",
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
													activeTab === "structure" && "bg-background shadow-sm",
												)}
												onClick={() => setActiveTab("structure")}
											>
												{t("microAppPage.databasePanel.structureTab")}
											</button>
										</div>
										{tableLoading ? (
											<span className="flex items-center gap-2 text-xs text-muted-foreground">
												<Loader2 className="size-3.5 animate-spin" />
												{t("microAppPage.databasePanel.loading")}
											</span>
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
																{t("microAppPage.databasePanel.retry")}
															</Button>
														</div>
													) : (
														<ScrollArea className="h-full">
															<DataGrid
																columns={gridColumns}
																rows={rows}
																sort={sort}
																loading={rowsLoading || tableLoading}
																onSortChange={handleSortChange}
															/>
															<ScrollBar orientation="horizontal" />
														</ScrollArea>
													)}
												</div>
											) : null}

											{activeTab === "structure" ? (
												<div className="min-h-0 flex-1">
													<ScrollArea className="h-full">
														<StructureTable columns={enabledColumns} />
														<ScrollBar orientation="horizontal" />
													</ScrollArea>
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
											onClick={() => setPage((current) => Math.max(1, current - 1))}
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
												setPage((current) => Math.min(totalPages, current + 1))
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
			</SheetContent>
		</Sheet>
	)
}
