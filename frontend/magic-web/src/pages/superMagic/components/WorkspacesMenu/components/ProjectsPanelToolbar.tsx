import type { ChangeEventHandler, ReactNode } from "react"
import { useTranslation } from "react-i18next"
import { Search } from "lucide-react"
import { Input } from "@/components/shadcn-ui/input"
import SmartTooltip from "@/components/other/SmartTooltip"

/** 活动内容持有唯一搜索与范围标题；窗口和列表不再重复渲染同一组控制。 */
export function ProjectsPanelToolbar({
	location,
	total,
	searchValue,
	onSearchValueChange,
	viewToggle,
	children,
}: {
	location: ReactNode
	total?: number
	searchValue: string
	onSearchValueChange: ChangeEventHandler<HTMLInputElement>
	viewToggle?: ReactNode
	children?: ReactNode
}) {
	const { t } = useTranslation("super")
	return (
		<div
			className="shrink-0 border-b border-border px-4 py-3 [container-type:inline-size]"
			data-testid="projects-panel-toolbar"
		>
			{/* 窄面板固定标题与视图一排，筛选与搜索另一排，不让控件逐个随机折行。 */}
			<div className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-x-3 gap-y-2 [@container_(max-width:760px)]:grid-cols-[minmax(0,1fr)_auto]">
				<div className="flex min-w-0 items-center gap-2 text-sm font-medium">
					{typeof location === "string" ? (
						<SmartTooltip className="min-w-0" align="start">
							{location}
						</SmartTooltip>
					) : (
						<div className="flex min-w-0 items-center gap-2 [&_svg]:shrink-0">
							{location}
						</div>
					)}
					{total !== undefined && (
						<span className="shrink-0 text-xs font-normal text-muted-foreground">
							· {total}
						</span>
					)}
				</div>
				<div className="flex min-w-0 flex-wrap items-center gap-2 [@container_(max-width:760px)]:order-3 [@container_(max-width:760px)]:col-span-2">
					{children}
					<div className="relative w-40 min-w-32 shrink transition-[width] focus-within:w-64 [@container_(max-width:760px)]:w-auto [@container_(max-width:760px)]:flex-1 [@container_(max-width:760px)]:focus-within:w-auto">
						<Search
							size={16}
							className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground"
						/>
						<Input
							className="h-8 bg-fill pl-8"
							placeholder={t("project.searchProject")}
							aria-label={t("project.searchProject")}
							value={searchValue}
							onChange={onSearchValueChange}
							data-testid="shared-workspace-dialog-search-input"
						/>
					</div>
				</div>
				{viewToggle && <div className="shrink-0">{viewToggle}</div>}
			</div>
		</div>
	)
}
