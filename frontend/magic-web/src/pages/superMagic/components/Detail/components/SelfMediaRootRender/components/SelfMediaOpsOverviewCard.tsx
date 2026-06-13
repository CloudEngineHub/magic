import {
	BarChart3,
	CheckCircle2,
	ClipboardCheck,
	LineChart,
	Link2,
	MessageCircle,
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
	buildSelfMediaOpsMetricDrillDowns,
	buildSelfMediaOpsMetricMotionStates,
	buildSelfMediaOpsMetricStatusLabels,
	buildSelfMediaOpsPrimarySignal,
	getSelfMediaOpsActionUnlockCopy,
} from "../services/selfMediaOpsOverviewPresentation"
import type { SelfMediaOpsMetricKey } from "../services/selfMediaOpsOverviewPresentation"
import SelfMediaOpsMetricFlipCard from "./SelfMediaOpsMetricFlipCard"
import "./SelfMediaOpsOverviewCard.css"

interface SelfMediaOpsOverviewCardProps {
	overview: SelfMediaOpsOverview
	onAction?: (action: SelfMediaOpsOverviewAction) => void
	className?: string
}

const completionItems: Array<{
	key: keyof SelfMediaOpsOverview["completion"]
	label: string
	tone: string
}> = [
	{ key: "source", label: "已发布", tone: "bg-[#ff776c]" },
	{ key: "metrics", label: "已同步", tone: "bg-[#ffd637]" },
	{ key: "comments", label: "评论已处理", tone: "bg-[#59b981]" },
	{ key: "review", label: "复盘已完成", tone: "bg-[#18181b]" },
]

const actionIconMap = {
	"bind-source": Link2,
	"sync-metrics": RefreshCw,
	"collect-comments": MessageCircle,
	"generate-review": ClipboardCheck,
	"improve-weak-post": Sparkles,
} satisfies Record<SelfMediaOpsOverviewActionKey, typeof Link2>

