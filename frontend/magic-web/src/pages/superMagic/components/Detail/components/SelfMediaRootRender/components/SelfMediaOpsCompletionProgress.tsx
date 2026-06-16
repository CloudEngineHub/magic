import { useEffect, useState } from "react"
import { cn } from "@/lib/utils"
import type { SelfMediaOpsOverview } from "../services/selfMediaOpsOverview"

const PROGRESS_ANIMATION_MS = 620

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

interface SelfMediaOpsCompletionProgressProps {
	completion: SelfMediaOpsOverview["completion"]
}

function SelfMediaOpsCompletionProgress({ completion }: SelfMediaOpsCompletionProgressProps) {
	const completed = completionItems.every((item) => {
		const value = completion[item.key]
		return value.done >= value.total
	})
	if (completed) return null

	return (
		<div
			className="rounded-[22px] border border-white/65 bg-white/45 p-4 shadow-[inset_0_1px_rgba(255,255,255,0.72),0_14px_38px_rgba(47,43,36,0.06)] backdrop-blur"
			data-testid="self-media-home-ops-completion"
		>
			<div className="mb-4 flex items-center justify-between gap-3">
				<span className="text-[13px] font-[800] text-[#18181b]">运营链路进度</span>
				<span className="text-[11px] font-[680] text-[#71717a]">
					发布 / 数据 / 评论 / 复盘
				</span>
			</div>
			<div className="space-y-3">
				{completionItems.map((item) => {
					const value = completion[item.key]
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
	const animatedProgress = useAnimatedProgressValue(progress)

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

function useAnimatedProgressValue(target: number) {
	const [value, setValue] = useState(() => (prefersReducedMotion() ? target : 0))

	useEffect(() => {
		if (prefersReducedMotion() || target === 0) {
			setValue(target)
			return undefined
		}

		setValue(0)
		const startedAt = Date.now()
		const timer = window.setInterval(() => {
			const elapsed = Date.now() - startedAt
			const progress = Math.min(1, Math.max(0, elapsed / PROGRESS_ANIMATION_MS))
			setValue(target * (1 - Math.pow(1 - progress, 3)))
			if (progress >= 1) window.clearInterval(timer)
		}, 16)

		return () => window.clearInterval(timer)
	}, [target])

	return value
}

function prefersReducedMotion() {
	return (
		typeof window !== "undefined" &&
		typeof window.matchMedia === "function" &&
		window.matchMedia("(prefers-reduced-motion: reduce)").matches
	)
}

export default SelfMediaOpsCompletionProgress
