import type { Ref } from "react"
import { Button } from "@/components/shadcn-ui/button"
import { Home, Loader2 } from "lucide-react"
import type {
	ArticleBatchProgressPhase,
	ArticleBatchTopicItem,
} from "../../../services/selfMediaBatchSend"
import type { StepConfirmTranslate } from "./StepConfirmBlocks"
import { GenerationCompleteSummary, TopicProgressList } from "./StepConfirmBlocks"

export type GenerationPhase = "idle" | "archiving" | ArticleBatchProgressPhase

export const GENERATION_PHASE_ORDER: GenerationPhase[] = [
	"archiving",
	"creating-topic",
	"uploading-materials",
	"sending-message",
]

interface StepConfirmProgressScreenProps {
	sent: boolean
	sending: boolean
	batchTopics: ArticleBatchTopicItem[]
	activeTopicId: string | null
	totalCount: number
	createdTopicCount: number
	generationPhase: GenerationPhase
	summaryRef?: Ref<HTMLDivElement>
	onSwitchTopic: (item: ArticleBatchTopicItem) => void
	onBackHome?: () => void
	t: StepConfirmTranslate
}

function StepConfirmStatusEmblem({ sending }: { sending: boolean }) {
	return (
		<div
			className="relative mx-auto flex h-24 w-24 items-center justify-center rounded-[30px] bg-white text-[#18181b] shadow-[inset_0_1px_rgba(255,255,255,0.85),0_18px_44px_rgba(47,43,36,0.08)]"
			data-testid="self-media-step-confirm-status-emblem"
		>
			{sending ? (
				<>
					<div className="absolute inset-3 animate-pulse rounded-[24px] bg-[#18181b]/5" />
					<div className="relative flex h-14 w-14 items-center justify-center rounded-[22px] bg-[#18181b] text-[#ffd637] shadow-[0_14px_28px_rgba(24,24,27,0.18)]">
						<Loader2 size={24} className="animate-spin" />
					</div>
				</>
			) : (
				<div
					className="relative h-[58px] w-[58px] overflow-hidden rounded-[22px] bg-[#18181b] shadow-[0_16px_30px_rgba(24,24,27,0.2)]"
					data-testid="self-media-step-confirm-complete-mark"
					aria-hidden="true"
				>
					<span className="absolute left-4 top-4 h-2 w-7 rounded-full bg-white/95" />
					<span className="bg-white/58 absolute left-4 top-[27px] h-2 w-5 rounded-full" />
					<span className="bg-white/26 absolute bottom-4 left-4 h-2 w-8 rounded-full" />
					<span className="absolute right-3 top-3 flex h-[18px] w-[18px] items-center justify-center rounded-full bg-[#ffd637] shadow-[0_6px_12px_rgba(255,214,55,0.3)]">
						<span className="mt-[-1px] h-[8px] w-[4px] rotate-45 border-b-2 border-r-2 border-[#18181b]" />
					</span>
				</div>
			)}
		</div>
	)
}

