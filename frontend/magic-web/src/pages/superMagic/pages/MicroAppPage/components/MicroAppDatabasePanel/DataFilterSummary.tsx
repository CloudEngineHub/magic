import { X } from "lucide-react"
import { useTranslation } from "react-i18next"

import type { MagicBaseColumn, MagicBaseFilterGroup } from "@/apis/modules/magicBase"
import { Button } from "@/components/shadcn-ui/button"

import { createEmptyMagicBaseFilter, isMagicBaseFilterCondition } from "./utils"
import useFilterOperatorLabel from "./useFilterOperatorLabel"
import useMagicBaseColumnLabel from "./useMagicBaseColumnLabel"

interface DataFilterSummaryProps {
	columns: MagicBaseColumn[]
	value: MagicBaseFilterGroup
	onChange: (filter: MagicBaseFilterGroup) => void
}

export default function DataFilterSummary({ columns, value, onChange }: DataFilterSummaryProps) {
	const { t } = useTranslation("super")
	const getOperatorLabel = useFilterOperatorLabel()
	const getColumnLabel = useMagicBaseColumnLabel()
	const conditions = value.items.flatMap((item, itemIndex) =>
		isMagicBaseFilterCondition(item) ? [{ condition: item, itemIndex }] : [],
	)
	if (conditions.length === 0) return null

	return (
		<div
			className="flex min-h-10 items-center gap-2 overflow-x-auto border-b border-border/60 bg-muted/20 px-4 py-1.5"
			data-preserve-grid-selection
		>
			<span className="shrink-0 text-xs text-muted-foreground">
				{value.logic === "and"
					? t("microAppPage.databasePanel.filterMatchAllSummary")
					: t("microAppPage.databasePanel.filterMatchAnySummary")}
			</span>
			{conditions.map(({ condition, itemIndex }, index) => {
				const column = columns.find((item) => item.column_key === condition.field)
				const displayValue = Array.isArray(condition.value)
					? condition.value.join(", ")
					: String(condition.value)
				return (
					<div
						key={`${condition.field}:${condition.operator}:${index}`}
						className="flex h-7 shrink-0 items-center gap-1 rounded-md border border-primary/15 bg-primary/5 pl-2 text-xs text-foreground"
					>
						<span>{column ? getColumnLabel(column) : condition.field}</span>
						<span className="text-muted-foreground">
							{getOperatorLabel(condition.operator)}
						</span>
						<span className="max-w-40 truncate" title={displayValue}>
							{displayValue}
						</span>
						<Button
							type="button"
							variant="ghost"
							size="icon"
							className="size-6 rounded-l-none text-muted-foreground hover:text-foreground"
							aria-label={t("microAppPage.databasePanel.removeFilterCondition")}
							onClick={() => {
								const items = value.items.filter(
									(_, currentIndex) => currentIndex !== itemIndex,
								)
								onChange(
									items.length === 0
										? createEmptyMagicBaseFilter()
										: { ...value, items },
								)
							}}
						>
							<X className="size-4" />
						</Button>
					</div>
				)
			})}
			<Button
				type="button"
				variant="ghost"
				size="sm"
				className="h-7 shrink-0 px-2 text-xs text-muted-foreground"
				onClick={() => onChange(createEmptyMagicBaseFilter())}
			>
				{t("microAppPage.databasePanel.clearFilters")}
			</Button>
		</div>
	)
}
