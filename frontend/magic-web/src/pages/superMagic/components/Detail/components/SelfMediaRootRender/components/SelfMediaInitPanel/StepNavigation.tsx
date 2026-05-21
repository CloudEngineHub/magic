import { useTranslation } from "react-i18next"
import { cn } from "@/lib/utils"
import { STEPS } from "./constants"
import { ChevronLeft, ChevronRight, RefreshCw } from "lucide-react"

interface StepNavigationProps {
	currentStep: number
	canProceed: boolean
	hasAnyInitData: boolean
	onNext: () => void
	onPrev: () => void
	onClear: () => void
	onNavigate: (step: number) => void
}

export default function StepNavigation({
	currentStep,
	canProceed,
	hasAnyInitData,
	onNext,
	onPrev,
	onClear,
	onNavigate,
}: StepNavigationProps) {
	const { t } = useTranslation("super")

	return (
		<div
			className="shrink-0 border-t border-border/20 bg-background/40 backdrop-blur-md px-6 py-4"
			data-testid="self-media-init-panel-footer"
		>
			<div className="mx-auto max-w-4xl flex items-center justify-between gap-4">
				{/* Left side actions */}
				<div className="flex items-center gap-2">
					<button
						type="button"
						className={cn(
							"flex items-center gap-1.5 rounded-xl px-4 py-2.5 text-xs font-semibold tracking-wide transition-all duration-300",
							hasAnyInitData
								? "text-destructive hover:bg-destructive/10 active:scale-[0.98] cursor-pointer"
								: "cursor-not-allowed text-muted-foreground/45 opacity-50",
						)}
						onClick={onClear}
						disabled={!hasAnyInitData}
						data-testid="self-media-init-panel-clear-button"
					>
						<RefreshCw size={13} className={cn(hasAnyInitData && "hover:rotate-180 transition-transform duration-500")} />
						<span>{t("detail.selfMedia.initPanel.nav.clear")}</span>
					</button>

					{currentStep > 0 && (
						<button
							type="button"
							className="group/prev flex items-center gap-1.5 rounded-xl border border-border/60 bg-background/50 px-4 py-2.5 text-xs font-semibold transition-all duration-300 hover:bg-muted hover:border-primary/20 active:scale-[0.98] cursor-pointer"
							onClick={onPrev}
							data-testid="self-media-init-panel-prev-button"
						>
							<ChevronLeft size={14} className="group-hover/prev:-translate-x-0.5 transition-transform" />
							<span>{t("detail.selfMedia.initPanel.nav.prev")}</span>
						</button>
					)}
				</div>

				{/* Center milestone dot indicators */}
				<div className="flex items-center gap-2 select-none">
					{STEPS.map((_, index) => (
						<button
							key={index}
							type="button"
							className={cn(
								"h-1.5 rounded-full transition-all duration-500 cursor-pointer outline-none hover:opacity-85",
								index === currentStep
									? "w-8 bg-gradient-to-r from-primary to-indigo-500 shadow-sm shadow-primary/20"
									: index < currentStep
										? "w-1.5 bg-primary/45"
										: "w-1.5 bg-border/80",
							)}
							onClick={() => onNavigate(index)}
							aria-label={t("detail.selfMedia.initPanel.nav.jumpTo", {
								title: t(STEPS[index].titleKey),
							})}
						/>
					))}
				</div>

				{/* Right side actions */}
				{currentStep < STEPS.length - 1 ? (
					<button
						type="button"
						className={cn(
							"group/next flex items-center gap-1.5 rounded-xl px-5 py-2.5 text-xs font-bold tracking-wide transition-all duration-300 outline-none",
							canProceed
								? "bg-gradient-to-r from-primary to-indigo-600 text-primary-foreground shadow-lg shadow-primary/20 hover:shadow-xl hover:shadow-primary/25 hover:scale-[1.015] active:scale-[0.985] cursor-pointer"
								: "cursor-not-allowed bg-muted text-muted-foreground/50 border border-border/40",
						)}
						onClick={onNext}
						disabled={!canProceed}
					>
						<span>{t("detail.selfMedia.initPanel.nav.next")}</span>
						<ChevronRight size={14} className="group-hover/next:translate-x-0.5 transition-transform" />
					</button>
				) : (
					<div className="w-24" />
				)}
			</div>
		</div>
	)
}
