import {
	flexRender,
	getCoreRowModel,
	getSortedRowModel,
	useReactTable,
	type ColumnDef,
	type Column,
	type OnChangeFn,
	type Row,
	type SortingState,
	type VisibilityState,
} from "@tanstack/react-table"
import { ArrowDown, ArrowUp, ChevronRight, ChevronsUpDown } from "lucide-react"
import { useState, type ReactNode } from "react"
import { useTranslation } from "react-i18next"
import { Button } from "@magic-admin-v2/components/ui/button"
import { Skeleton } from "@magic-admin-v2/components/ui/skeleton"
import {
	Sheet,
	SheetContent,
	SheetDescription,
	SheetHeader,
	SheetTitle,
} from "@magic-admin-v2/components/ui/sheet"
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@magic-admin-v2/components/ui/table"
import { useIsMobile } from "@magic-admin-v2/hooks/use-is-mobile"
import { cn } from "@magic-admin-v2/utils/cn"
import { mobileCardTokens } from "@magic-admin-v2/components/mobile-card"

type FitContentColumnMeta = {
	fitContent?: boolean
}

type MobileColumnMeta = {
	mobile?: {
		kind?: "control" | "selection" | "value"
	}
}

const desktopContainerClassName = "overflow-hidden rounded-lg border border-border/50 bg-card"

function isFitContentColumnMeta(meta: unknown): meta is FitContentColumnMeta {
	return Boolean(meta && typeof meta === "object" && "fitContent" in meta)
}

function isMobileControlColumn<TData, TValue>(column: Column<TData, TValue>) {
	const meta = column.columnDef.meta as MobileColumnMeta | undefined
	return meta?.mobile?.kind === "control"
}

function isMobileSelectionColumn<TData, TValue>(column: Column<TData, TValue>) {
	const meta = column.columnDef.meta as MobileColumnMeta | undefined
	return meta?.mobile?.kind === "selection" || column.id === "select" || column.id === "selection"
}

/**
 * 通用数据表格的受控配置。
 * 表格在桌面端渲染为表格，在移动端自动切换为卡片列表和详情抽屉。
 */
export type DataTableProps<TData, TValue> = {
	/** TanStack Table 的列定义，支持排序、列宽和移动端 meta 配置。 */
	columns: Array<ColumnDef<TData, TValue>>
	/** 表格容器的自定义样式。 */
	containerClassName?: string
	/** Stable selectors for list/table containers and repeated rows. */
	containerTestId?: string
	loadingTestId?: string
	rowTestId?: string
	mobileDetailContentTestId?: string
	mobileDetailButtonTestId?: string
	mobileDetailCloseButtonTestId?: string
	/** 当前表格行数据。 */
	data: TData[]
	/** 没有数据且非加载状态时展示的内容。 */
	emptyState: ReactNode
	/** 返回行稳定 ID；不传时由 TanStack Table 根据行索引生成。 */
	getRowId?: (row: TData, index: number) => string
	/** 是否展示加载骨架屏。 */
	isLoading?: boolean
	/** 是否由调用方负责排序；为 true 时组件不执行本地排序。 */
	manualSorting?: boolean
	/** 桌面端表格的最小宽度，默认 960px。 */
	minWidth?: number
	/** 列显隐变化回调；传入 columnVisibility 后进入受控列显隐模式。 */
	onColumnVisibilityChange?: OnChangeFn<VisibilityState>
	/** 排序变化回调；传入 sorting 后进入受控排序模式。 */
	onSortingChange?: OnChangeFn<SortingState>
	/** 当前列显隐状态。 */
	columnVisibility?: VisibilityState
	/** 当前排序状态。 */
	sorting?: SortingState
	/** 移动端详情抽屉中需要高亮的行 ID。 */
	selectedRowId?: string
	/** 需要固定在左侧的列 ID。 */
	stickyLeftColumnId?: string
	/** 需要固定在右侧的列 ID；移动端也会作为操作列保留。 */
	stickyRightColumnId?: string
}

