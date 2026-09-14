import { ArrowDownToLine, ChevronDown, ChevronUp, Search, WrapText } from "lucide-react"
import { useTranslation } from "react-i18next"
import { Button } from "@/components/shadcn-ui/button"
import { Input } from "@/components/shadcn-ui/input"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/shadcn-ui/tooltip"

interface TerminalOutputToolbarProps {
	query: string
	onQueryChange: (query: string) => void
	count: number
	index: number
	onFind: (direction: 1 | -1) => void
	wrap: boolean
	onWrapChange: () => void
	onScrollToEnd: () => void
}

export function TerminalOutputToolbar({
	query,
	onQueryChange,
	count,
	index,
	onFind,
	wrap,
	onWrapChange,
	onScrollToEnd,
}: TerminalOutputToolbarProps) {
	const { t } = useTranslation("super")
	return (
		<div className="flex shrink-0 flex-wrap items-center gap-2 border-t border-border py-2 pl-[18px] pr-2.5 text-xs">
			<span className="shrink-0 text-muted-foreground">{t("terminal.output")}</span>
			<div className="flex min-w-[180px] flex-[1_1_190px] items-center gap-1">
				<Search size={16} aria-hidden className="shrink-0 text-muted-foreground" />
				<Input
					value={query}
					onChange={(event) => onQueryChange(event.target.value)}
					onKeyDown={(event) => {
						if (event.key === "Enter" && !event.nativeEvent.isComposing) {
							event.preventDefault()
							onFind(event.shiftKey ? -1 : 1)
						}
					}}
					type="search"
					placeholder={t("terminal.searchOutput")}
					aria-label={t("terminal.searchOutput")}
					className="h-7 min-w-[80px] flex-1 px-2 py-1 text-xs md:text-xs"
				/>
				{query && (
					<span
						className="shrink-0 whitespace-nowrap text-muted-foreground"
						role="status"
					>
						{count
							? t("terminal.searchMatches", { current: index + 1, count })
							: t("terminal.noMatches")}
					</span>
				)}
				<Tooltip>
					<TooltipTrigger asChild>
						<Button
							variant="ghost"
							size="icon-sm"
							className="size-6"
							aria-label={t("terminal.previousMatch")}
							disabled={!count}
							onClick={() => onFind(-1)}
						>
							<ChevronUp size={16} aria-hidden />
						</Button>
					</TooltipTrigger>
					<TooltipContent>{t("terminal.previousMatch")}</TooltipContent>
				</Tooltip>
				<Tooltip>
					<TooltipTrigger asChild>
						<Button
							variant="ghost"
							size="icon-sm"
							className="size-6"
							aria-label={t("terminal.nextMatch")}
							disabled={!count}
							onClick={() => onFind(1)}
						>
							<ChevronDown size={16} aria-hidden />
						</Button>
					</TooltipTrigger>
					<TooltipContent>{t("terminal.nextMatch")}</TooltipContent>
				</Tooltip>
			</div>
			<div className="flex shrink-0 items-center gap-1">
				<Button
					variant="ghost"
					size="sm"
					className="h-7 gap-1 px-1.5 text-xs font-normal aria-pressed:bg-muted aria-pressed:text-blue-600 dark:aria-pressed:text-blue-400"
					aria-pressed={wrap}
					onClick={onWrapChange}
				>
					<WrapText size={16} aria-hidden />
					{t("terminal.wrap")}
				</Button>
				<Button
					variant="ghost"
					size="sm"
					className="h-7 gap-1 px-1.5 text-xs font-normal"
					onClick={onScrollToEnd}
				>
					<ArrowDownToLine size={16} aria-hidden />
					{t("terminal.scrollToEnd")}
				</Button>
			</div>
		</div>
	)
}