export default function StepConfirmProgressScreen({
	sent,
	sending,
	batchTopics,
	activeTopicId,
	totalCount,
	createdTopicCount,
	generationPhase,
	summaryRef,
	onSwitchTopic,
	onBackHome,
	t,
}: StepConfirmProgressScreenProps) {
	const isStartupLoading = sending && batchTopics.length === 0
	const currentPhaseIndex = Math.max(0, GENERATION_PHASE_ORDER.indexOf(generationPhase))
	const currentPhaseNumber = currentPhaseIndex + 1
	const currentPhaseLabel = t(
		`detail.selfMedia.initPanel.stepConfirm.phaseLabels.${generationPhase}`,
		{
			defaultValue: t("detail.selfMedia.initPanel.stepConfirm.phaseLabels.idle", {
				defaultValue: "准备任务",
			}),
		},
	)
	const currentPhaseStatus = t("detail.selfMedia.initPanel.stepConfirm.phaseStatus", {
		phase: currentPhaseLabel,
		defaultValue: "当前阶段：{{phase}}",
	})
	const startupProgressPercent = `${
		((currentPhaseNumber || 1) / GENERATION_PHASE_ORDER.length) * 100
	}%`
	const titleKey = sent
		? "detail.selfMedia.initPanel.stepConfirm.doneTitle"
		: isStartupLoading
			? "detail.selfMedia.initPanel.stepConfirm.preparingTitle"
			: "detail.selfMedia.initPanel.stepConfirm.generatingTitle"
	const titleFallback = sent
		? "矩阵创作已成功启动"
		: isStartupLoading
			? "正在准备创作任务"
			: "正在启动创作流程"
	const desc = sent
		? t("detail.selfMedia.initPanel.stepConfirm.doneDesc", {
				count: createdTopicCount,
			})
		: isStartupLoading
			? t(`detail.selfMedia.initPanel.stepConfirm.phase.${generationPhase}`, {
					defaultValue: t("detail.selfMedia.initPanel.stepConfirm.preparingDesc"),
				})
			: t("detail.selfMedia.initPanel.stepConfirm.generatingDesc", {
					done: batchTopics.length,
					total: totalCount,
				})

	return (
		<div
			className="mx-auto flex min-h-full w-full max-w-5xl flex-col bg-[#f8f8f9] px-3 py-6 sm:px-4 sm:py-8"
			data-testid={
				isStartupLoading
					? "self-media-step-confirm-startup-loading"
					: "self-media-step-confirm-progress"
			}
		>
			<section className="mx-auto flex w-full max-w-3xl flex-col gap-6">
				<div className="space-y-5 text-center">
					<StepConfirmStatusEmblem sending={sending} />
					<div className="space-y-2">
						<h3 className="text-2xl font-[820] tracking-normal text-[#18181b]">
							{t(titleKey, { defaultValue: titleFallback })}
						</h3>
						<p className="mx-auto max-w-2xl text-sm font-semibold leading-relaxed text-[#71717a]">
							{desc}
						</p>
					</div>
				</div>

				<div className="h-px bg-zinc-950/10" />

				{isStartupLoading ? (
					<div className="space-y-4 rounded-[28px] bg-white p-5 text-left shadow-[inset_0_1px_rgba(255,255,255,0.85),0_16px_42px_rgba(47,43,36,0.07)]">
						<div className="flex items-center justify-between gap-3">
							<p aria-live="polite" className="text-sm font-semibold text-[#71717a]">
								{currentPhaseStatus}
							</p>
							<span className="shrink-0 rounded-full bg-[#18181b] px-3 py-1 text-xs font-[800] text-white">
								{currentPhaseNumber}/{GENERATION_PHASE_ORDER.length}
							</span>
						</div>
						<div className="h-2 overflow-hidden rounded-full bg-[#f4f4f5]">
							<div
								className="h-full rounded-full bg-[#18181b] transition-[width] duration-300"
								style={{ width: startupProgressPercent }}
							/>
						</div>
					</div>
				) : (
					<div className="space-y-4">
						{sent ? (
							<GenerationCompleteSummary
								count={createdTopicCount}
								summaryRef={summaryRef}
								t={t}
							/>
						) : null}
						<TopicProgressList
							topics={batchTopics}
							activeTopicId={activeTopicId}
							totalCount={totalCount}
							isGenerating={sending}
							onSelectTopic={onSwitchTopic}
							t={t}
						/>
					</div>
				)}
				{onBackHome ? (
					<Button
						type="button"
						variant="outline"
						className="h-14 rounded-[24px] border-0 bg-white text-base font-[800] text-[#18181b] shadow-[inset_0_1px_rgba(255,255,255,0.85),0_12px_30px_rgba(24,24,27,0.06)] transition-colors hover:bg-[#f4f4f5]"
						onClick={onBackHome}
						data-testid="self-media-step-confirm-progress-back-home-button"
					>
						<Home size={18} />
						<span>{t("detail.selfMedia.initPanel.stepConfirm.backHome")}</span>
					</Button>
				) : null}
			</section>
		</div>
	)
}
