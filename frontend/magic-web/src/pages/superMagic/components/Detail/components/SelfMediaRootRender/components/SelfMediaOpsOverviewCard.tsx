import {
	BarChart3,
	CheckCircle2,
	Link2,
	MessageCircle,
	PenLine,
	RefreshCw,
	Sparkles,
	TrendingUp,
} from "lucide-react"
import { useEffect, useState } from "react"
import type { CSSProperties, MouseEvent } from "react"
import { cn } from "@/lib/utils"
import type {
	SelfMediaOpsOverview,
	SelfMediaOpsOverviewAction,
	SelfMediaOpsOverviewActionKey,
} from "../services/selfMediaOpsOverview"
import {
	formatSelfMediaCompactNumber,
	formatSelfMediaPercent,
} from "../services/selfMediaOpsOverview"
import {
	buildSelfMediaOpsHealth,
	buildSelfMediaOpsMetricDisplay,
	buildSelfMediaOpsMetricMotionStates,
	buildSelfMediaOpsMetricStatusLabels,
	buildSelfMediaOpsPrimarySignal,
	getSelfMediaOpsActionUnlockCopy,
} from "../services/selfMediaOpsOverviewPresentation"
import type {
	SelfMediaHomeDailyInsightPayload,
	SelfMediaHomeDailyInsightStatus,
} from "../services/selfMediaHomeInsight"
import { formatSelfMediaHomeInsightGreeting } from "../services/selfMediaHomeInsight"
import { useMeasuredContainerWidth } from "../hooks/useMeasuredContainerWidth"
import SelfMediaOpsCompletionProgress from "./SelfMediaOpsCompletionProgress"
import SelfMediaOpsDataSummary from "./SelfMediaOpsDataSummary"
import "./SelfMediaOpsOverviewCard.css"

interface SelfMediaOpsOverviewCardProps {
	overview: SelfMediaOpsOverview
	onAction?: (action: SelfMediaOpsOverviewAction) => void
	dailyInsight?: SelfMediaHomeDailyInsightPayload | null
	dailyInsightStatus?: SelfMediaHomeDailyInsightStatus
	onRegenerateDailyInsight?: () => void
	className?: string
}

const actionIconMap = {
	"bind-source": Link2,
	"sync-metrics": RefreshCw,
	"collect-comments": MessageCircle,
	"generate-review": CheckCircle2,
	"improve-weak-post": Sparkles,
	"repurpose-best-post": TrendingUp,
	"plan-next-post": PenLine,
} satisfies Record<SelfMediaOpsOverviewActionKey, typeof Link2>

function getOverviewActionIcon(key: SelfMediaOpsOverviewActionKey | string) {
	return actionIconMap[key as SelfMediaOpsOverviewActionKey] ?? Sparkles
}

const NUMBER_ANIMATION_MS = 720

interface OpsOverviewCardStyle extends CSSProperties {
	"--ops-card-pointer-x": string
	"--ops-card-pointer-y": string
	"--ops-card-tilt-x": string
	"--ops-card-tilt-y": string
	"--ops-card-lift": string
}

const defaultOpsOverviewCardStyle: OpsOverviewCardStyle = {
	"--ops-card-pointer-x": "50%",
	"--ops-card-pointer-y": "50%",
	"--ops-card-tilt-x": "0deg",
	"--ops-card-tilt-y": "0deg",
	"--ops-card-lift": "0px",
	background:
		"radial-gradient(circle at var(--ops-card-pointer-x) var(--ops-card-pointer-y), rgba(255, 214, 55, 0.28), rgba(255, 214, 55, 0) 30%), linear-gradient(135deg, #f1f0eb 0%, #e4e4e7 43%, #dfe8e2 100%)",
	transform:
		"perspective(1200px) rotateX(var(--ops-card-tilt-x)) rotateY(var(--ops-card-tilt-y)) translateY(var(--ops-card-lift))",
}

type OpsOverviewLayout = "compact" | "comfortable" | "spacious" | "wide"

function getOpsOverviewLayout(width: number): OpsOverviewLayout {
	if (width >= 900) return "wide"
	if (width >= 760) return "spacious"
	if (width >= 640) return "comfortable"
	return "compact"
}

function handleOpsOverviewPointerMove(event: MouseEvent<HTMLElement>) {
	const element = event.currentTarget
	const rect = element.getBoundingClientRect()
	if (rect.width <= 0 || rect.height <= 0) return
	const x = clamp((event.clientX - rect.left) / rect.width, 0, 1)
	const y = clamp((event.clientY - rect.top) / rect.height, 0, 1)

	element.style.setProperty("--ops-card-pointer-x", `${Math.round(x * 100)}%`)
	element.style.setProperty("--ops-card-pointer-y", `${Math.round(y * 100)}%`)
	element.style.setProperty("--ops-card-tilt-x", `${trimStyleNumber((0.5 - y) * 4)}deg`)
	element.style.setProperty("--ops-card-tilt-y", `${trimStyleNumber((x - 0.5) * 6)}deg`)
}

