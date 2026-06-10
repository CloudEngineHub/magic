import { memo, type UIEvent, useCallback, useEffect, useMemo, useRef, useState } from "react"
import { motion } from "framer-motion"
import { useTranslation } from "react-i18next"
import {
	Bot,
	CalendarClock,
	Clock3,
	History,
	Loader2,
	Play,
	Settings,
	Sparkles,
	type LucideIcon,
} from "lucide-react"
import { cn } from "@/lib/utils"
import AICardIframe from "./AICardIframe"
import type { AICardEntry, AICardHistoryEntry, AICardProjectConfig } from "../types"
import {
	buildAICardDashboardItems,
	type AICardAttachmentNode,
	type AICardDashboardItem,
} from "../utils/aiCardDashboardItems"

/**
 * Compute a fingerprint for only the relevant file nodes (by checking existence).
 * Only reacts when the set of relevant files in the tree actually changes.
 */
function computeRelevantFingerprint(
	list: AICardAttachmentNode[] | undefined,
	fileIds: Set<string>,
): string {
	if (!list?.length || fileIds.size === 0) return ""
	const found: string[] = []
	const stack = [...list]
	while (stack.length > 0) {
		const node = stack.pop()
		if (!node) continue
		if (node.file_id && fileIds.has(node.file_id)) {
			found.push(node.file_id)
		}
		if (node.children?.length) stack.push(...node.children)
	}
	found.sort()
	return found.join(",")
}

/**
 * Returns a stable reference to attachmentList that only updates
 * when the set of relevant file_ids (those the dashboard cares about) changes.
 */
function useStableAttachmentList(
	attachmentList: AICardAttachmentNode[] | undefined,
	relevantFileIds: Set<string>,
) {
	const stableRef = useRef(attachmentList)
	const fingerprintRef = useRef("")

	const fingerprint = computeRelevantFingerprint(attachmentList, relevantFileIds)
	if (fingerprint !== fingerprintRef.current) {
		fingerprintRef.current = fingerprint
		stableRef.current = attachmentList
	}

	return stableRef.current
}

type DashboardTranslate = (key: string, values?: Record<string, unknown>) => string
type HistoryScrollSyncSource = "card" | "timeline"

function buildHeaderMetaItems(
	projectConfig: AICardProjectConfig | null | undefined,
	t: DashboardTranslate,
) {
	const scheduleText = formatScheduleSummary(projectConfig?.time_config, t)
	const modelText = formatModelSummary(projectConfig, t)
	const items: Array<{ key: string; text: string; icon: LucideIcon }> = []

	if (scheduleText) {
		items.push({
			key: "schedule",
			text: scheduleText,
			icon: CalendarClock,
		})
	}
	if (modelText) {
		items.push({
			key: "model",
			text: modelText,
			icon: Bot,
		})
	}

	return items
}

function getClosestHorizontalItemIndex(container: HTMLElement, items: Array<HTMLElement | null>) {
	const containerRect = container.getBoundingClientRect()
	const containerCenter = containerRect.left + containerRect.width / 2
	let nextIndex = 0
	let closestDistance = Number.POSITIVE_INFINITY

	for (let index = 0; index < items.length; index += 1) {
		const item = items[index]
		if (!item) continue

		const rect = item.getBoundingClientRect()
		const itemCenter = rect.left + rect.width / 2
		const distance = Math.abs(itemCenter - containerCenter)
		if (distance < closestDistance) {
			closestDistance = distance
			nextIndex = index
		}
	}

	return nextIndex
}

interface AICardDashboardProps {
	cards: AICardEntry[]
	historyEntries: AICardHistoryEntry[]
	projectConfig?: AICardProjectConfig | null
	attachmentList?: AICardAttachmentNode[]
	onOpenCard: (cardId: string) => void
	onOpenConfig?: () => void
	onRunNow?: () => void
	isRunNowLoading?: boolean
	onOpenHistoryEntry?: (entry: AICardHistoryEntry) => void
}

