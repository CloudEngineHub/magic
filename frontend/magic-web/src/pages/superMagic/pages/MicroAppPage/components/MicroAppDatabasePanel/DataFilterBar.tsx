import { ListFilter, Plus, Trash2 } from "lucide-react"
import { useMemo, useState } from "react"
import { useTranslation } from "react-i18next"

import type { MagicBaseColumn } from "@/apis/modules/magicBase"
import { Button } from "@/components/shadcn-ui/button"
import { Input } from "@/components/shadcn-ui/input"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/shadcn-ui/popover"
import { cn } from "@/lib/utils"

import type { MagicBaseFilterCondition } from "./utils"

interface DataFilterBarProps {
	columns: MagicBaseColumn[]
	value: MagicBaseFilterCondition[]
	onChange: (conditions: MagicBaseFilterCondition[]) => void
}

interface DraftFilterCondition {
	field: string
	value: string
}

const FILTERABLE_DATA_TYPES = new Set(["boolean", "datetime", "number", "text"])

function getFilterableColumns(columns: MagicBaseColumn[]) {
	return columns.filter(
		(column) =>
			column.status !== "disabled" &&
			column.source !== "system" &&
			!column.system &&
			FILTERABLE_DATA_TYPES.has(column.data_type),
	)
}

function toDraftValue(column: MagicBaseColumn, value: MagicBaseFilterCondition["value"]) {
	if (column.data_type === "datetime") return String(value).replace(" ", "T").slice(0, 19)
	return String(value)
}

function toFilterValue(column: MagicBaseColumn, value: string) {
	if (column.data_type === "boolean") return value === "true"
	if (column.data_type === "number") return Number(value)
	if (column.data_type === "datetime") {
		const normalized = value.replace("T", " ")
		return normalized.length === 16 ? `${normalized}:00` : normalized
	}
	return value.trim()
}

function isValidDraftCondition(condition: DraftFilterCondition, columns: MagicBaseColumn[]) {
	const column = columns.find((item) => item.column_key === condition.field)
	if (!column || condition.value.trim() === "") return false
	if (column.data_type === "number") return Number.isFinite(Number(condition.value))
	return true
}

