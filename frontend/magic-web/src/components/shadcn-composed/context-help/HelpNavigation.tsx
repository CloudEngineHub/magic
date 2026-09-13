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
	articleId?: string
	label: string
	icon: ReactNode
	children?: HelpNavigationItem[]
}

export interface HelpNavigationGroup {
	id: string
	label: string
	items: HelpNavigationItem[]
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
	function renderItem(item: HelpNavigationItem): ReactNode {
		const hasChildren = Boolean(item.children?.length)
		const open = expanded.has(item.id)
		const active = item.articleId === activeId
		// 文件夹名称打开说明，箭头只展开目录；两个按钮保持独立的键盘操作。
		return (
			<Collapsible
				key={item.id}
				open={open}
				onOpenChange={(value) => onExpandedChange(item.id, value)}
			>
				<div
					className={cn(
						"flex items-center rounded-md",
						active && "bg-[var(--help-soft)] text-[var(--help-accent)]",
					)}
				>
					{hasChildren ? (
						<CollapsibleTrigger asChild>
							<Button
								variant="ghost"
								size="icon"
								aria-label={`${open ? t("contextHelp.collapse") : t("contextHelp.expand")} · ${item.label}`}
								className="size-7 shrink-0 [@media(pointer:coarse)]:h-11"
							>
								{open ? (
									<ChevronDown size={14} aria-hidden />
								) : (
									<ChevronRight size={14} aria-hidden />
								)}
							</Button>
						</CollapsibleTrigger>
					) : (
						<span className="w-7 shrink-0" />
					)}
					<Button
						variant="ghost"
						aria-current={active ? "page" : undefined}
						onClick={() =>
							item.articleId
								? onSelect(item.articleId)
								: onExpandedChange(item.id, !open)
						}
						className={cn(
							"h-auto min-h-9 min-w-0 flex-1 justify-start gap-2 whitespace-normal px-1 py-2 text-left text-xs font-normal leading-5 [@media(pointer:coarse)]:min-h-11",
							active &&
								"font-medium hover:bg-[var(--help-soft)] hover:text-[var(--help-accent)]",
						)}
					>
						<span className="inline-flex shrink-0" aria-hidden>
							{item.icon}
						</span>
						<span className="min-w-0 break-words">{item.label}</span>
					</Button>
				</div>
				{hasChildren && (
					<CollapsibleContent className="ml-3 border-l border-border pl-1">
						{item.children?.map(renderItem)}
					</CollapsibleContent>
				)}
			</Collapsible>
		)
	}
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
					{group.items.map(renderItem)}
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