function AICardDashboard({
	cards,
	historyEntries,
	projectConfig,
	attachmentList,
	onOpenCard,
	onOpenConfig,
	onRunNow,
	isRunNowLoading = false,
	onOpenHistoryEntry,
}: AICardDashboardProps) {
	const { t } = useTranslation("super")
	const headerMetaItems = useMemo(
		() => buildHeaderMetaItems(projectConfig, t),
		[projectConfig, t],
	)
	// Collect file IDs that the dashboard actually uses
	const relevantFileIds = useMemo(() => {
		const ids = new Set<string>()
		for (const card of cards) {
			if (card.latestHtmlFileId) ids.add(card.latestHtmlFileId)
		}
		for (const entry of historyEntries) {
			if (entry.fileId) ids.add(entry.fileId)
		}
		return ids
	}, [cards, historyEntries])

	// Stabilize attachmentList: only treat as changed when relevant file_ids change
	const stableAttachmentList = useStableAttachmentList(attachmentList, relevantFileIds)

	const dashboardItems = useMemo(
		() =>
			buildAICardDashboardItems({
				cards,
				historyEntries,
				attachmentList: stableAttachmentList,
			}),
		[cards, historyEntries, stableAttachmentList],
	)
	const { latestItems, historyItems } = useMemo(() => {
		const latest: AICardDashboardItem[] = []
		const history: AICardDashboardItem[] = []
		for (const item of dashboardItems) {
			if (item.kind === "latest") latest.push(item)
			else history.push(item)
		}
		return { latestItems: latest, historyItems: history }
	}, [dashboardItems])

	if (cards.length === 0) {
		return (
			<motion.div
				initial={{ opacity: 0, scale: 0.95 }}
				animate={{ opacity: 1, scale: 1 }}
				transition={{ duration: 0.3 }}
				className="flex h-full flex-col items-center justify-center gap-4 p-8"
				data-testid="ai-card-dashboard-loading"
			>
				<div className="text-6xl opacity-40">🃏</div>
				<div className="text-center">
					<h3 className="text-lg font-semibold text-foreground">
						{t("detail.aiCard.dashboard.loading")}
					</h3>
					<p className="mt-1 text-sm text-muted-foreground">
						{t("detail.aiCard.dashboard.loadingDescription")}
					</p>
				</div>
			</motion.div>
		)
	}

	const card = cards[0]

	return (
		<motion.div
			initial={{ opacity: 0, y: 10 }}
			animate={{ opacity: 1, y: 0 }}
			transition={{ duration: 0.3 }}
			className="relative flex h-full flex-col overflow-hidden bg-muted/20"
			data-testid="ai-card-dashboard"
		>
			<div className="pointer-events-none absolute inset-x-0 top-0 h-36 bg-gradient-to-b from-primary/10 to-transparent" />
			{/* Header */}
			<div className="relative z-10 flex flex-wrap items-center justify-between gap-3 border-b border-border/70 bg-background/80 px-4 py-3 backdrop-blur-xl">
				<div className="min-w-0">
					<h2 className="truncate text-lg font-bold text-foreground">{card.name}</h2>
					{card.description && (
						<p className="line-clamp-2 text-sm text-muted-foreground">
							{card.description}
						</p>
					)}
				</div>
			</div>

			<div className="relative z-10 flex-1 overflow-y-auto px-4 py-4 sm:px-5">
				{dashboardItems.length > 0 ? (
					<div className="space-y-7" data-testid="ai-card-dashboard-card-grid">
						<LatestSection
							items={latestItems}
							card={card}
							headerMetaItems={headerMetaItems}
							attachmentList={stableAttachmentList}
							onOpenCard={onOpenCard}
							onOpenConfig={onOpenConfig}
							onRunNow={onRunNow}
							isRunNowLoading={isRunNowLoading}
							onOpenHistoryEntry={onOpenHistoryEntry}
						/>
						<HistoryTimeline
							items={historyItems}
							attachmentList={stableAttachmentList}
							onOpenCard={onOpenCard}
							onOpenHistoryEntry={onOpenHistoryEntry}
						/>
					</div>
				) : (
					<div
						className="flex h-full min-h-[280px] items-center justify-center rounded-xl border border-dashed border-border text-sm text-muted-foreground"
						data-testid="ai-card-dashboard-empty"
					>
						{t("detail.aiCard.dashboard.empty")}
					</div>
				)}
			</div>
		</motion.div>
	)
}