export function DataTable<TData, TValue>({
	columns,
	containerClassName,
	containerTestId,
	data,
	emptyState,
	getRowId,
	isLoading,
	loadingTestId,
	manualSorting,
	minWidth = 960,
	mobileDetailContentTestId,
	mobileDetailButtonTestId,
	mobileDetailCloseButtonTestId,
	onColumnVisibilityChange,
	onSortingChange,
	rowTestId,
	columnVisibility,
	sorting,
	selectedRowId,
	stickyLeftColumnId,
	stickyRightColumnId,
}: DataTableProps<TData, TValue>) {
	const { t } = useTranslation()
	const isMobile = useIsMobile()
	const [mobileDetailRow, setMobileDetailRow] = useState<Row<TData> | null>(null)
	const tableState = {
		...(columnVisibility === undefined ? {} : { columnVisibility }),
		...(sorting === undefined ? {} : { sorting }),
	}
	const tableChangeHandlers = {
		...(onColumnVisibilityChange === undefined ? {} : { onColumnVisibilityChange }),
		...(onSortingChange === undefined ? {} : { onSortingChange }),
	}
	const table = useReactTable({
		data,
		columns,
		getCoreRowModel: getCoreRowModel(),
		getSortedRowModel: manualSorting ? undefined : getSortedRowModel(),
		getRowId,
		manualSorting,
		...tableChangeHandlers,
		state: {
			...tableState,
		},
	})
	const hasFitContentColumn = table
		.getAllLeafColumns()
		.some(
			(column) =>
				isFitContentColumnMeta(column.columnDef.meta) && column.columnDef.meta.fitContent,
		)
	const mobileColumnLabels = new Map(
		table
			.getFlatHeaders()
			.map((header) => [
				header.column.id,
				header.isPlaceholder
					? null
					: flexRender(header.column.columnDef.header, header.getContext()),
			]),
	)

	if (isMobile) {
		if (isLoading) {
			return (
				<MobileCardListSkeleton
					className={containerClassName}
					testId={loadingTestId ?? containerTestId}
				/>
			)
		}

		if (table.getRowModel().rows.length === 0) {
			return (
				<div className={containerClassName} data-slot="data-table-mobile-empty">
					{emptyState}
				</div>
			)
		}

		return (
			<>
				<div
					className={cn(mobileCardTokens.list, "bg-transparent", containerClassName)}
					data-slot="data-table-mobile-list"
					data-testid={containerTestId}
				>
					{table.getRowModel().rows.map((row) => (
						<MobileDataCard
							columnLabels={mobileColumnLabels}
							key={row.id}
							onViewDetails={() => setMobileDetailRow(row)}
							mobileDetailButtonTestId={mobileDetailButtonTestId}
							rowTestId={rowTestId}
							row={row}
							stickyRightColumnId={stickyRightColumnId}
							viewDetailsLabel={t("common.viewDetails")}
						/>
					))}
				</div>

				<MobileDataDetailSheet
					columnLabels={mobileColumnLabels}
					contentTestId={mobileDetailContentTestId}
					closeButtonTestId={mobileDetailCloseButtonTestId}
					onOpenChange={(open) => {
						if (!open) setMobileDetailRow(null)
					}}
					open={mobileDetailRow !== null}
					row={mobileDetailRow}
					stickyRightColumnId={stickyRightColumnId}
					title={t("common.details")}
				/>
			</>
		)
	}

	if (isLoading) {
		return (
			<div
				className={cn(desktopContainerClassName, containerClassName)}
				data-slot="data-table-desktop"
				data-testid={loadingTestId ?? containerTestId}
			>
				<Table
					className={hasFitContentColumn ? "table-auto" : "table-fixed"}
					style={{ minWidth }}
				>
					<TableHeader>
						{table.getHeaderGroups().map((headerGroup) => (
							<TableRow key={headerGroup.id} className="hover:bg-transparent">
								{headerGroup.headers.map((header) => (
									<TableHead
										className={cn(
											getFitContentColumnClassName(header.column),
											getStickyColumnClassName(
												header.column.id,
												stickyLeftColumnId,
												stickyRightColumnId,
												"head",
											),
										)}
										key={header.id}
										style={getColumnSizeStyle(header.column)}
									>
										{header.isPlaceholder ? null : (
											<SortableHeader column={header.column}>
												{flexRender(
													header.column.columnDef.header,
													header.getContext(),
												)}
											</SortableHeader>
										)}
									</TableHead>
								))}
							</TableRow>
						))}
					</TableHeader>
					<TableBody>
						{Array.from({ length: 6 }, (_, rowIndex) => (
							<TableRow key={rowIndex}>
								{table.getAllLeafColumns().map((column) => (
									<TableCell
										className={cn(
											getFitContentColumnClassName(column),
											getStickyColumnClassName(
												column.id,
												stickyLeftColumnId,
												stickyRightColumnId,
												"cell",
											),
										)}
										key={column.id}
									>
										<Skeleton
											className={cn(
												"h-5",
												column.id === "name" ? "w-40" : "w-20",
											)}
										/>
									</TableCell>
								))}
							</TableRow>
						))}
					</TableBody>
				</Table>
			</div>
		)
	}

	if (table.getRowModel().rows.length === 0) {
		return (
			<div
				className={cn(desktopContainerClassName, containerClassName)}
				data-slot="data-table-desktop"
				data-testid={containerTestId}
			>
				{emptyState}
			</div>
		)
	}

	return (
		<div
			className={cn(desktopContainerClassName, containerClassName)}
			data-slot="data-table-desktop"
			data-testid={containerTestId}
		>
			<Table
				className={hasFitContentColumn ? "table-auto" : "table-fixed"}
				style={{ minWidth }}
			>
				<TableHeader>
					{table.getHeaderGroups().map((headerGroup) => (
						<TableRow key={headerGroup.id} className="hover:bg-transparent">
							{headerGroup.headers.map((header) => (
								<TableHead
									className={cn(
										getFitContentColumnClassName(header.column),
										getStickyColumnClassName(
											header.column.id,
											stickyLeftColumnId,
											stickyRightColumnId,
											"head",
										),
									)}
									key={header.id}
									style={getColumnSizeStyle(header.column)}
								>
									{header.isPlaceholder ? null : (
										<SortableHeader column={header.column}>
											{flexRender(
												header.column.columnDef.header,
												header.getContext(),
											)}
										</SortableHeader>
									)}
								</TableHead>
							))}
						</TableRow>
					))}
				</TableHeader>
				<TableBody>
					{table.getRowModel().rows.map((row) => {
						const selected = row.getIsSelected() || row.id === selectedRowId
						return (
							<TableRow
								aria-selected={selected || undefined}
								className={
									selected ? "bg-primary/5 hover:bg-primary/10" : undefined
								}
								data-state={selected ? "selected" : undefined}
								data-testid={rowTestId}
								key={row.id}
							>
								{row.getVisibleCells().map((cell) => (
									<TableCell
										className={cn(
											getFitContentColumnClassName(cell.column),
											getStickyColumnClassName(
												cell.column.id,
												stickyLeftColumnId,
												stickyRightColumnId,
												"cell",
											),
										)}
										key={cell.id}
									>
										{flexRender(cell.column.columnDef.cell, cell.getContext())}
									</TableCell>
								))}
							</TableRow>
						)
					})}
				</TableBody>
			</Table>
		</div>
	)
}

