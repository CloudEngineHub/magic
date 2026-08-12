import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react"
import { cn } from "@/lib/utils"
import {
	centerHorizontalItemInContainer,
	useHorizontalScrollWithFade,
} from "../../hooks/useHorizontalScrollWithFade"

export interface RecordingDetailTabItem {
	key: string
	label: string
	/** Optional count badge (e.g. future marks tab); hidden when absent or zero. */
	badgeCount?: number
}

interface RecordingDetailTabStripProps {
	tabs: RecordingDetailTabItem[]
	activeKey: string
	onChange: (key: string) => void
}

const PILL_SHADOW = "0px 4px 12px 0px rgba(0,0,0,0.15)"
const PILL_TRANSITION =
	"left 220ms cubic-bezier(0.4,0,0.2,1), width 220ms cubic-bezier(0.4,0,0.2,1), opacity 120ms"

/** Horizontal pill tab strip with sliding indicator aligned to the recording detail prototype. */
export function RecordingDetailTabStrip({
	tabs,
	activeKey,
	onChange,
}: RecordingDetailTabStripProps) {
	const tabRefs = useRef<Partial<Record<string, HTMLButtonElement>>>({})
	const innerRef = useRef<HTMLDivElement>(null)
	const { scrollRef, canScrollStart, canScrollEnd, refreshFadeState } =
		useHorizontalScrollWithFade<HTMLDivElement>()
	const [pill, setPill] = useState({ left: 0, width: 0, ready: false })

	/** Measures active tab position relative to the w-max inner row for the sliding pill. */
	const measurePill = useCallback(() => {
		const inner = innerRef.current
		const btn = tabRefs.current[activeKey]
		if (!inner || !btn) return

		setPill({
			left: btn.offsetLeft,
			width: btn.offsetWidth,
			ready: true,
		})
	}, [activeKey])

	useLayoutEffect(() => {
		measurePill()
		const bar = scrollRef.current
		const inner = innerRef.current
		if (!bar || typeof ResizeObserver === "undefined") {
			window.addEventListener("resize", measurePill)
			return () => window.removeEventListener("resize", measurePill)
		}

		const observer = new ResizeObserver(measurePill)
		observer.observe(bar)
		if (inner) observer.observe(inner)
		bar.addEventListener("scroll", measurePill, { passive: true })
		window.addEventListener("resize", measurePill)
		return () => {
			observer.disconnect()
			bar.removeEventListener("scroll", measurePill)
			window.removeEventListener("resize", measurePill)
		}
	}, [measurePill, scrollRef, tabs])

	// Recompute edge fades when tab count/labels change the scrollable width.
	useEffect(() => {
		refreshFadeState()
	}, [refreshFadeState, tabs])

	// Keep the active tab visible when the strip overflows horizontally.
	useEffect(() => {
		const activeTab = tabRefs.current[activeKey]
		const bar = scrollRef.current
		if (!activeTab || !bar) return
		centerHorizontalItemInContainer(bar, activeTab)
	}, [activeKey, scrollRef])

	return (
		<div
			className="relative flex min-h-[57px] min-w-0 shrink-0 overflow-hidden rounded-t-[22px] border-b border-border px-4"
			data-testid="recording-detail-tab-strip"
		>
			{/*
			 * -mx-4 extends the scroll viewport to the card edges while outer px-4 keeps content aligned.
			 * Fades must live on this same wrapper so they cover the full bleed width.
			 */}
			<div className="relative -mx-4 min-w-0 flex-1 overflow-hidden">
				<div
					ref={scrollRef}
					className="no-scrollbar overflow-x-auto px-4 py-3"
					data-testid="recording-detail-tab-scroll"
				>
					<div
						ref={innerRef}
						className="relative flex w-max flex-nowrap items-center gap-1"
						data-testid="recording-detail-tab-inner"
					>
						<span
							aria-hidden
							className="pointer-events-none absolute top-1/2 z-0 h-8 -translate-y-1/2 rounded-full bg-foreground"
							style={{
								left: pill.left,
								width: pill.width,
								opacity: pill.ready ? 1 : 0,
								boxShadow: PILL_SHADOW,
								transition: PILL_TRANSITION,
							}}
						/>
						{tabs.map((tab) => {
							const isActive = tab.key === activeKey
							const showBadge = (tab.badgeCount ?? 0) > 0

							return (
								<button
									key={tab.key}
									ref={(element) => {
										tabRefs.current[tab.key] = element ?? undefined
									}}
									type="button"
									data-tab-key={tab.key}
									className={cn(
										"relative z-10 inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full px-5 text-[14px] font-medium leading-none transition-colors duration-200",
										isActive ? "text-background" : "text-muted-foreground",
									)}
									onClick={() => onChange(tab.key)}
									data-testid={`recording-detail-tab-${tab.key}`}
								>
									{tab.label}
									{showBadge ? (
										<RecordingDetailTabBadge
											count={tab.badgeCount ?? 0}
											isActive={isActive}
											tabKey={tab.key}
										/>
									) : null}
								</button>
							)
						})}
					</div>
				</div>

				{canScrollStart ? (
					<div
						className="pointer-events-none absolute inset-y-0 left-0 z-20 w-8 bg-gradient-to-r from-card from-40% via-card/90 to-transparent"
						data-testid="recording-detail-tab-fade-start"
						aria-hidden
					/>
				) : null}

				{canScrollEnd ? (
					<div
						className="pointer-events-none absolute inset-y-0 right-0 z-20 w-12 bg-gradient-to-l from-card from-40% via-card/90 to-transparent"
						data-testid="recording-detail-tab-fade-end"
						aria-hidden
					/>
				) : null}
			</div>
		</div>
	)
}

/** Circular count badge shown beside tabs such as the future marks tab. */
function RecordingDetailTabBadge({
	count,
	isActive,
	tabKey,
}: {
	count: number
	isActive: boolean
	tabKey: string
}) {
	return (
		<span
			className={cn(
				"inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full px-1 text-[11px] font-semibold tabular-nums leading-none",
				isActive
					? "bg-background/25 text-background"
					: "bg-muted-foreground/20 text-muted-foreground",
			)}
			data-testid={`recording-detail-tab-badge-${tabKey}`}
		>
			{count}
		</span>
	)
}