interface DashboardSectionProps {
	items: AICardDashboardItem[]
	attachmentList?: AICardAttachmentNode[]
	onOpenCard: (cardId: string) => void
	onOpenHistoryEntry?: (entry: AICardHistoryEntry) => void
}

interface DashboardMetaItem {
	key: string
	text: string
	icon: LucideIcon
}

interface LatestSectionProps extends DashboardSectionProps {
	card: AICardEntry
	headerMetaItems: DashboardMetaItem[]
	onOpenConfig?: () => void
	onRunNow?: () => void
	isRunNowLoading: boolean
}

function LatestSection({
	items,
	card,
	headerMetaItems,
	attachmentList,
	onOpenCard,
	onOpenConfig,
	onRunNow,
	isRunNowLoading,
	onOpenHistoryEntry,
}: LatestSectionProps) {
	const { t } = useTranslation("super")
	if (items.length === 0) return null

	const primaryItem = items[0]
	const statusItems: DashboardMetaItem[] = [
		...headerMetaItems,
		...(card.lastUpdated
			? [
					{
						key: "updated",
						text: t("detail.aiCard.dashboard.updatedAt", {
							time: formatDateTime(card.lastUpdated),
						}),
						icon: Clock3,
					},
				]
			: []),
	]

	return (
		<section
			className="relative overflow-hidden rounded-2xl border border-neutral-200/90 bg-white shadow-[0_22px_70px_rgb(24,24,27,0.08)]"
			data-testid="ai-card-dashboard-latest-section"
		>
			<div className="pointer-events-none absolute inset-0 bg-[linear-gradient(135deg,#ffffff_0%,#f7f7f6_52%,#eeeeec_100%)]" />
			<motion.div
				aria-hidden="true"
				className="pointer-events-none absolute -left-1/3 top-10 h-px w-2/3 bg-gradient-to-r from-transparent via-neutral-900/12 to-transparent"
				animate={{ x: ["0%", "210%"], opacity: [0, 0.7, 0] }}
				transition={{ duration: 13, repeat: Infinity, ease: "easeInOut" }}
			/>
			<motion.div
				aria-hidden="true"
				className="pointer-events-none absolute -right-1/4 bottom-14 h-px w-1/2 bg-gradient-to-r from-transparent via-primary/18 to-transparent"
				animate={{ x: ["0%", "-220%"], opacity: [0, 0.55, 0] }}
				transition={{ duration: 16, repeat: Infinity, ease: "easeInOut", delay: 2.5 }}
			/>
			<motion.div
				aria-hidden="true"
				className="pointer-events-none absolute inset-y-0 left-1/2 w-28 -rotate-12 bg-gradient-to-r from-transparent via-white/35 to-transparent"
				animate={{ x: ["-220%", "220%"], opacity: [0, 0.45, 0] }}
				transition={{ duration: 18, repeat: Infinity, ease: "easeInOut", delay: 1 }}
			/>
			<div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-neutral-900/15 to-transparent" />
			<div className="relative grid gap-6 p-4 sm:p-5 lg:grid-cols-[minmax(280px,400px)_minmax(280px,1fr)] lg:items-center">
				<div className="relative flex min-h-[520px] items-center justify-center py-3 sm:min-h-[600px] lg:min-h-[610px]">
					<div className="absolute h-[86%] w-[72%] max-w-[340px] translate-x-8 -rotate-3 rounded-[28px] border border-neutral-200 bg-neutral-100/80 shadow-[0_18px_48px_rgb(24,24,27,0.08)]" />
					<div className="absolute h-[90%] w-[76%] max-w-[350px] translate-x-4 rotate-2 rounded-[28px] border border-neutral-200 bg-white/90 shadow-[0_18px_52px_rgb(24,24,27,0.10)]" />
					<div className="relative z-10 w-full max-w-[360px]">
						<DashboardCard
							item={primaryItem}
							index={0}
							variant="featured"
							attachmentList={attachmentList}
							onOpenCard={onOpenCard}
							onOpenHistoryEntry={onOpenHistoryEntry}
						/>
					</div>
				</div>

				<div className="flex min-h-[360px] flex-col justify-between py-2 lg:py-8">
					<div>
						<div className="inline-flex items-center gap-2 rounded-full border border-neutral-200 bg-white/85 px-3 py-1 text-xs font-medium text-neutral-700 shadow-sm">
							<Sparkles size={14} />
							<span>{t("detail.aiCard.dashboard.latestSectionTitle")}</span>
						</div>
						<h3 className="mt-4 text-2xl font-bold tracking-tight text-neutral-950">
							{primaryItem.title}
						</h3>
						{primaryItem.description && (
							<p className="mt-2 max-w-xl text-sm leading-6 text-neutral-600">
								{primaryItem.description}
							</p>
						)}
						<p className="mt-4 max-w-xl text-sm leading-6 text-neutral-500">
							{t("detail.aiCard.dashboard.latestSectionDescription")}
						</p>

						{statusItems.length > 0 && (
							<div
								className="mt-6 divide-y divide-neutral-200 rounded-xl border border-neutral-200 bg-white/75 px-3 shadow-sm"
								data-testid="ai-card-dashboard-header-meta"
							>
								{statusItems.map((item) => (
									<div
										key={item.key}
										className="flex min-w-0 items-center gap-3 py-3 text-sm"
									>
										<span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-neutral-100 text-neutral-700">
											<item.icon size={15} />
										</span>
										<span className="min-w-0 truncate font-medium text-neutral-800">
											{item.text}
										</span>
									</div>
								))}
							</div>
						)}
					</div>

					{(onRunNow || onOpenConfig) && (
						<div className="mt-6 flex flex-wrap gap-2">
							{onRunNow && (
								<button
									type="button"
									onClick={onRunNow}
									disabled={isRunNowLoading}
									className={cn(
										"flex items-center gap-2 rounded-lg border border-primary/30 bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-sm transition-all hover:bg-primary/90",
										isRunNowLoading && "cursor-not-allowed opacity-70",
									)}
									data-testid="ai-card-dashboard-run-button"
								>
									{isRunNowLoading ? (
										<Loader2 size={14} className="animate-spin" />
									) : (
										<Play size={14} />
									)}
									{isRunNowLoading
										? t("detail.aiCard.dashboard.running")
										: t("detail.aiCard.dashboard.runNow")}
								</button>
							)}
							{onOpenConfig && (
								<button
									type="button"
									onClick={onOpenConfig}
									className="flex items-center gap-2 rounded-lg border border-neutral-200 bg-white px-4 py-2 text-sm font-medium text-neutral-600 shadow-sm transition-all hover:border-neutral-300 hover:bg-neutral-50 hover:text-neutral-950"
									data-testid="ai-card-dashboard-config-button"
								>
									<Settings size={14} />
									{t("detail.aiCard.dashboard.configure")}
								</button>
							)}
						</div>
					)}
				</div>
			</div>
		</section>
	)
}