function MobileDataCard<TData>({
	columnLabels,
	mobileDetailButtonTestId,
	onViewDetails,
	rowTestId,
	row,
	stickyRightColumnId,
	viewDetailsLabel,
}: {
	columnLabels: Map<string, ReactNode>
	mobileDetailButtonTestId?: string
	onViewDetails: () => void
	rowTestId?: string
	row: Row<TData>
	stickyRightColumnId?: string
	viewDetailsLabel: string
}) {
	const visibleCells = row.getVisibleCells()
	const dataCells = visibleCells.filter(
		(cell) =>
			!isActionColumn(cell.column.id, stickyRightColumnId) &&
			!isMobileSelectionColumn(cell.column),
	)
	const selectionCells = visibleCells.filter((cell) => isMobileSelectionColumn(cell.column))
	const actionCell = visibleCells.find((cell) =>
		isActionColumn(cell.column.id, stickyRightColumnId),
	)
	const titleCell = dataCells[0]
	const summaryCells = dataCells.slice(1, 5)

	return (
		<article className={mobileCardTokens.card} data-testid={rowTestId}>
			<div className={mobileCardTokens.header}>
				{selectionCells.length > 0 ? (
					<div className="flex shrink-0 items-center gap-2 pt-0.5">
						{selectionCells.map((cell) => (
							<div key={cell.id}>
								{flexRender(cell.column.columnDef.cell, cell.getContext())}
							</div>
						))}
					</div>
				) : null}
				<div className="min-w-0 flex-1 font-medium">
					{titleCell
						? flexRender(titleCell.column.columnDef.cell, titleCell.getContext())
						: null}
				</div>
				{actionCell
					? flexRender(actionCell.column.columnDef.cell, actionCell.getContext())
					: null}
			</div>

			{summaryCells.length > 0 ? (
				<div className={mobileCardTokens.content}>
					{summaryCells.map((cell) => {
						const isControl = isMobileControlColumn(cell.column)

						return (
							<div
								className={cn(
									"min-w-0",
									isControl && "flex items-center justify-between gap-3",
								)}
								data-mobile-field={isControl ? "control" : "value"}
								key={cell.id}
							>
								<div
									className={cn(
										mobileCardTokens.label,
										"truncate",
										isControl && "mb-0",
									)}
								>
									{columnLabels.get(cell.column.id)}
								</div>
								<div
									className={cn(mobileCardTokens.value, isControl && "shrink-0")}
								>
									{flexRender(cell.column.columnDef.cell, cell.getContext())}
								</div>
							</div>
						)
					})}
				</div>
			) : null}

			{dataCells.length > 1 ? (
				<div className={mobileCardTokens.actions}>
					<Button
						className={mobileCardTokens.actionButton}
						data-testid={mobileDetailButtonTestId}
						onClick={onViewDetails}
						type="button"
						variant="ghost"
					>
						{viewDetailsLabel}
						<ChevronRight className="size-4" aria-hidden="true" />
					</Button>
				</div>
			) : null}
		</article>
	)
}

