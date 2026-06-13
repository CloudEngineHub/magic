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
	comfortable?: boolean
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

function SelfMediaOpsDataSummary({
	overview,
	values,
	statusLabels,
	motionStates,
	comfortable = false,
}: SelfMediaOpsDataSummaryProps) {
	const synced = overview.completion.metrics.done
	const total = overview.completion.metrics.total
	const averageReads =
		synced > 0 ? formatSelfMediaCompactNumber(overview.totalReads / synced) : "--"

	return (
		<section
			className="bg-white/52 rounded-[22px] border border-white/70 p-4 shadow-[inset_0_1px_rgba(255,255,255,0.78),0_14px_38px_rgba(47,43,36,0.06)] backdrop-blur"
			data-testid="self-media-home-ops-data-summary"
		>
			<div className="mb-4 flex flex-wrap items-center justify-between gap-3">
				<div>
					<h4 className="text-[13px] font-[820] text-[#18181b]">发布后数据汇总</h4>
					<p className="mt-1 text-[11px] font-[620] text-[#71717a]">
						{total > 0 ? `已同步 ${synced}/${total}` : "等待发布后同步"}
					</p>
				</div>
				<div className="rounded-full bg-[#18181b]/[0.06] px-3 py-1 text-[11px] font-[760] text-[#52525b]">
					篇均阅读 {averageReads}
				</div>
			</div>
			<div className={cn("grid gap-3", comfortable ? "grid-cols-3" : "grid-cols-1")}>
				<PrimaryMetricTile
					icon={<Eye size={17} />}
					label="总阅读"
					value={values.reads}
					statusLabel={statusLabels.reads}
					motionState={motionStates.reads}
					testId="self-media-home-ops-total-reads"
					comfortable={comfortable}
				/>
				<PrimaryMetricTile
					icon={<TrendingUp size={17} />}
					label="总互动"
					value={values.engagement}
					statusLabel={statusLabels.engagement}
					motionState={motionStates.engagement}
					testId="self-media-home-ops-total-engagement"
					comfortable={comfortable}
				/>
				<PrimaryMetricTile
					icon={<Activity size={17} />}
					label="平均互动率"
					value={values.rate}
					statusLabel={statusLabels.rate}
					motionState={motionStates.rate}
					testId="self-media-home-ops-engagement-rate"
					comfortable={comfortable}
				/>
			</div>
			<div className="mt-3 grid grid-cols-2 gap-2 min-[560px]:grid-cols-4">
				{secondaryMetrics.map((item) => {
					const Icon = item.icon
					return (
						<div
							key={item.key}
							className="border-white/62 bg-white/46 min-w-0 rounded-[16px] border px-3 py-2.5 text-[#52525b]"
							data-testid={`self-media-home-ops-${item.key}`}
						>
							<div className="flex items-center gap-1.5 text-[11px] font-[720]">
								<Icon size={13} />
								<span>{item.label}</span>
							</div>
							<div className="mt-1 truncate text-[16px] font-[820] leading-none text-[#18181b]">
								{item.getValue(overview)}
							</div>
						</div>
					)
				})}
			</div>
			{overview.bestPost ? (
				<div
					className="mt-3 flex min-w-0 items-center gap-2 rounded-[16px] bg-[#18181b]/[0.045] px-3 py-2.5 text-[12px] font-[650] text-[#52525b]"
					data-testid="self-media-home-ops-best-post"
				>
					<TrendingUp size={14} className="shrink-0 text-[#18181b]" />
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
	testId,
	comfortable,
}: {
	icon: ReactNode
	label: string
	value: string
	statusLabel: string
	motionState: SelfMediaOpsMetricMotionState
	testId: string
	comfortable: boolean
}) {
	return (
		<div
			className={cn(
				"bg-white/64 min-w-0 rounded-[18px] border border-white/70 p-3.5 shadow-[inset_0_1px_rgba(255,255,255,0.8),0_10px_24px_rgba(47,43,36,0.055)]",
				motionState === "active" && "self-media-ops-metric-flow",
			)}
			data-motion={motionState}
			data-testid={testId}
		>
			<div className="flex items-center gap-2 text-[12px] font-[720] text-[#71717a]">
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
