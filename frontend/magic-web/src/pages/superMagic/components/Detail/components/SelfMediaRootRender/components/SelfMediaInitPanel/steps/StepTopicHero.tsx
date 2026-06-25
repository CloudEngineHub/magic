import { CheckCircle2, Plus, Sparkles } from "lucide-react"
import { useTranslation } from "react-i18next"
import { Button } from "@/components/shadcn-ui/button"

interface StepTopicHeroProps {
	articleCount: number
	onAdd?: () => void
}

export default function StepTopicHero({ articleCount, onAdd }: StepTopicHeroProps) {
	const { t } = useTranslation("super")
	const hasArticles = articleCount > 0

	return (
		<header className="flex flex-col gap-4 py-3 sm:flex-row sm:items-end sm:justify-between">
			<div className="space-y-2">
				<h2 className="m-0 inline-flex h-10 items-center gap-2 rounded-full bg-white/90 px-4 text-xl font-[780] text-[#18181b] shadow-[inset_0_1px_rgba(255,255,255,0.85)]">
					<Sparkles size={14} className="text-[#ff776c]" />
					<span>{t("detail.selfMedia.initPanel.stepTopic.kicker", "新建文章")}</span>
				</h2>
				<p className="max-w-xl text-sm leading-relaxed text-[#71717a]">
					{t(
						"detail.selfMedia.initPanel.stepTopic.subtitle",
						"先生成候选方向，再补标题、材料和大纲。",
					)}
				</p>
			</div>

			{hasArticles ? (
				<div
					aria-live="polite"
					className="flex h-[46px] items-center gap-2 rounded-full bg-[#18181b] px-4 text-white shadow-[0_16px_34px_rgba(24,24,27,0.16)]"
				>
					<CheckCircle2 size={15} />
					<span className="text-sm font-[780]">
						{t("detail.selfMedia.initPanel.stepTopic.activeStatus", "继续完善当前文章")}
					</span>
				</div>
			) : (
				<Button
					type="button"
					className="flex h-[46px] items-center gap-2 rounded-full bg-[#18181b] px-5 text-sm font-[800] text-white shadow-[0_16px_34px_rgba(24,24,27,0.18)] transition-transform hover:-translate-y-0.5"
					onClick={onAdd}
				>
					<Plus size={15} />
					<span>
						{t(
							"detail.selfMedia.initPanel.stepTopic.createFirstTopic",
							"添加第一个选题",
						)}
					</span>
				</Button>
			)}
		</header>
	)
}