function MobileDataDetailSheet<TData>({
	columnLabels,
	contentTestId,
	closeButtonTestId,
	onOpenChange,
	open,
	row,
	stickyRightColumnId,
	title,
}: {
	columnLabels: Map<string, ReactNode>
	contentTestId?: string
	closeButtonTestId?: string
	onOpenChange: (open: boolean) => void
	open: boolean
	row: Row<TData> | null
	stickyRightColumnId?: string
	title: string
}) {
	const cells =
		row
			?.getVisibleCells()
			.filter(
				(cell) =>
					!isActionColumn(cell.column.id, stickyRightColumnId) &&
					!isMobileSelectionColumn(cell.column),
			) ?? []
	return (
		<Sheet open={open} onOpenChange={onOpenChange}>
			<SheetContent
				className="max-h-[calc(100svh-0.5rem)] gap-0 rounded-t-xl p-0"
				closeButtonTestId={closeButtonTestId}
				data-testid={contentTestId}
				side="bottom"
			>
				<SheetHeader className="shrink-0 border-b px-4 py-4 pr-12 text-left">
					<SheetTitle>{title}</SheetTitle>
					<SheetDescription className="sr-only">{title}</SheetDescription>
				</SheetHeader>
				<div className="min-h-0 flex-1 overflow-y-auto px-4 py-2 pb-[max(1rem,env(safe-area-inset-bottom))]">
					<dl className="divide-y">
						{cells.map((cell) => (
							<div className="grid gap-1 py-3" key={cell.id}>
								<dt className="text-xs text-muted-foreground">
									{columnLabels.get(cell.column.id)}
								</dt>
								<dd className="min-w-0 break-words text-sm">
									{flexRender(cell.column.columnDef.cell, cell.getContext())}
								</dd>
							</div>
						))}
					</dl>
				</div>
			</SheetContent>
		</Sheet>
	)
}

