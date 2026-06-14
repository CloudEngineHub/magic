import { Activity, Bookmark, Eye, Heart, MessageCircle, Send, TrendingUp } from "lucide-react"
import type { ReactNode } from "react"
import { cn } from "@/lib/utils"
import type { SelfMediaOpsOverview } from "../services/selfMediaOpsOverview"
import {
	formatSelfMediaCompactNumber,
	formatSelfMediaPercent,
} from "../services/selfMediaOpsOverview"
import type {
	SelfMediaOpsMetricKey,
	SelfMediaOpsMetricMotionState,
} from "../services/selfMediaOpsOverviewPresentation"

interface SelfMediaOpsDataSummaryProps {
	overview: SelfMediaOpsOverview
	values: Record<SelfMediaOpsMetricKey, string>
	statusLabels: Record<SelfMediaOpsMetricKey, string>
	motionStates: Record<SelfMediaOpsMetricKey, SelfMediaOpsMetricMotionState>
	loading?: boolean
	comfortable?: boolean
	className?: string
}

const secondaryMetrics = [
	{
		key: "likes",
		label: "点赞",
		icon: Heart,
		getValue: (overview: SelfMediaOpsOverview) =>
			formatSelfMediaCompactNumber(getEngagementTotals(overview).likes),
	},
	{
		key: "comments",
		label: "评论",
		icon: MessageCircle,
		getValue: (overview: SelfMediaOpsOverview) =>
			formatSelfMediaCompactNumber(getEngagementTotals(overview).comments),
	},
	{
		key: "saves",
		label: "收藏",
		icon: Bookmark,
		getValue: (overview: SelfMediaOpsOverview) =>
			formatSelfMediaCompactNumber(getEngagementTotals(overview).saves),
	},
	{
		key: "shares",
		label: "分享",
		icon: Send,
		getValue: (overview: SelfMediaOpsOverview) =>
			formatSelfMediaCompactNumber(getEngagementTotals(overview).shares),
	},
] as const

const primaryMetricToneClassName = {
	reads: "border-[#d3dde1]/70 bg-[linear-gradient(180deg,rgba(255,255,255,0.93)_0%,rgba(247,250,251,0.86)_100%)]",
	engagement:
		"border-[#d2e0da]/70 bg-[linear-gradient(180deg,rgba(255,255,255,0.93)_0%,rgba(247,250,248,0.86)_100%)]",
	rate: "border-[#ead899]/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.9)_0%,rgba(255,249,229,0.82)_100%)]",
} satisfies Record<SelfMediaOpsMetricKey, string>

const primaryMetricAccentClassName = {
	reads: "text-[#657981]",
	engagement: "text-[#587266]",
	rate: "text-[#9b7b20]",
} satisfies Record<SelfMediaOpsMetricKey, string>