export default function DataFilterBar({ columns, value, onChange }: DataFilterBarProps) {
	const { t } = useTranslation("super")
	const [open, setOpen] = useState(false)
	const [draftConditions, setDraftConditions] = useState<DraftFilterCondition[]>([])
	const filterableColumns = useMemo(() => getFilterableColumns(columns), [columns])

	const createDraftConditions = () => {
		const conditions = value.flatMap((condition) => {
			const column = filterableColumns.find((item) => item.column_key === condition.field)
			return column
				? [{ field: condition.field, value: toDraftValue(column, condition.value) }]
				: []
		})
		if (conditions.length > 0 || filterableColumns.length === 0) return conditions
		return [{ field: filterableColumns[0].column_key, value: "" }]
	}

	const handleOpenChange = (nextOpen: boolean) => {
		if (nextOpen) setDraftConditions(createDraftConditions())
		setOpen(nextOpen)
	}

	const updateDraftCondition = (index: number, patch: Partial<DraftFilterCondition>) => {
		setDraftConditions((current) =>
			current.map((condition, currentIndex) =>
				currentIndex === index ? { ...condition, ...patch } : condition,
			),
		)
	}

	const handleAddCondition = () => {
		const usedFields = new Set(draftConditions.map((condition) => condition.field))
		const column = filterableColumns.find((item) => !usedFields.has(item.column_key))
		if (!column) return
		setDraftConditions((current) => [...current, { field: column.column_key, value: "" }])
	}

	const handleApply = () => {
		const conditions = draftConditions.flatMap((condition) => {
			const column = filterableColumns.find((item) => item.column_key === condition.field)
			if (!column || !isValidDraftCondition(condition, filterableColumns)) return []
			return [{ field: condition.field, value: toFilterValue(column, condition.value) }]
		})
		onChange(conditions)
		setOpen(false)
	}

	const allConditionsValid = draftConditions.every((condition) =>
		isValidDraftCondition(condition, filterableColumns),
	)
	const usedFields = new Set(draftConditions.map((condition) => condition.field))
	const canAddCondition = filterableColumns.some((column) => !usedFields.has(column.column_key))

	return (
		<Popover open={open} onOpenChange={handleOpenChange}>
			<PopoverTrigger asChild>
				<Button
					type="button"
					variant={value.length > 0 ? "secondary" : "outline"}
					size="sm"
					className="h-8 gap-1.5 bg-background shadow-xs"
					disabled={filterableColumns.length === 0}
					data-testid="magicbase-filter-trigger"
				>
					<ListFilter className="size-3.5" />
					{value.length > 0
						? t("microAppPage.databasePanel.filterCount", { total: value.length })
						: t("microAppPage.databasePanel.filterData")}
				</Button>
			</PopoverTrigger>
			<PopoverContent align="end" className="w-[420px] p-0" sideOffset={8}>
				<div className="border-b border-border/60 px-4 py-3">
					<h4 className="text-sm font-semibold text-foreground">
						{t("microAppPage.databasePanel.filterTitle")}
					</h4>
					<p className="mt-1 text-xs leading-5 text-muted-foreground">
						{t("microAppPage.databasePanel.filterHint")}
					</p>
				</div>

				<div className="max-h-[320px] space-y-2 overflow-y-auto p-3">
					{draftConditions.map((condition, index) => {
						const column = filterableColumns.find(
							(item) => item.column_key === condition.field,
						)
						return (
							<div
								key={`${condition.field}:${index}`}
								className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)_32px] items-center gap-2 rounded-lg border border-border/60 bg-muted/20 p-2"
							>
								<select
									value={condition.field}
									className="h-8 min-w-0 rounded-md border border-input bg-background px-2 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/30"
									aria-label={t("microAppPage.databasePanel.filterField")}
									onChange={(event) =>
										updateDraftCondition(index, {
											field: event.target.value,
											value: "",
										})
									}
								>
									{filterableColumns.map((item) => (
										<option
											key={item.column_key}
											value={item.column_key}
											disabled={
												item.column_key !== condition.field &&
												usedFields.has(item.column_key)
											}
										>
											{item.column_name || item.column_key}
										</option>
									))}
								</select>
								<span className="text-xs text-muted-foreground">
									{t("microAppPage.databasePanel.filterEquals")}
								</span>
								{column?.data_type === "boolean" ? (
									<select
										value={condition.value}
										className="h-8 min-w-0 rounded-md border border-input bg-background px-2 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/30"
										aria-label={t("microAppPage.databasePanel.filterValue")}
										onChange={(event) =>
											updateDraftCondition(index, {
												value: event.target.value,
											})
										}
									>
										<option value="">
											{t("microAppPage.databasePanel.filterValue")}
										</option>
										<option value="true">
											{t("microAppPage.databasePanel.yes")}
										</option>
										<option value="false">
											{t("microAppPage.databasePanel.no")}
										</option>
									</select>
								) : (
									<Input
										type={
											column?.data_type === "number"
												? "number"
												: column?.data_type === "datetime"
													? "datetime-local"
													: "text"
										}
										value={condition.value}
										step={column?.data_type === "datetime" ? 1 : undefined}
										className="h-8 min-w-0"
										placeholder={t(
											"microAppPage.databasePanel.filterValuePlaceholder",
										)}
										aria-label={t("microAppPage.databasePanel.filterValue")}
										onChange={(event) =>
											updateDraftCondition(index, {
												value: event.target.value,
											})
										}
										onKeyDown={(event) => {
											if (event.key === "Enter" && allConditionsValid)
												handleApply()
										}}
									/>
								)}
								<Button
									type="button"
									variant="ghost"
									size="icon"
									className="size-8 text-muted-foreground hover:text-destructive"
									aria-label={t(
										"microAppPage.databasePanel.removeFilterCondition",
									)}
									onClick={() =>
										setDraftConditions((current) =>
											current.filter(
												(_, currentIndex) => currentIndex !== index,
											),
										)
									}
								>
									<Trash2 className="size-3.5" />
								</Button>
							</div>
						)
					})}

					<Button
						type="button"
						variant="ghost"
						size="sm"
						className={cn("h-8 gap-1.5", !canAddCondition && "hidden")}
						onClick={handleAddCondition}
					>
						<Plus className="size-3.5" />
						{t("microAppPage.databasePanel.addFilterCondition")}
					</Button>
				</div>

				<div className="flex items-center justify-between border-t border-border/60 px-3 py-2.5">
					<Button
						type="button"
						variant="ghost"
						size="sm"
						disabled={value.length === 0}
						onClick={() => {
							onChange([])
							setOpen(false)
						}}
					>
						{t("microAppPage.databasePanel.clearFilters")}
					</Button>
					<Button
						type="button"
						size="sm"
						disabled={!allConditionsValid}
						onClick={handleApply}
					>
						{t("microAppPage.databasePanel.applyFilters")}
					</Button>
				</div>
			</PopoverContent>
		</Popover>
	)
}
