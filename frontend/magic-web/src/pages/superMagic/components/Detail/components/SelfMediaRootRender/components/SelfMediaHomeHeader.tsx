import { Plus, Settings, Sparkles } from "lucide-react"
import MagicTooltip from "@/components/base/MagicTooltip"
import { cn } from "@/lib/utils"
import type { AICardCreateInitialValues } from "./AICardCreateDialog"
import type { SelfMediaHomeTranslate } from "./SelfMediaHomeTypes"

interface SelfMediaHomeHeaderProps {
	greetingTitle: string
	greetingSubtitle: string
	opening: boolean
	onCreateArticle?: () => void
	onOpenBrandConfig?: () => void
	onCreateAICard?: (initialValues?: AICardCreateInitialValues) => void
	t: SelfMediaHomeTranslate
}

function SelfMediaHomeHeader({
	greetingTitle,
	greetingSubtitle,
	opening,
	onCreateArticle,
	onOpenBrandConfig,
	onCreateAICard,
	t,
}: SelfMediaHomeHeaderProps) {
	return (
		<header
			className={cn(
				"self-media-home-enter-item pb-6 pt-4",
				opening && "self-media-home-opening-dim",
			)}
			style={{ animationDelay: "40ms" }}
			data-testid="self-media-home-header"
		>
			<div className="flex flex-col gap-4 [container-type:inline-size] sm:flex-row sm:items-center sm:justify-between">
				<div className="space-y-1">
					<h2 className="text-3xl font-[780] leading-[1.05] tracking-tight text-[#18181b] sm:text-[30px]">
						{greetingTitle}
					</h2>
					<p className="mt-2.5 text-sm text-[#71717a]">{greetingSubtitle}</p>
				</div>
				<div className="flex flex-nowrap items-center gap-3">
					<div className="flex h-[54px] items-center gap-2 rounded-full bg-white/90 px-2 shadow-[inset_0_1px_rgba(255,255,255,0.8)]">
						{onOpenBrandConfig ? (
							<MagicTooltip title={t("detail.selfMedia.home.brandConfig")}>
								<button
									type="button"
									className="flex h-10 w-10 items-center justify-center rounded-full text-[#18181b] transition-colors hover:bg-[#18181b] hover:text-[#ffd637]"
									onClick={onOpenBrandConfig}
									data-testid="self-media-home-brand-config-button"
								>
									<Settings size={19} />
								</button>
							</MagicTooltip>
						) : null}
						{onCreateAICard ? (
							<MagicTooltip title={t("detail.selfMedia.home.aiCard")}>
								<button
									type="button"
									className="flex h-10 w-10 items-center justify-center rounded-full text-[#18181b] transition-colors hover:bg-[#18181b] hover:text-[#ffd637]"
									onClick={() => onCreateAICard()}
									data-testid="self-media-home-ai-card-button"
								>
									<Sparkles size={19} />
								</button>
							</MagicTooltip>
						) : null}
					</div>
					{onCreateArticle ? (
						<button
							type="button"
							className="flex h-[54px] items-center gap-2 rounded-[25px] bg-[#18181b] px-[31px] font-[800] text-[#ffffff] shadow-[0_18px_34px_rgba(24,24,27,0.18)] transition-transform hover:-translate-y-0.5"
							onClick={onCreateArticle}
							data-testid="self-media-home-create-button"
						>
							<Plus size={16} className="shrink-0" />
							<span>{t("detail.selfMedia.home.create")}</span>
						</button>
					) : null}
				</div>
			</div>
		</header>
	)
}

export default SelfMediaHomeHeader
