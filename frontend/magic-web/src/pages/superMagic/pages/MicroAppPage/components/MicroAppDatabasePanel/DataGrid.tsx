import { ArrowDown, ArrowUp, ChevronsUpDown } from "lucide-react"
import { useTranslation } from "react-i18next"
import type { MagicBaseRow, MagicBaseSortRule } from "@/apis/modules/magicBase"
import { Button } from "@/components/shadcn-ui/button"
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "@/components/shadcn-ui/table"
import { cn } from "@/lib/utils"
import type { MagicBaseGridColumn } from "./utils"
import { formatCellValue } from "./utils"

interface DataGridProps {
	columns: MagicBaseGridColumn[]
	rows: MagicBaseRow[]
	sort: MagicBaseSortRule | null
	loading: boolean
	onSortChange: (field: string) => void
}

function SortIcon({ columnKey, sort }: { columnKey: string; sort: MagicBaseSortRule | null }) {
	if (sort?.field !== columnKey) {
		return <ChevronsUpDown className="size-3.5 text-muted-foreground" />
	}
	return sort.order === "asc" ? (
		<ArrowUp className="size-3.5 text-foreground" />
	) : (
		<ArrowDown className="size-3.5 text-foreground" />
	)
}

export default function DataGrid({ columns, rows, sort, loading, onSortChange }: DataGridProps) {
	const { t } = useTranslation("super")

	if (loading) {
		return (
			<div className="space-y-2 p-4">
				{Array.from({ length: 8 }).map((_, index) => (
					<div key={index} className="h-9 animate-pulse rounded-md bg-muted" />
				))}
			</div>
		)
	}

	if (rows.length === 0) {
		return (
			<div className="flex h-full items-center justify-center text-sm text-muted-foreground">
				{t("microAppPage.databasePanel.noRows")}
			</div>
		)
	}

	return (
		<Table className="min-w-max border-separate border-spacing-0">
			<TableHeader className="sticky top-0 z-10 bg-background">
				<TableRow>
					{columns.map((column) => (
						<TableHead
							key={column.key}
							className="h-12 min-w-[180px] border-b border-r border-border bg-background p-0"
						>
							<Button
								type="button"
								variant="ghost"
								className="h-full w-full justify-between rounded-none px-3 py-2 text-left"
								onClick={() => onSortChange(column.key)}
							>
								<span className="min-w-0">
									<span className="block truncate text-xs font-medium text-foreground">
										{column.name}
									</span>
									<span className="block truncate text-[11px] font-normal text-muted-foreground">
										{column.key}
										{column.type ? ` · ${column.type}` : ""}
									</span>
								</span>
								<SortIcon columnKey={column.key} sort={sort} />
							</Button>
						</TableHead>
					))}
				</TableRow>
			</TableHeader>
			<TableBody>
				{rows.map((row, rowIndex) => (
					<TableRow key={String(row.id ?? rowIndex)} className="hover:bg-muted/30">
						{columns.map((column) => {
							const value = row[column.key]
							return (
								<TableCell
									key={column.key}
									className={cn(
										"max-w-[280px] border-b border-r border-border px-3 py-2 text-xs",
										value == null && "text-muted-foreground",
									)}
									title={formatCellValue(value)}
								>
									<span className="block truncate">{formatCellValue(value)}</span>
								</TableCell>
							)
						})}
					</TableRow>
				))}
			</TableBody>
		</Table>
	)
}