function HistoryTimeline({
	items,
	attachmentList,
	onOpenCard,
	onOpenHistoryEntry,
}: DashboardSectionProps) {
	const { t } = useTranslation("super")
	const [activeIndex, setActiveIndex] = useState(0)
	const activeIndexRef = useRef(0)
	const cardRefs = useRef<Array<HTMLDivElement | null>>([])
	const markerRefs = useRef<Array<HTMLButtonElement | null>>([])
	const cardScrollRafRef = useRef<number | null>(null)
	const timelineScrollRafRef = useRef<number | null>(null)
	const syncSourceRef = useRef<HistoryScrollSyncSource | null>(null)
	const syncResetTimerRef = useRef<ReturnType<typeof window.setTimeout> | null>(null)

	useEffect(() => {
		activeIndexRef.current = activeIndex
		if (activeIndex >= items.length) {
			activeIndexRef.current = 0
			setActiveIndex(0)
		}
		cardRefs.current = cardRefs.current.slice(0, items.length)
		markerRefs.current = markerRefs.current.slice(0, items.length)
	}, [activeIndex, items.length])

	useEffect(
		() => () => {
			if (cardScrollRafRef.current !== null) {
				cancelAnimationFrame(cardScrollRafRef.current)
			}
			if (timelineScrollRafRef.current !== null) {
				cancelAnimationFrame(timelineScrollRafRef.current)
			}
			if (syncResetTimerRef.current !== null) {
				window.clearTimeout(syncResetTimerRef.current)
			}
		},
		[],
	)

	const markProgrammaticSync = useCallback(
		(source: HistoryScrollSyncSource, resetDelay = 180) => {
			syncSourceRef.current = source
			if (syncResetTimerRef.current !== null) {
				window.clearTimeout(syncResetTimerRef.current)
			}
			syncResetTimerRef.current = window.setTimeout(() => {
				syncSourceRef.current = null
				syncResetTimerRef.current = null
			}, resetDelay)
		},
		[],
	)

	const updateActiveIndex = useCallback((index: number) => {
		activeIndexRef.current = index
		setActiveIndex((current) => (current === index ? current : index))
	}, [])

	const scrollCardIntoView = useCallback((index: number, behavior: ScrollBehavior = "auto") => {
		cardRefs.current[index]?.scrollIntoView({
			behavior,
			block: "nearest",
			inline: "center",
		})
	}, [])

	const scrollMarkerIntoView = useCallback((index: number, behavior: ScrollBehavior = "auto") => {
		markerRefs.current[index]?.scrollIntoView({
			behavior,
			block: "nearest",
			inline: "center",
		})
	}, [])

	const handleTimelineSelect = useCallback(
		(index: number) => {
			updateActiveIndex(index)
			markProgrammaticSync("timeline", 450)
			scrollCardIntoView(index, "smooth")
		},
		[markProgrammaticSync, scrollCardIntoView, updateActiveIndex],
	)

	const handleTimelineScroll = useCallback(
		(event: UIEvent<HTMLDivElement>) => {
			if (syncSourceRef.current === "card") return
			if (timelineScrollRafRef.current !== null || items.length === 0) return

			const timelineRail = event.currentTarget
			timelineScrollRafRef.current = requestAnimationFrame(() => {
				const nextIndex = getClosestHorizontalItemIndex(timelineRail, markerRefs.current)

				if (activeIndexRef.current !== nextIndex) {
					updateActiveIndex(nextIndex)
					markProgrammaticSync("timeline")
					scrollCardIntoView(nextIndex)
				}

				timelineScrollRafRef.current = null
			})
		},
		[items.length, markProgrammaticSync, scrollCardIntoView, updateActiveIndex],
	)

	const handleCardRailScroll = useCallback(
		(event: UIEvent<HTMLDivElement>) => {
			if (syncSourceRef.current === "timeline") return
			if (cardScrollRafRef.current !== null || items.length === 0) return

			const cardRail = event.currentTarget
			cardScrollRafRef.current = requestAnimationFrame(() => {
				const nextIndex = getClosestHorizontalItemIndex(cardRail, cardRefs.current)

				if (activeIndexRef.current !== nextIndex) {
					updateActiveIndex(nextIndex)
					markProgrammaticSync("card")
					scrollMarkerIntoView(nextIndex)
				}

				cardScrollRafRef.current = null
			})
		},
		[items.length, markProgrammaticSync, scrollMarkerIntoView, updateActiveIndex],
	)

	return (
		<section
			className="overflow-hidden rounded-2xl border border-border/70 bg-background/75 shadow-[0_16px_52px_rgb(15,23,42,0.08)] backdrop-blur"
			data-testid="ai-card-dashboard-history-timeline"
		>
			<div className="border-b border-border/60 bg-gradient-to-r from-muted/60 via-background/80 to-muted/30 px-4 py-4 sm:px-5">
				<div className="flex flex-wrap items-end justify-between gap-3">
					<div>
						<div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
							<History size={14} />
							<span>{t("detail.aiCard.dashboard.historySectionTitle")}</span>
						</div>
						<p className="mt-1 text-sm text-muted-foreground">
							{t("detail.aiCard.dashboard.historySectionDescription")}
						</p>
					</div>
					{items.length > 0 && (
						<span className="rounded-full border border-border bg-background/80 px-2.5 py-1 text-xs font-medium text-muted-foreground shadow-sm">
							{t("detail.aiCard.dashboard.historyCount", { count: items.length })}
						</span>
					)}
				</div>

				{items.length > 0 && (
					<div className="relative mt-5">
						<div className="absolute left-3 right-3 top-[17px] h-px bg-gradient-to-r from-transparent via-border to-transparent" />
						<div
							onScroll={handleTimelineScroll}
							className="relative flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
							data-testid="ai-card-dashboard-timeline-rail"
						>
							{items.map((item, index) => {
								const isActive = index === activeIndex
								return (
									<button
										key={item.id}
										ref={(node) => {
											markerRefs.current[index] = node
										}}
										type="button"
										onClick={() => handleTimelineSelect(index)}
										aria-current={isActive ? "true" : "false"}
										className={cn(
											"relative flex min-w-[76px] flex-col items-center gap-1 rounded-xl px-2 py-1.5 text-xs transition-all duration-300",
											"focus:outline-none focus:ring-2 focus:ring-primary/25",
											isActive
												? "bg-background text-primary shadow-sm"
												: "text-muted-foreground hover:bg-background/70 hover:text-foreground",
										)}
										data-testid={`ai-card-dashboard-timeline-marker-${item.fileId}`}
									>
										<span
											className={cn(
												"size-3 rounded-full border transition-all duration-300",
												isActive
													? "border-primary bg-primary shadow-[0_0_0_5px_hsl(var(--primary)/0.12)]"
													: "border-border bg-background",
											)}
										/>
										<span className="max-w-[70px] truncate font-medium">
											{formatShortDate(item.createdAt)}
										</span>
									</button>
								)
							})}
						</div>
					</div>
				)}
			</div>

			{items.length > 0 ? (
				<div className="relative px-4 py-5 sm:px-5">
					<div className="pointer-events-none absolute inset-y-5 left-0 z-20 w-10 bg-gradient-to-r from-background to-transparent" />
					<div className="pointer-events-none absolute inset-y-5 right-0 z-20 w-10 bg-gradient-to-l from-background to-transparent" />
					<div
						onScroll={handleCardRailScroll}
						className="-mx-4 flex snap-x snap-mandatory gap-4 overflow-x-auto scroll-smooth px-4 pb-2 pt-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:-mx-5 sm:gap-5 sm:px-5"
						data-testid="ai-card-dashboard-card-rail"
					>
						{items.map((item, index) => {
							const isActive = index === activeIndex
							return (
								<div
									key={item.id}
									ref={(node) => {
										cardRefs.current[index] = node
									}}
									className={cn(
										"group/history shrink-0 snap-center rounded-[26px] bg-gradient-to-b p-1 transition-all duration-500",
										"w-[min(74vw,320px)] sm:w-[300px] lg:w-[320px]",
										isActive
											? "from-primary/30 to-primary/5 opacity-100 shadow-[0_18px_48px_rgb(15,23,42,0.14)]"
											: "from-background to-muted/40 opacity-75 hover:opacity-95",
										!isActive && "scale-[0.96]",
									)}
									data-active={isActive ? "true" : "false"}
									data-testid="ai-card-dashboard-timeline-item"
								>
									<DashboardCard
										item={item}
										index={index}
										variant="timeline"
										isActive={isActive}
										attachmentList={attachmentList}
										onOpenCard={onOpenCard}
										onOpenHistoryEntry={onOpenHistoryEntry}
									/>
								</div>
							)
						})}
					</div>
				</div>
			) : (
				<div
					className="m-4 flex min-h-[120px] items-center justify-center rounded-lg border border-dashed border-border bg-muted/20 px-4 py-6 text-sm text-muted-foreground"
					data-testid="ai-card-dashboard-history-empty"
				>
					{t("detail.aiCard.dashboard.historyEmpty")}
				</div>
			)}
		</section>
	)
}