const NUMBER_ANIMATION_MS = 720
const PROGRESS_ANIMATION_MS = 620

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
	className,
}: SelfMediaOpsOverviewCardProps) {
	const [flippedMetric, setFlippedMetric] = useState<SelfMediaOpsMetricKey | null>(null)
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
	const metricDrillDowns = buildSelfMediaOpsMetricDrillDowns(overview)
	const metricStatusLabels = buildSelfMediaOpsMetricStatusLabels(overview)
	const metricMotionStates = buildSelfMediaOpsMetricMotionStates(overview)
	const hasNextActions = overview.nextActions.length > 0

	return (
		<article
			className={cn(
				"self-media-ops-breathing-surface group relative overflow-hidden rounded-[28px] border border-white/70 p-6 shadow-[inset_0_1px_rgba(255,255,255,0.8),0_24px_72px_rgba(47,43,36,0.12)] transition-[box-shadow,transform] duration-300 ease-out hover:shadow-[inset_0_1px_rgba(255,255,255,0.9),0_30px_80px_rgba(47,43,36,0.16)] hover:[--ops-card-lift:-3px] sm:p-8",
				className,
			)}
			style={defaultOpsOverviewCardStyle}
			onMouseMove={handleOpsOverviewPointerMove}
			onMouseLeave={handleOpsOverviewPointerLeave}
			data-testid="self-media-home-ops-overview"
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
			<div className="relative grid gap-8 lg:grid-cols-[minmax(0,1.16fr)_minmax(300px,0.84fr)]">
				<div className="min-w-0 space-y-6">
					<div className="flex items-start justify-between gap-4">
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
								"flex min-h-16 w-[92px] shrink-0 flex-col justify-center rounded-[20px] bg-[#18181b] px-4 text-[#ffd637] shadow-[0_16px_34px_rgba(24,24,27,0.22),inset_0_1px_rgba(255,255,255,0.18)]",
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

					<div className="grid gap-3 sm:grid-cols-3">
						<SelfMediaOpsMetricFlipCard
							metricKey="reads"
							icon={<LineChart size={18} />}
							label="总阅读"
							value={reads}
							accent="text-[#18181b]"
							statusLabel={metricStatusLabels.reads}
							motionState={metricMotionStates.reads}
							testId="self-media-home-ops-total-reads"
							detail={metricDrillDowns.reads}
							flipped={flippedMetric === "reads"}
							onToggle={() =>
								setFlippedMetric((current) =>
									current === "reads" ? null : "reads",
								)
							}
						/>
						<SelfMediaOpsMetricFlipCard
							metricKey="engagement"
							icon={<TrendingUp size={18} />}
							label="总互动"
							value={engagement}
							accent="text-[#18181b]"
							statusLabel={metricStatusLabels.engagement}
							motionState={metricMotionStates.engagement}
							testId="self-media-home-ops-total-engagement"
							detail={metricDrillDowns.engagement}
							flipped={flippedMetric === "engagement"}
							onToggle={() =>
								setFlippedMetric((current) =>
									current === "engagement" ? null : "engagement",
								)
							}
						/>
						<SelfMediaOpsMetricFlipCard
							metricKey="rate"
							icon={<CheckCircle2 size={18} />}
							label="平均互动率"
							value={engagementRate}
							accent="text-[#18181b]"
							statusLabel={metricStatusLabels.rate}
							motionState={metricMotionStates.rate}
							testId="self-media-home-ops-engagement-rate"
							detail={metricDrillDowns.rate}
							flipped={flippedMetric === "rate"}
							onToggle={() =>
								setFlippedMetric((current) => (current === "rate" ? null : "rate"))
							}
						/>
					</div>

					<div
						className="rounded-[22px] border border-white/65 bg-white/45 p-4 shadow-[inset_0_1px_rgba(255,255,255,0.72),0_14px_38px_rgba(47,43,36,0.06)] backdrop-blur"
						data-testid="self-media-home-ops-completion"
					>
						<div className="mb-4 flex items-center justify-between gap-3">
							<span className="text-[13px] font-[800] text-[#18181b]">
								运营链路进度
							</span>
							<span className="text-[11px] font-[680] text-[#71717a]">
								发布 / 数据 / 评论 / 复盘
							</span>
						</div>
						<div className="space-y-3">
							{completionItems.map((item) => {
								const value = overview.completion[item.key]
								return (
									<CompletionProgressRow
										key={item.key}
										item={item}
										done={value.done}
										total={value.total}
									/>
								)
							})}
						</div>
					</div>

					{overview.bestPost ? (
						<div
							className="flex items-start gap-3 rounded-[20px] border border-[#18181b]/8 bg-[#18181b]/[0.045] p-4 text-[13px] text-[#52525b]"
							data-testid="self-media-home-ops-best-post"
						>
							<span className="bg-white/72 flex h-9 w-9 shrink-0 items-center justify-center rounded-[14px] text-[#18181b] shadow-[inset_0_1px_rgba(255,255,255,0.8)]">
								<TrendingUp className="h-4 w-4" />
							</span>
							<div className="min-w-0">
								<div className="font-[760] text-[#18181b]">表现最佳</div>
								<div className="mt-1 truncate">
									{overview.bestPost.title} · 互动率{" "}
									{formatSelfMediaPercent(overview.bestPost.engagementRate)}
								</div>
							</div>
						</div>
					) : null}
				</div>

				<aside className="min-w-0 rounded-[24px] border border-white/70 bg-white/50 p-4 shadow-[inset_0_1px_rgba(255,255,255,0.82),0_18px_46px_rgba(47,43,36,0.08)] backdrop-blur-xl lg:p-5">
					<div className="flex items-center justify-between gap-3">
						<div>
							<h4 className="text-[15px] font-[800] text-[#18181b]">继续处理</h4>
							<p className="mt-1 text-[12px] text-[#71717a]">按优先级处理这些事项</p>
						</div>
						<span className="rounded-full bg-white/80 px-3 py-1 text-[12px] font-[700] text-[#18181b]">
							{overview.totalPosts} 篇
						</span>
					</div>

					<div className="mt-5 space-y-3" data-testid="self-media-home-ops-next-actions">
						{hasNextActions ? (
							overview.nextActions.map((action) => {
								const Icon = actionIconMap[action.key]
								return (
									<button
										key={`${action.key}-${action.postKey}`}
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
												<span className="flex items-center justify-between gap-3">
													<span className="truncate text-[13px] font-[800] text-[#18181b]">
														{action.title}
													</span>
													<span className="shrink-0 rounded-full bg-[#ffd637]/55 px-2.5 py-1 text-[11px] font-[780] text-[#18181b] opacity-90 transition-colors group-hover/action:bg-[#ffd637]">
														{action.cta}
													</span>
												</span>
												<span className="mt-1.5 line-clamp-2 block text-[12px] leading-[1.5] text-[#71717a]">
													{action.description}
												</span>
												<span className="mt-2 inline-flex rounded-full bg-[#18181b]/[0.055] px-2.5 py-1 text-[11px] font-[760] text-[#52525b]">
													{getSelfMediaOpsActionUnlockCopy(action.key)}
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
		</article>
	)
}

function CompletionProgressRow({
	item,
	done,
	total,
}: {
	item: (typeof completionItems)[number]
	done: number
	total: number
}) {
	const progress = total > 0 ? Math.round((done / total) * 100) : 0
	const animatedProgress = useAnimatedOverviewValue(progress, PROGRESS_ANIMATION_MS)

	return (
		<div className="grid grid-cols-[5rem_minmax(0,1fr)_3.5rem] items-center gap-3 text-[12px] font-[600] text-[#52525b]">
			<span className="flex items-center gap-2">
				<i className={cn("h-2 w-5 rounded-full", item.tone)} />
				<span>{item.label}</span>
			</span>
			<div className="h-2 overflow-hidden rounded-full bg-white/70">
				<div
					className={cn("h-full rounded-full", item.tone)}
					style={{ width: `${Math.round(animatedProgress)}%` }}
					data-testid={`self-media-home-ops-progress-${item.key}`}
				/>
			</div>
			<span className="text-right text-[#18181b]">
				{done}/{total}
			</span>
		</div>
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