function handleOpsOverviewPointerLeave(event: MouseEvent<HTMLElement>) {
	const element = event.currentTarget
	element.style.setProperty("--ops-card-pointer-x", "50%")
	element.style.setProperty("--ops-card-pointer-y", "50%")
	element.style.setProperty("--ops-card-tilt-x", "0deg")
	element.style.setProperty("--ops-card-tilt-y", "0deg")
}

function SelfMediaOpsOverviewCard({
	overview,
	onAction,
	dailyInsight,
	dailyInsightStatus = "idle",
	onRegenerateDailyInsight,
	className,
}: SelfMediaOpsOverviewCardProps) {
	const { containerRef: opsContainerRef, width: opsContainerWidth } =
		useMeasuredContainerWidth<HTMLElement>()
	const animatedReads = useAnimatedOverviewValue(overview.totalReads, NUMBER_ANIMATION_MS)
	const animatedEngagement = useAnimatedOverviewValue(
		overview.totalEngagement,
		NUMBER_ANIMATION_MS,
	)
	const animatedEngagementRate = useAnimatedOverviewValue(
		overview.engagementRate ?? 0,
		NUMBER_ANIMATION_MS,
	)
	const reads = formatSelfMediaCompactNumber(animatedReads)
	const engagement = formatSelfMediaCompactNumber(animatedEngagement)
	const engagementRate = formatSelfMediaPercent(animatedEngagementRate)
	const primarySignal = buildSelfMediaOpsPrimarySignal(overview)
	const health = buildSelfMediaOpsHealth(overview)
	const metricStatusLabels = buildSelfMediaOpsMetricStatusLabels(overview)
	const metricMotionStates = buildSelfMediaOpsMetricMotionStates(overview)
	const metricDisplay = buildSelfMediaOpsMetricDisplay(overview, {
		reads,
		engagement,
		rate: engagementRate,
	})
	const hasPublishedSource = overview.completion.source.done > 0
	const insightActions = dailyInsight?.actions?.length
		? dailyInsight.actions.map(
				(action, index): SelfMediaOpsOverviewAction => ({
					key: action.kind,
					postKey: action.postKey,
					title: action.title,
					description: action.description,
					cta: action.cta,
					priority: 80 + index,
				}),
			)
		: []
	const displayActions =
		dailyInsight && overview.operationStage === "closed" && insightActions.length > 0
			? insightActions
			: overview.nextActions
	const hasNextActions = displayActions.length > 0
	const isInsightLoading = dailyInsightStatus === "loading"
	const asideTitle = overview.operationStage === "closed" ? "今日建议" : "继续处理"
	const asideSubtitle =
		overview.operationStage === "closed"
			? dailyInsight?.summary || "根据当前运营状态给出下一步机会"
			: "按优先级处理这些事项"
	const insightGreeting = dailyInsight?.greeting
		? formatSelfMediaHomeInsightGreeting(dailyInsight.greeting, "")
		: ""
	const opsLayout = getOpsOverviewLayout(opsContainerWidth)
	const isOpsComfortable = opsLayout !== "compact"
	const opsContentClass =
		opsLayout === "wide"
			? "grid-cols-[minmax(0,1.16fr)_minmax(280px,0.84fr)] p-8"
			: isOpsComfortable
				? "p-6"
				: "p-4"
	const opsHeaderClass = isOpsComfortable ? "flex-row items-start justify-between" : "flex-col"
	const opsHealthClass = isOpsComfortable ? "w-[92px]" : "w-full"
	const opsAsideClass =
		opsLayout === "wide"
			? "rounded-[24px] p-5"
			: isOpsComfortable
				? "rounded-[24px] p-4"
				: "rounded-[22px] p-4"
	const regenerateInsightButton = onRegenerateDailyInsight ? (
		<button
			type="button"
			className="bg-white/82 inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-[12px] font-[780] text-[#18181b] shadow-[inset_0_1px_rgba(255,255,255,0.85),0_12px_28px_rgba(47,43,36,0.08)] transition-[background,transform,box-shadow] hover:-translate-y-0.5 hover:bg-white hover:shadow-[inset_0_1px_rgba(255,255,255,0.92),0_16px_34px_rgba(47,43,36,0.12)] focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-[#18181b]/15 disabled:cursor-not-allowed disabled:opacity-55 disabled:hover:translate-y-0"
			onClick={onRegenerateDailyInsight}
			disabled={isInsightLoading}
			aria-label="更新今日建议"
			data-testid="self-media-home-daily-insight-refresh"
		>
			<RefreshCw size={13} className={cn(isInsightLoading && "animate-spin")} />
			<span>{isInsightLoading ? "更新中" : "更新建议"}</span>
		</button>
	) : null

	return (
		<article
			ref={opsContainerRef}
			className={cn(
				"self-media-ops-breathing-surface group relative overflow-hidden rounded-[24px] border border-white/70 shadow-[inset_0_1px_rgba(255,255,255,0.8),0_24px_72px_rgba(47,43,36,0.12)] transition-[box-shadow,transform] duration-300 ease-out hover:shadow-[inset_0_1px_rgba(255,255,255,0.9),0_30px_80px_rgba(47,43,36,0.16)] hover:[--ops-card-lift:-3px]",
				"min-w-0 max-w-full",
				className,
			)}
			style={defaultOpsOverviewCardStyle}
			onMouseMove={handleOpsOverviewPointerMove}
			onMouseLeave={handleOpsOverviewPointerLeave}
			data-testid="self-media-home-ops-overview"
			data-ops-layout={opsLayout}
		>
			<div
				className="self-media-ops-breathing-glow pointer-events-none absolute inset-0 opacity-60"
				data-testid="self-media-home-ops-overview-breath"
			/>
			<div
				className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100"
				style={{
					background:
						"radial-gradient(circle at var(--ops-card-pointer-x) var(--ops-card-pointer-y), rgba(255,255,255,0.55), transparent 22%)",
				}}
			/>
			<div className="pointer-events-none absolute inset-x-5 top-0 h-px bg-gradient-to-r from-transparent via-white/95 to-transparent" />
			<div className="pointer-events-none absolute inset-0 bg-[linear-gradient(115deg,rgba(255,255,255,0.44),rgba(255,255,255,0)_34%,rgba(24,24,27,0.035)_100%)]" />
			<div className={cn("relative grid gap-8", opsContentClass)}>
				<div className="min-w-0 space-y-6">
					<div className={cn("flex gap-4", opsHeaderClass)}>
						<div>
							<div className="mb-3 inline-flex items-center gap-2 rounded-full border border-white/75 bg-white/55 px-3 py-1 text-[11px] font-[780] text-[#52525b] shadow-[inset_0_1px_rgba(255,255,255,0.75)] backdrop-blur">
								<span className="h-1.5 w-1.5 rounded-full bg-[#59b981] shadow-[0_0_0_4px_rgba(89,185,129,0.14)]" />
								今日重点信号
							</div>
							<h3
								className="m-0 max-w-[30rem] text-[20px] font-[820] leading-[1.18] text-[#18181b]"
								data-testid="self-media-home-ops-headline"
							>
								{primarySignal.title}
							</h3>
							<p
								className="mt-3 max-w-[29rem] text-[13px] leading-[1.75] text-[#52525b]"
								data-testid="self-media-home-ops-summary"
							>
								{primarySignal.description}
							</p>
						</div>
						<div
							className={cn(
								"flex min-h-16 shrink-0 flex-col justify-center rounded-[20px] bg-[#18181b] px-4 text-[#ffd637] shadow-[0_16px_34px_rgba(24,24,27,0.22),inset_0_1px_rgba(255,255,255,0.18)]",
								opsHealthClass,
								health.score < 100 && "self-media-ops-health-pulse",
							)}
							data-testid="self-media-home-ops-health"
						>
							<div className="text-white/62 flex items-center gap-1.5 text-[11px] font-[760]">
								<BarChart3 size={13} />
								健康度
							</div>
							<div className="mt-1 text-[24px] font-[840] leading-none text-[#ffd637]">
								{health.score}
							</div>
						</div>
					</div>

					{hasPublishedSource ? (
						<SelfMediaOpsDataSummary
							overview={overview}
							values={{
								reads: metricDisplay.reads.value,
								engagement: metricDisplay.engagement.value,
								rate: metricDisplay.rate.value,
							}}
							statusLabels={metricStatusLabels}
							motionStates={metricMotionStates}
							comfortable={isOpsComfortable}
						/>
					) : null}

					<SelfMediaOpsCompletionProgress completion={overview.completion} />
				</div>

				<div className="min-w-0 space-y-3">
					{regenerateInsightButton ? (
						<div className="flex justify-end">{regenerateInsightButton}</div>
					) : null}
					<aside
						className={cn(
							"min-w-0 border border-white/70 bg-white/50 shadow-[inset_0_1px_rgba(255,255,255,0.82),0_18px_46px_rgba(47,43,36,0.08)] backdrop-blur-xl",
							opsAsideClass,
						)}
						data-testid="self-media-home-ops-aside"
					>
						<div className="flex items-center justify-between gap-3">
							<div className="min-w-0 flex-1">
								<h4 className="text-[15px] font-[800] text-[#18181b]">
									{asideTitle}
								</h4>
								<p className="mt-1 text-[12px] leading-[1.55] text-[#71717a]">
									{asideSubtitle}
								</p>
							</div>
							<span className="rounded-full bg-white/80 px-3 py-1 text-[12px] font-[700] text-[#18181b]">
								{overview.totalPosts} 篇
							</span>
						</div>
						{insightGreeting ? (
							<div
								className="mt-4 rounded-[18px] border border-white/65 bg-white/55 p-3 text-[13px] font-[760] leading-[1.55] text-[#18181b] shadow-[inset_0_1px_rgba(255,255,255,0.76)]"
								data-testid="self-media-home-ops-insight-greeting"
							>
								{insightGreeting}
							</div>
						) : null}
						<div
							className="mt-5 space-y-3"
							data-testid="self-media-home-ops-next-actions"
						>
							{hasNextActions ? (
								displayActions.map((action) => {
									const Icon = getOverviewActionIcon(action.key)
									return (
										<button
											key={`${action.key}-${action.postKey || action.title}`}
											type="button"
											className="group/action w-full rounded-[20px] border border-white/70 bg-white/70 p-4 text-left shadow-[inset_0_1px_rgba(255,255,255,0.82),0_10px_28px_rgba(47,43,36,0.055)] transition-[border-color,box-shadow,transform,background] duration-200 hover:-translate-y-0.5 hover:border-[#ffd637]/70 hover:bg-white/90 hover:shadow-[inset_0_1px_rgba(255,255,255,0.9),0_16px_38px_rgba(47,43,36,0.1)] focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-[#18181b]/15"
											onClick={() => onAction?.(action)}
											data-testid={`self-media-home-ops-action-${action.key}`}
										>
											<div className="flex items-start gap-3">
												<span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[15px] bg-[#18181b] text-[#ffd637] shadow-[0_10px_22px_rgba(24,24,27,0.18)] transition-transform group-hover/action:scale-105">
													<Icon size={16} />
												</span>
												<span className="min-w-0 flex-1">
													<span className="flex flex-col gap-2 min-[420px]:flex-row min-[420px]:items-center min-[420px]:justify-between min-[420px]:gap-3">
														<span className="truncate text-[13px] font-[800] text-[#18181b]">
															{action.title}
														</span>
														<span className="w-fit shrink-0 rounded-full bg-[#ffd637]/55 px-2.5 py-1 text-[11px] font-[780] text-[#18181b] opacity-90 transition-colors group-hover/action:bg-[#ffd637]">
															{action.cta}
														</span>
													</span>
													<span className="mt-1.5 block text-[12px] leading-[1.5] text-[#71717a]">
														{action.description}
													</span>
													<span className="mt-2 inline-flex rounded-full bg-[#18181b]/[0.055] px-2.5 py-1 text-[11px] font-[760] text-[#52525b]">
														{getSelfMediaOpsActionUnlockCopy(
															action.key,
														)}
													</span>
												</span>
											</div>
										</button>
									)
								})
							) : (
								<div className="bg-white/78 rounded-[18px] p-4 text-[13px] leading-[1.6] text-[#52525b]">
									今天的发布、数据、评论和复盘都已经齐了，可以继续新建文章或做二次分发。
								</div>
							)}
						</div>
					</aside>
				</div>
			</div>
		</article>
	)
}

export default SelfMediaOpsOverviewCard

function useAnimatedOverviewValue(target: number, duration: number) {
	const [value, setValue] = useState(() => (prefersReducedOverviewMotion() ? target : 0))

	useEffect(() => {
		if (prefersReducedOverviewMotion() || target === 0) {
			setValue(target)
			return undefined
		}

		setValue(0)
		const startedAt = Date.now()
		const timer = window.setInterval(() => {
			const elapsed = Date.now() - startedAt
			const progress = clamp(elapsed / duration, 0, 1)
			const eased = 1 - Math.pow(1 - progress, 3)
			setValue(target * eased)
			if (progress >= 1) window.clearInterval(timer)
		}, 16)

		return () => window.clearInterval(timer)
	}, [duration, target])

	return value
}

function clamp(value: number, min: number, max: number) {
	return Math.min(max, Math.max(min, value))
}

function prefersReducedOverviewMotion() {
	return (
		typeof window !== "undefined" &&
		typeof window.matchMedia === "function" &&
		window.matchMedia("(prefers-reduced-motion: reduce)").matches
	)
}

function trimStyleNumber(value: number) {
	const rounded = Math.round(value * 10) / 10
	return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1)
}