interface DashboardCardProps {
	item: AICardDashboardItem
	index: number
	variant: "featured" | "timeline"
	isActive?: boolean
	attachmentList?: AICardAttachmentNode[]
	onOpenCard: (cardId: string) => void
	onOpenHistoryEntry?: (entry: AICardHistoryEntry) => void
}

const DashboardCard = memo(function DashboardCard({
	item,
	index,
	variant,
	isActive = false,
	attachmentList,
	onOpenCard,
	onOpenHistoryEntry,
}: DashboardCardProps) {
	const { t } = useTranslation("super")
	function handleClick() {
		if (item.kind === "latest" && item.cardId) {
			onOpenCard(item.cardId)
			return
		}

		if (item.historyEntry) onOpenHistoryEntry?.(item.historyEntry)
	}

	return (
		<motion.button
			type="button"
			initial={{ opacity: 0, y: 12 }}
			animate={{ opacity: 1, y: 0 }}
			transition={{ delay: Math.min(index * 0.03, 0.3) }}
			onClick={handleClick}
			className={cn(
				"group relative flex aspect-[9/16] w-full overflow-hidden bg-card text-left transition-all duration-500 ease-out",
				"hover:-translate-y-1.5 focus:outline-none focus:ring-2 focus:ring-primary/30",
				variant === "featured" &&
					"max-w-[360px] rounded-[24px] border border-primary/25 shadow-[0_24px_70px_rgb(0,0,0,0.18)] hover:border-primary/45 hover:shadow-[0_30px_80px_rgb(0,0,0,0.22)]",
				variant === "timeline" &&
					cn(
						"max-w-[320px] rounded-[22px] border shadow-[0_12px_32px_rgb(0,0,0,0.08)] hover:border-primary/35 hover:shadow-[0_20px_52px_rgb(0,0,0,0.14)]",
						isActive ? "border-primary/45" : "border-border/70",
					),
			)}
			data-testid="ai-card-dashboard-card"
			data-variant={variant}
			data-active={isActive ? "true" : "false"}
			data-card-id={item.fileId}
		>
			<div className="absolute inset-0 z-0 bg-muted/20 transition-transform duration-700 ease-out group-hover:scale-105">
				<AICardIframe
					fileId={item.fileId}
					attachmentList={attachmentList}
					className="pointer-events-none h-full w-full [&_iframe]:h-full [&_iframe]:w-full"
					hideVerticalScroll
					showSkeleton
				/>
			</div>

			<div className="absolute inset-x-5 top-0 z-10 h-px bg-gradient-to-r from-transparent via-white/70 to-transparent" />
			<div className="absolute inset-0 z-10 bg-gradient-to-t from-black/90 via-black/25 to-transparent opacity-75 transition-opacity duration-500 group-hover:opacity-90" />
			<div className="absolute inset-0 z-10 bg-gradient-to-br from-white/20 via-transparent to-transparent opacity-0 transition-opacity duration-500 group-hover:opacity-100" />

			<div className="absolute inset-x-3 top-3 z-20 flex items-start justify-between gap-2">
				<div
					className={cn(
						"rounded-full border border-white/20 bg-black/40 px-2 py-0.5 text-[10px] font-medium tracking-wide text-white shadow-sm backdrop-blur-md transition-colors duration-300 group-hover:bg-black/60",
						variant === "featured" && "px-2.5 py-1 text-[11px]",
					)}
				>
					{item.kind === "latest"
						? t("detail.aiCard.dashboard.latestVersion")
						: t("detail.aiCard.dashboard.historyVersion")}
				</div>
				<div className="rounded-full border border-white/20 bg-white/15 px-2 py-0.5 text-[10px] font-medium text-white/90 shadow-sm backdrop-blur-md">
					#{String(index + 1).padStart(2, "0")}
				</div>
			</div>

			<div
				className={cn(
					"absolute inset-x-0 bottom-0 z-20 flex translate-y-1.5 flex-col gap-2 transition-transform duration-500 ease-out group-hover:translate-y-0",
					variant === "featured" ? "p-5 sm:p-6" : "p-4",
				)}
			>
				<div className="flex items-start justify-between gap-2">
					<div className="min-w-0">
						<h3
							className={cn(
								"truncate font-semibold tracking-tight text-white drop-shadow-sm",
								variant === "featured" ? "text-lg sm:text-xl" : "text-sm",
							)}
						>
							{item.title}
						</h3>
						{item.description && (
							<p
								className={cn(
									"mt-1 line-clamp-2 leading-relaxed text-white/90 drop-shadow-sm",
									variant === "featured" ? "text-sm" : "text-xs",
								)}
							>
								{item.description}
							</p>
						)}
					</div>
				</div>
				<div className="mt-0.5 flex items-center justify-between gap-2 text-[10px] text-white/80">
					<span className="flex items-center gap-1 font-medium drop-shadow-sm">
						<Clock3 size={variant === "featured" ? 13 : 11} />
						{formatDateTime(item.createdAt)}
					</span>
					{item.kind === "latest" ? (
						<span className="flex-shrink-0 rounded-full bg-primary px-2 py-0.5 font-medium text-primary-foreground shadow-sm">
							{t("detail.aiCard.dashboard.current")}
						</span>
					) : (
						<span className="flex-shrink-0 rounded-full border border-white/30 bg-white/20 px-2 py-0.5 font-medium text-white shadow-sm backdrop-blur-md">
							{t("detail.aiCard.dashboard.archived")}
						</span>
					)}
				</div>
			</div>
		</motion.button>
	)
})

