import { useLayoutEffect, useRef, useState, type MouseEventHandler } from "react"
import type { LucideIcon } from "lucide-react"
import { useTranslation } from "react-i18next"
import { SidebarMenuButton, SidebarMenuItem } from "@/components/shadcn-ui/sidebar"
import { useSlidesTemplateTotal } from "@/pages/superMagic/hooks/useSlidesTemplateTotal"
import { formatNumber } from "@/utils/format"
import { cn } from "@/lib/utils"
import { SlidesTemplateCountBadge } from "./SlidesTemplateCountBadge"

const TEMPLATE_COUNT_MARKER = "__TEMPLATE_COUNT__"

interface SlidesTemplateSidebarMenuItemProps {
	title: string
	testId: string
	Icon: LucideIcon
	href: string
	collapsed: boolean
	onClick: MouseEventHandler<HTMLAnchorElement>
}

export function canShowSlidesTemplateCount({
	availableWidth,
	iconWidth,
	titleWidth,
	countWidth,
	gap,
}: {
	availableWidth: number
	iconWidth: number
	titleWidth: number
	countWidth: number
	gap: number
}) {
	const requiredWidth = iconWidth + titleWidth + countWidth + gap * 2
	return requiredWidth <= availableWidth + 1
}

export function SlidesTemplateSidebarMenuItem({
	title,
	testId,
	Icon,
	href,
	collapsed,
	onClick,
}: SlidesTemplateSidebarMenuItemProps) {
	const { t } = useTranslation("sidebar")
	const rowRef = useRef<HTMLDivElement>(null)
	const titleRef = useRef<HTMLSpanElement>(null)
	const countMeasureRef = useRef<HTMLSpanElement>(null)
	const templateTotal = useSlidesTemplateTotal()
	const [shouldShowCount, setShouldShowCount] = useState(true)
	const countLabel =
		templateTotal !== undefined
			? t("slidesTemplates.templateCount", { count: TEMPLATE_COUNT_MARKER })
			: null
	const countMarkerIndex = countLabel?.indexOf(TEMPLATE_COUNT_MARKER) ?? -1
	const countPrefix =
		countLabel && countMarkerIndex >= 0 ? countLabel.slice(0, countMarkerIndex).trim() : ""
	const countSuffix =
		countLabel && countMarkerIndex >= 0
			? countLabel.slice(countMarkerIndex + TEMPLATE_COUNT_MARKER.length).trim()
			: (countLabel ?? "")
	const countForMeasure =
		templateTotal !== undefined
			? t("slidesTemplates.templateCount", { count: formatNumber(templateTotal) })
			: null

	useLayoutEffect(() => {
		const row = rowRef.current
		const titleElement = titleRef.current
		const countBadge = countMeasureRef.current
		if (!row || !titleElement || !countBadge || !countForMeasure || collapsed) return

		const updateVisibility = () => {
			const rowStyle = window.getComputedStyle(row)
			const gap = Number.parseFloat(rowStyle.columnGap || rowStyle.gap) || 0
			const icon = row.firstElementChild as HTMLElement | null
			const nextVisible = canShowSlidesTemplateCount({
				availableWidth: row.clientWidth,
				iconWidth: icon?.getBoundingClientRect().width ?? 0,
				titleWidth: titleElement.scrollWidth,
				countWidth: countBadge.getBoundingClientRect().width,
				gap,
			})

			setShouldShowCount((current) => (current === nextVisible ? current : nextVisible))
		}

		updateVisibility()
		const resizeObserver = new ResizeObserver(updateVisibility)
		resizeObserver.observe(row)
		resizeObserver.observe(titleElement)
		resizeObserver.observe(countBadge)

		return () => resizeObserver.disconnect()
	}, [collapsed, countForMeasure])

	const tooltip = collapsed
		? templateTotal !== undefined
			? {
					children: (
						<div
							className="flex items-center gap-2 text-sm"
							data-testid="sidebar-content-slides-templates-tooltip"
						>
							<span>{title}</span>
							<SlidesTemplateCountBadge
								templateTotal={templateTotal}
								templateCountPrefix={countPrefix}
								templateCountSuffix={countSuffix}
							/>
						</div>
					),
				}
			: title
		: undefined

	return (
		<SidebarMenuItem>
			<SidebarMenuButton
				asChild
				tooltip={tooltip}
				data-testid={testId}
				className={
					collapsed
						? "!text-[#ff6a1f] hover:!bg-[#fff2ec] hover:!text-[#ff6a1f]"
						: "text-sidebar-foreground"
				}
			>
				<a href={href} onClick={onClick} className="text-current no-underline">
					<div ref={rowRef} className="relative flex min-w-0 flex-1 items-center gap-2">
						<Icon className="h-4 w-4 shrink-0" />
						<span
							ref={titleRef}
							className={cn(
								"min-w-0 overflow-hidden text-ellipsis whitespace-nowrap text-left text-sm leading-5",
								templateTotal !== undefined ? "shrink" : "flex-1",
							)}
						>
							{title}
						</span>
						{templateTotal !== undefined && countForMeasure ? (
							<>
								{!collapsed ? (
									<SlidesTemplateCountBadge
										templateTotal={templateTotal}
										templateCountPrefix={countPrefix}
										templateCountSuffix={countSuffix}
										testId="sidebar-content-slides-templates-count"
										showCount={shouldShowCount}
									/>
								) : null}
								<SlidesTemplateCountBadge
									templateTotal={templateTotal}
									templateCountPrefix={countPrefix}
									templateCountSuffix={countSuffix}
									animateNumber={false}
									badgeRef={countMeasureRef}
									className="pointer-events-none invisible absolute left-0 top-0"
								/>
							</>
						) : null}
					</div>
				</a>
			</SidebarMenuButton>
		</SidebarMenuItem>
	)
}
