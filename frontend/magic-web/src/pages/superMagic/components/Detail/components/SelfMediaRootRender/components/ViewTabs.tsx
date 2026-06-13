import { memo } from "react"
import { cn } from "@/lib/utils"
import { useTranslation } from "react-i18next"
import { Tabs, TabsList, TabsTrigger } from "@/components/shadcn-ui/tabs"
import type { SelfMediaView } from "../types"

interface ViewTabsProps {
	value: SelfMediaView
	onChange: (view: SelfMediaView) => void
	labels?: Partial<Record<SelfMediaView, string>>
	/** Override visible tab order; defaults to all four views */
	order?: SelfMediaView[]
	className?: string
}

const DEFAULT_ORDER: SelfMediaView[] = ["feed", "detail", "scroll", "edit", "code"]

function ViewTabs({ value, onChange, labels, order, className }: ViewTabsProps) {
	const { t } = useTranslation("super")
	const defaultLabels: Record<SelfMediaView, string> = {
		feed: t("detail.selfMedia.viewTabs.feed"),
		detail: t("detail.selfMedia.viewTabs.detail"),
		scroll: t("detail.selfMedia.viewTabs.scroll"),
		edit: t("detail.selfMedia.viewTabs.edit"),
		code: t("detail.selfMedia.viewTabs.code"),
	}
	const visibleOrder = order && order.length > 0 ? order : DEFAULT_ORDER

	return (
		<Tabs
			value={value}
			onValueChange={(nextView) => onChange(nextView as SelfMediaView)}
			className={cn("w-max max-w-none shrink-0 flex-row gap-0", className)}
			data-testid="self-media-view-tabs"
		>
			<TabsList className="h-12 w-max max-w-none shrink-0 justify-start overflow-visible rounded-[18px] bg-[#efeff0] p-1">
				{visibleOrder.map((view) => {
					return (
						<TabsTrigger
							key={view}
							value={view}
							data-testid={`self-media-view-${view}`}
							className="h-10 min-w-[92px] shrink-0 rounded-[14px] px-4 text-sm font-[700] text-[#18181b] data-[state=active]:bg-white data-[state=active]:shadow-[0_3px_10px_rgba(24,24,27,0.06)]"
						>
							{labels?.[view] || defaultLabels[view]}
						</TabsTrigger>
					)
				})}
			</TabsList>
		</Tabs>
	)
}

export default memo(ViewTabs)