function formatDateTime(value?: string) {
	if (!value) return "—"

	const date = new Date(value)
	if (Number.isNaN(date.getTime())) return "—"

	return date.toLocaleString(undefined, {
		month: "short",
		day: "numeric",
		hour: "2-digit",
		minute: "2-digit",
	})
}

function formatShortDate(value?: string) {
	if (!value) return "—"

	const date = new Date(value)
	if (Number.isNaN(date.getTime())) return "—"

	return date.toLocaleDateString(undefined, {
		month: "numeric",
		day: "numeric",
	})
}

function formatScheduleSummary(
	timeConfig: AICardProjectConfig["time_config"],
	t: DashboardTranslate,
) {
	if (!timeConfig?.time) return ""

	const time = normalizeScheduleTime(timeConfig.time)
	const day = typeof timeConfig.day === "string" ? timeConfig.day : ""

	switch (timeConfig.type) {
		case "daily_repeat":
			return t("detail.aiCard.dashboard.scheduleDaily", { time })
		case "weekly_repeat":
			return t("detail.aiCard.dashboard.scheduleWeekly", {
				day: formatWeekdayLabel(day, t),
				time,
			})
		case "monthly_repeat":
			return t("detail.aiCard.dashboard.scheduleMonthly", {
				day: day || "1",
				time,
			})
		case "no_repeat":
			return day
				? t("detail.aiCard.dashboard.scheduleOnce", { date: day, time })
				: t("detail.aiCard.dashboard.scheduleOnceTime", { time })
		default:
			return t("detail.aiCard.dashboard.scheduleCustom", { time })
	}
}

