import { FileText, Plus } from "lucide-react"
import type { SelfMediaHomeTranslate } from "./SelfMediaHomeTypes"

interface SelfMediaHomeEmptyStateProps {
	onCreateArticle?: () => void
	t: SelfMediaHomeTranslate
}

function SelfMediaHomeEmptyState({ onCreateArticle, t }: SelfMediaHomeEmptyStateProps) {
	return (
		<section
			className="self-media-home-enter-item flex min-h-[22rem] flex-col items-center justify-center gap-4 rounded-[28px] bg-[#ffffff] px-6 py-10 text-center shadow-[inset_0_1px_rgba(255,255,255,0.75),0_20px_60px_rgba(47,43,36,0.08)]"
			style={{ animationDelay: "100ms" }}
			data-testid="self-media-home-empty"
		>
			<div className="flex h-14 w-14 items-center justify-center rounded-[16px] bg-[#f4f4f5] text-[#71717a]">
				<FileText size={24} />
			</div>
			<div className="space-y-1">
				<h3 className="text-lg font-semibold text-[#18181b]">
					{t("detail.selfMedia.home.emptyTitle")}
				</h3>
				<p className="text-sm text-[#71717a]">{t("detail.selfMedia.home.emptyDesc")}</p>
			</div>
			{onCreateArticle ? (
				<button
					type="button"
					className="mt-2 flex h-[46px] items-center gap-2 rounded-full bg-[#18181b] px-6 font-[780] text-[#ffffff] shadow-[0_18px_34px_rgba(24,24,27,0.18)] transition-transform hover:-translate-y-0.5"
					onClick={onCreateArticle}
					data-testid="self-media-home-empty-create-button"
				>
					<Plus size={16} />
					<span>{t("detail.selfMedia.home.create")}</span>
				</button>
			) : null}
		</section>
	)
}

export default SelfMediaHomeEmptyState
