import { useEffect, useRef, type ReactNode } from "react"
import { ChevronDown, ChevronRight } from "lucide-react"
import { useTranslation } from "react-i18next"
import { Button } from "@/components/shadcn-ui/button"
import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from "@/components/shadcn-ui/collapsible"
import { cn } from "@/utils/cn"

export interface HelpNavigationItem {
	id: string
	label: string
	icon: ReactNode
}

export interface HelpNavigationGroup {
	id: string
	label: string
	items: HelpNavigationItem[]
	children?: HelpNavigationGroup[]
}

interface HelpNavigationProps {
	groups: HelpNavigationGroup[]
	activeId: string
	expanded: ReadonlySet<string>
	onExpandedChange: (id: string, expanded: boolean) => void
	onSelect: (id: string) => void
}

/** 目录只管理说明导航；折叠状态由当前阅读会话持有，不写入应用侧栏设置。 */
export function HelpNavigation({
	groups,
	activeId,
	expanded,
	onExpandedChange,
	onSelect,
}: HelpNavigationProps) {
	const { t } = useTranslation("interface")
	const ref = useRef<HTMLElement>(null)
	useEffect(() => {
		ref.current
			?.querySelector<HTMLElement>('[aria-current="page"]')
			?.scrollIntoView({ block: "nearest" })
	}, [activeId, expanded])
	function renderGroup(group: HelpNavigationGroup): ReactNode {
		const open = expanded.has(group.id)
		return (
			<Collapsible
				key={group.id}
				open={open}
				onOpenChange={(value) => onExpandedChange(group.id, value)}
			>
				<CollapsibleTrigger asChild>
					<Button
						variant="ghost"
						className="h-auto min-h-9 w-full justify-start gap-2 whitespace-normal px-2 text-left text-xs font-medium [@media(pointer:coarse)]:min-h-11"
					>
						{open ? (
							<ChevronDown size={14} aria-hidden />
						) : (
							<ChevronRight size={14} aria-hidden />
						)}
						{group.label}
					</Button>
				</CollapsibleTrigger>
				<CollapsibleContent className="mb-3 ml-3 space-y-1 border-l border-border pl-2">
					{group.items.map((item) => (
						<Button
							key={item.id}
							variant="ghost"
							aria-current={item.id === activeId ? "page" : undefined}
							onClick={() => onSelect(item.id)}
							className={cn(
								"h-auto min-h-9 w-full justify-start gap-2 whitespace-normal px-2 py-2 text-left text-xs font-normal leading-5 [@media(pointer:coarse)]:min-h-11",
								item.id === activeId &&
									"bg-[var(--help-soft)] font-medium text-[var(--help-accent)] hover:bg-[var(--help-soft)] hover:text-[var(--help-accent)]",
							)}
						>
							<span className="inline-flex shrink-0" aria-hidden>
								{item.icon}
							</span>
							<span className="min-w-0 break-words">{item.label}</span>
						</Button>
					))}
					{group.children?.map(renderGroup)}
				</CollapsibleContent>
			</Collapsible>
		)
	}
	return (
		<nav ref={ref} aria-label={t("contextHelp.contents")} className="p-3">
			<p className="px-2 pb-3 text-[11px] leading-5 text-muted-foreground">
				{t("contextHelp.catalogHint")}
			</p>
			{groups.map(renderGroup)}
		</nav>
	)
}