function formatModelSummary(
	projectConfig: AICardProjectConfig | null | undefined,
	t: DashboardTranslate,
) {
	const modelName =
		getConfiguredModelName(projectConfig?.model) ||
		getConfiguredModelName(projectConfig?.image_model) ||
		getConfiguredModelName(projectConfig?.video_model)

	if (!modelName) return ""

	return t("detail.aiCard.dashboard.modelSummary", { model: modelName })
}

function getConfiguredModelName(model?: { model_id: string; model_name?: string }) {
	return model?.model_name || model?.model_id || ""
}

function normalizeScheduleTime(time: string) {
	const match = time.match(/^(\d{1,2}):(\d{1,2})/)
	if (!match) return time

	const hour = match[1].padStart(2, "0")
	const minute = match[2].padStart(2, "0")
	return `${hour}:${minute}`
}

function formatWeekdayLabel(day: string, t: DashboardTranslate) {
	const weekdayKeyByValue: Record<string, string> = {
		"1": "monday",
		"2": "tuesday",
		"3": "wednesday",
		"4": "thursday",
		"5": "friday",
		"6": "saturday",
		"7": "sunday",
	}
	const key = weekdayKeyByValue[day]

	return key ? t(`detail.aiCard.dashboard.weekdays.${key}`) : day || "—"
}

export default memo(AICardDashboard)