function MobileCardListSkeleton({ className, testId }: { className?: string; testId?: string }) {
	return (
		<div
			className={cn(mobileCardTokens.list, "bg-transparent", className)}
			data-slot="data-table-mobile-list"
			data-testid={testId}
		>
			{Array.from({ length: 4 }, (_, index) => (
				<div className={mobileCardTokens.card} key={index}>
					<div className="px-4 py-4">
						<Skeleton className="h-5 w-2/3" />
					</div>
					<div className={mobileCardTokens.content}>
						{Array.from({ length: 4 }, (_, fieldIndex) => (
							<div className="space-y-2" key={fieldIndex}>
								<Skeleton className="h-3 w-14" />
								<Skeleton className="h-4 w-full" />
							</div>
						))}
					</div>
				</div>
			))}
		</div>
	)
}

function isActionColumn(columnId: string, stickyRightColumnId?: string) {
	return columnId === "actions" || columnId === stickyRightColumnId
}

function SortableHeader<TData, TValue>({
	children,
	column,
}: {
	children: ReactNode
	column: Column<TData, TValue>
}) {
	if (!column.getCanSort()) {
		return <>{children}</>
	}

	const sorted = column.getIsSorted()
	const SortIcon = sorted === "asc" ? ArrowUp : sorted === "desc" ? ArrowDown : ChevronsUpDown

	return (
		<span
			aria-sort={sorted === "asc" ? "ascending" : sorted === "desc" ? "descending" : "none"}
			className="inline-flex min-w-0 cursor-pointer select-none items-center gap-1.5 text-left transition-colors hover:text-foreground"
			onClick={column.getToggleSortingHandler()}
			onKeyDown={(event) => {
				if (event.key === "Enter" || event.key === " ") {
					event.preventDefault()
					column.toggleSorting()
				}
			}}
			role="button"
			tabIndex={0}
		>
			<span className="min-w-0">{children}</span>
			<SortIcon className="size-3.5 shrink-0" aria-hidden="true" />
		</span>
	)
}

function getColumnSizeStyle<TData, TValue>(column: Column<TData, TValue>) {
	if (isFitContentColumnMeta(column.columnDef.meta) && column.columnDef.meta.fitContent) {
		return { width: "1%" }
	}

	return { width: column.getSize() }
}

function getFitContentColumnClassName<TData, TValue>(column: Column<TData, TValue>) {
	return isFitContentColumnMeta(column.columnDef.meta) && column.columnDef.meta.fitContent
		? "whitespace-nowrap"
		: undefined
}

function getStickyColumnClassName(
	columnId: string,
	stickyLeftColumnId: string | undefined,
	stickyRightColumnId: string | undefined,
	type: "cell" | "head",
) {
	if (stickyLeftColumnId && columnId === stickyLeftColumnId) {
		return cn(
			"sticky left-0 shadow-[10px_0_16px_-16px_rgba(15,23,42,0.35)]",
			"after:pointer-events-none after:absolute after:inset-y-0 after:right-0 after:w-px after:bg-border after:content-['']",
			type === "head" ? "z-30 bg-muted" : "z-20 bg-card",
		)
	}

	if (stickyRightColumnId && columnId === stickyRightColumnId) {
		return cn(
			"sticky right-0 shadow-[-10px_0_16px_-16px_rgba(15,23,42,0.35)]",
			"before:pointer-events-none before:absolute before:inset-y-0 before:left-0 before:w-px before:bg-border before:content-['']",
			type === "head" ? "z-30 bg-muted" : "z-20 bg-card",
		)
	}

	return undefined
}
