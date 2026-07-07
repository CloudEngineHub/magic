import { Search, Table2 } from "lucide-react"
import { useMemo, useState } from "react"
import { useTranslation } from "react-i18next"
import type { MagicBaseTable } from "@/apis/modules/magicBase"
import { Badge } from "@/components/shadcn-ui/badge"
import { Button } from "@/components/shadcn-ui/button"
import { Input } from "@/components/shadcn-ui/input"
import { ScrollArea } from "@/components/shadcn-ui/scroll-area"
import { cn } from "@/lib/utils"

interface TableListProps {
	tables: MagicBaseTable[]
	selectedTableId: string | null
	loading: boolean
	error?: unknown
	onSelect: (tableId: string) => void
	onRetry: () => void
}

export default function TableList({
	tables,
	selectedTableId,
	loading,
	error,
	onSelect,
	onRetry,
}: TableListProps) {
	const { t } = useTranslation("super")
	const [keyword, setKeyword] = useState("")
	const filteredTables = useMemo(() => {
		const normalizedKeyword = keyword.trim().toLowerCase()
		if (!normalizedKeyword) return tables
		return tables.filter((table) =>
			[table.table_name, table.table_key, table.description]
				.filter(Boolean)
				.some((value) => value?.toLowerCase().includes(normalizedKeyword)),
		)
	}, [keyword, tables])

	return (
		<aside className="flex h-full w-[280px] shrink-0 flex-col border-r border-border bg-muted/20">
			<div className="border-b border-border p-3">
				<div className="relative">
					<Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
					<Input
						value={keyword}
						onChange={(event) => setKeyword(event.target.value)}
						placeholder={t("microAppPage.databasePanel.searchTables")}
						className="h-8 pl-8"
					/>
				</div>
			</div>

			<ScrollArea className="min-h-0 flex-1">
				<div className="space-y-1 p-2" data-testid="magicbase-table-list">
					{loading ? (
						<div className="space-y-2 p-2">
							{Array.from({ length: 5 }).map((_, index) => (
								<div
									key={index}
									className="h-14 animate-pulse rounded-md bg-muted"
								/>
							))}
						</div>
					) : null}

					{error ? (
						<div className="space-y-3 p-3 text-sm">
							<p className="text-destructive">
								{t("microAppPage.databasePanel.loadTablesFailed")}
							</p>
							<Button type="button" size="sm" variant="outline" onClick={onRetry}>
								{t("microAppPage.databasePanel.retry")}
							</Button>
						</div>
					) : null}

					{!loading && !error && filteredTables.length === 0 ? (
						<div className="p-3 text-sm text-muted-foreground">
							{keyword
								? t("microAppPage.databasePanel.noMatchedTables")
								: t("microAppPage.databasePanel.noTables")}
						</div>
					) : null}

					{filteredTables.map((table) => {
						const active = table.id === selectedTableId
						return (
							<button
								key={table.id}
								type="button"
								className={cn(
									"flex w-full min-w-0 items-start gap-2 rounded-md px-2 py-2 text-left transition-colors hover:bg-background",
									active && "bg-background shadow-sm",
								)}
								onClick={() => onSelect(table.id)}
							>
								<Table2 className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
								<span className="min-w-0 flex-1">
									<span className="flex min-w-0 items-center gap-2">
										<span className="truncate text-sm font-medium text-foreground">
											{table.table_name || table.table_key}
										</span>
										{table.status ? (
											<Badge
												variant="outline"
												className="shrink-0 rounded-md"
											>
												{table.status}
											</Badge>
										) : null}
									</span>
									<span className="block truncate text-xs text-muted-foreground">
										{table.table_key}
									</span>
									{table.description ? (
										<span className="mt-1 line-clamp-2 block text-xs text-muted-foreground">
											{table.description}
										</span>
									) : null}
								</span>
							</button>
						)
					})}
				</div>
			</ScrollArea>
		</aside>
	)
}