function SelfMediaOpsDataSummary({
	overview,
	values,
	statusLabels,
	motionStates,
	loading = false,
	comfortable = false,
	className,
}: SelfMediaOpsDataSummaryProps) {
	const synced = overview.completion.metrics.done
	const total = overview.completion.metrics.total
	const averageReads = loading
		? "同步中"
		: synced > 0
			? formatSelfMediaCompactNumber(overview.totalReads / synced)
			: "--"
	const displayValues: Record<SelfMediaOpsMetricKey, string> = loading
		? {
				reads: "同步中",
				engagement: "同步中",
				rate: "同步中",
			}
		: values
	const displayStatusLabels: Record<SelfMediaOpsMetricKey, string> = loading
		? {
				reads: "读取数据",
				engagement: "读取数据",
				rate: "读取数据",
			}
		: statusLabels

	return (
		<section
			className={cn(
				"rounded-[22px] border border-[#d4dcdd]/70 bg-[linear-gradient(135deg,rgba(250,251,250,0.94)_0%,rgba(246,248,246,0.84)_52%,rgba(255,249,226,0.48)_100%)] p-4 shadow-[inset_0_1px_rgba(255,255,255,0.82),0_18px_46px_rgba(38,65,72,0.09)] backdrop-blur",
				className,
			)}
			data-testid="self-media-home-ops-data-summary"
		>
			<div className="mb-4 flex flex-wrap items-center justify-between gap-3">
				<div>
					<h4 className="text-[13px] font-[820] text-[#18181b]">发布后数据汇总</h4>
					<p className="mt-1 text-[11px] font-[620] text-[#71717a]">
						{total > 0 ? `已同步 ${synced}/${total}` : "等待发布后同步"}
					</p>
				</div>
				<div className="bg-white/64 rounded-full border border-white/70 px-3 py-1 text-[11px] font-[760] text-[#4f6670] shadow-[inset_0_1px_rgba(255,255,255,0.82)]">
					篇均阅读 {averageReads}
				</div>
			</div>
			<div className={cn("grid gap-3", comfortable ? "grid-cols-3" : "grid-cols-1")}>
				<PrimaryMetricTile
					icon={<Eye size={17} />}
					label="总阅读"
					value={displayValues.reads}
					statusLabel={displayStatusLabels.reads}
					motionState={motionStates.reads}
					loading={loading}
					testId="self-media-home-ops-total-reads"
					comfortable={comfortable}
					tone="reads"
				/>
				<PrimaryMetricTile
					icon={<TrendingUp size={17} />}
					label="总互动"
					value={displayValues.engagement}
					statusLabel={displayStatusLabels.engagement}
					motionState={motionStates.engagement}
					loading={loading}
					testId="self-media-home-ops-total-engagement"
					comfortable={comfortable}
					tone="engagement"
				/>
				<PrimaryMetricTile
					icon={<Activity size={17} />}
					label="平均互动率"
					value={displayValues.rate}
					statusLabel={displayStatusLabels.rate}
					motionState={motionStates.rate}
					loading={loading}
					testId="self-media-home-ops-engagement-rate"
					comfortable={comfortable}
					tone="rate"
				/>
			</div>
			<div className="mt-3 grid grid-cols-2 gap-2 min-[560px]:grid-cols-4">
				{secondaryMetrics.map((item) => {
					const Icon = item.icon
					return (
						<div
							key={item.key}
							className="bg-white/68 min-w-0 rounded-[16px] border border-[#d7e5e4]/75 px-3 py-2.5 text-[#5f6f73] shadow-[inset_0_1px_rgba(255,255,255,0.76)]"
							data-testid={`self-media-home-ops-${item.key}`}
							data-loading={loading ? "true" : "false"}
						>
							<div className="flex items-center gap-1.5 text-[11px] font-[720]">
								<Icon size={13} />
								<span>{item.label}</span>
							</div>
							<div className="mt-1 truncate text-[16px] font-[820] leading-none text-[#18181b]">
								{loading ? "—" : item.getValue(overview)}
							</div>
						</div>
					)
				})}
			</div>
			{overview.bestPost ? (
				<div
					className="mt-3 flex min-w-0 items-center gap-2 rounded-[16px] border border-[#d7e5e4]/70 bg-[linear-gradient(90deg,rgba(247,250,248,0.92)_0%,rgba(250,250,246,0.88)_100%)] px-3 py-2.5 text-[12px] font-[650] text-[#4f6670] shadow-[inset_0_1px_rgba(255,255,255,0.74)]"
					data-testid="self-media-home-ops-best-post"
				>
					<TrendingUp size={14} className="shrink-0 text-[#587266]" />
					<span className="min-w-0 truncate">
						最佳样本：{overview.bestPost.title}，互动率{" "}
						{formatSelfMediaPercent(overview.bestPost.engagementRate)}
					</span>
				</div>
			) : null}
		</section>
	)
}

function getEngagementTotals(overview: SelfMediaOpsOverview) {
	const maybePartialOverview = overview as Partial<SelfMediaOpsOverview>
	return (
		maybePartialOverview.engagementTotals ?? {
			likes: 0,
			comments: 0,
			saves: 0,
			shares: 0,
		}
	)
}

function PrimaryMetricTile({
	icon,
	label,
	value,
	statusLabel,
	motionState,
	loading,
	testId,
	comfortable,
	tone,
}: {
	icon: ReactNode
	label: string
	value: string
	statusLabel: string
	motionState: SelfMediaOpsMetricMotionState
	loading: boolean
	testId: string
	comfortable: boolean
	tone: SelfMediaOpsMetricKey
}) {
	return (
		<div
			className={cn(
				"min-w-0 rounded-[18px] border p-3.5 shadow-[inset_0_1px_rgba(255,255,255,0.86),0_10px_24px_rgba(38,65,72,0.07)]",
				primaryMetricToneClassName[tone],
				motionState === "active" && "self-media-ops-metric-flow",
			)}
			data-motion={motionState}
			data-loading={loading ? "true" : "false"}
			data-testid={testId}
		>
			<div
				className={cn(
					"flex items-center gap-2 text-[12px] font-[740]",
					primaryMetricAccentClassName[tone],
				)}
			>
				{icon}
				<span>{label}</span>
			</div>
			<div
				className={cn(
					"mt-2 truncate text-[28px] font-[840] leading-none text-[#18181b]",
					comfortable && "text-[30px]",
				)}
			>
				{value}
			</div>
			<div className="mt-2 text-[11px] font-[680] text-[#71717a]">{statusLabel}</div>
		</div>
	)
}

export default SelfMediaOpsDataSummary
