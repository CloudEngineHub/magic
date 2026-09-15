import { useTranslation } from "react-i18next"
import { Search } from "lucide-react"
import { Button } from "@/components/shadcn-ui/button"
import { Input } from "@/components/shadcn-ui/input"
import { Spinner } from "@/components/shadcn-ui/spinner"
import type { useRecycleBinSearch } from "./useRecycleBinSearch"

interface Props {
	query: ReturnType<typeof useRecycleBinSearch>
	byLocation: boolean
	disabled: boolean
	onExit: () => void
}

export function RecycleBinSearchForm({ query, byLocation, disabled, onExit }: Props) {
	const { t } = useTranslation("super")
	if (!query.bounded || !query.limits || !query.range) return null
	const searching = query.status === "searching"
	const controlsDisabled = disabled || searching
	const { max_hours: maxHours, max_results: maxResults } = query.limits
	const { range } = query
	return (
		<form
			className="rounded-lg border border-border bg-muted/30 p-3"
			onSubmit={(event) => {
				event.preventDefault()
				void query.runSearch()
			}}
		>
			<div className="mb-3 flex items-center justify-between gap-2">
				<span className="text-sm font-medium">
					{byLocation
						? t("recycleBin.project.location")
						: t("recycleBin.project.nameSearch")}
				</span>
				<Button
					type="button"
					size="sm"
					variant="ghost"
					disabled={disabled}
					onClick={onExit}
				>
					{t("recycleBin.project.exitSearch")}
				</Button>
			</div>
			<div className="flex flex-wrap items-end gap-3">
				<label className="flex flex-col gap-1 text-xs text-muted-foreground">
					{t("recycleBin.project.deletionPeriod")}
					<select
						className="h-9 rounded-md border border-input bg-background px-2 text-sm text-foreground"
						value={query.period}
						disabled={controlsDisabled}
						onChange={(event) => {
							const value = event.target.value
							if (value === "recent" || value === "hour" || value === "custom")
								query.changePeriod(value)
						}}
					>
						<option value="recent">
							{t("recycleBin.project.recentHours", { hours: maxHours })}
						</option>
						<option value="hour">{t("recycleBin.project.recentHour")}</option>
						<option value="custom">{t("recycleBin.project.customPeriod")}</option>
					</select>
				</label>
				<label className="flex min-w-0 flex-col gap-1 text-xs text-muted-foreground">
					{t("recycleBin.project.startTime")}
					<Input
						type="datetime-local"
						step={1}
						className="h-9 w-full text-foreground"
						value={range.start}
						disabled={controlsDisabled}
						onChange={(event) =>
							query.changeRange({ ...range, start: event.target.value })
						}
					/>
				</label>
				<label className="flex min-w-0 flex-col gap-1 text-xs text-muted-foreground">
					{t("recycleBin.project.endTime")}
					<Input
						type="datetime-local"
						step={1}
						className="h-9 w-full text-foreground"
						value={range.end}
						disabled={controlsDisabled}
						onChange={(event) =>
							query.changeRange({ ...range, end: event.target.value })
						}
					/>
				</label>
				<Button type="submit" size="sm" className="h-9" disabled={controlsDisabled}>
					<Search size={16} />
					{byLocation
						? t("recycleBin.project.searchAndGroup")
						: t("recycleBin.project.search")}
				</Button>
				{searching && (
					<Button type="button" size="sm" variant="outline" onClick={query.cancelSearch}>
						{t("recycleBin.project.cancelSearch")}
					</Button>
				)}
			</div>
			<p className="mt-2 text-xs text-muted-foreground">
				{t("recycleBin.project.queryLimits", { hours: maxHours, count: maxResults })}
			</p>
			<div className="mt-2 text-xs text-muted-foreground" role="status" aria-live="polite">
				{searching && (
					<span className="inline-flex items-center gap-2">
						<Spinner className="size-4" />
						{t("recycleBin.project.searchProgress", { count: query.progress })}
					</span>
				)}
				{query.status === "ready" &&
					t("recycleBin.project.searchComplete", { count: query.items.length })}
				{query.status === "stale" && t("recycleBin.project.searchStale")}
			</div>
		</form>
	)
}
