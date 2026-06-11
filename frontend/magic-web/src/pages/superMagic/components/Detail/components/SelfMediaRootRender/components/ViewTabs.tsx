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
			className={cn("min-w-0 flex-row gap-0", className)}
			data-testid="self-media-view-tabs"
		>
			<TabsList className="h-9 max-w-full justify-start overflow-x-auto rounded-lg bg-muted p-[3px]">
				{visibleOrder.map((view) => {
					return (
						<TabsTrigger
							key={view}
							value={view}
							data-testid={`self-media-view-${view}`}
							className="min-w-[72px] shrink-0 px-3 text-xs font-medium"
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
