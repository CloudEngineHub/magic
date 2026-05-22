import { useTranslation } from "react-i18next"
import { cn } from "@/lib/utils"
import { STEPS } from "../constants"
import { ChevronLeft, ChevronRight, Home, RefreshCw } from "lucide-react"

interface StepNavigationProps {
	currentStep: number
	canProceed: boolean
	hasAnyInitData: boolean
	onNext: () => void
	onPrev: () => void
	onClear: () => void
	onNavigate: (step: number) => void
	onBackHome?: () => void
}

export default function StepNavigation({
	currentStep,
	canProceed,
	hasAnyInitData,
	onNext,
	onPrev,
	onClear,
	onNavigate,
	onBackHome,
}: StepNavigationProps) {
	const { t } = useTranslation("super")

	return (
		<div
			className="shrink-0 border-t border-zinc-950/10 bg-white px-6 py-4"
			data-testid="self-media-init-panel-footer"
		>
			<div className="mx-auto flex max-w-5xl items-center justify-between gap-4">
				{/* Left side actions */}
				<div className="flex items-center gap-2">
					{onBackHome ? (
						<button
							type="button"
							className="flex cursor-pointer items-center gap-1.5 bg-zinc-100 px-4 py-2 text-xs font-bold text-zinc-950 transition-all hover:bg-zinc-200 active:scale-[0.98]"
							onClick={onBackHome}
							data-testid="self-media-init-panel-back-home-button"
						>
							<Home size={13} />
							<span>{t("detail.selfMedia.initPanel.nav.backHome")}</span>
						</button>
					) : null}

					<button
						type="button"
						className={cn(
							"flex cursor-pointer items-center gap-1.5 px-4 py-2 text-xs font-bold transition-all active:scale-[0.98]",
							hasAnyInitData
								? "bg-red-50 text-destructive hover:bg-red-100"
								: "cursor-not-allowed bg-white text-muted-foreground/45 opacity-50",
						)}
						onClick={onClear}
						disabled={!hasAnyInitData}
						data-testid="self-media-init-panel-clear-button"
					>
						<RefreshCw
							size={13}
							className={cn(
								hasAnyInitData &&
									"transition-transform duration-500 hover:rotate-180",
							)}
						/>
						<span>{t("detail.selfMedia.initPanel.nav.clear")}</span>
					</button>

					{currentStep > 0 && (
						<button
							type="button"
							className="group/prev flex cursor-pointer items-center gap-1.5 bg-zinc-100 px-4 py-2 text-xs font-bold transition-all hover:bg-zinc-200 active:scale-[0.98]"
							onClick={onPrev}
							data-testid="self-media-init-panel-prev-button"
						>
							<ChevronLeft
								size={14}
								className="transition-transform group-hover/prev:-translate-x-0.5"
							/>
							<span>{t("detail.selfMedia.initPanel.nav.prev")}</span>
						</button>
					)}
				</div>

				{/* Center milestone dot indicators */}
				<div className="flex select-none items-center gap-2">
					{STEPS.map((_, index) => (
						<button
							key={index}
							type="button"
							className={cn(
								"h-2.5 cursor-pointer rounded-full border border-zinc-950 outline-none transition-all duration-300",
								index === currentStep
									? "w-8 bg-primary"
									: index < currentStep
										? "w-2.5 bg-primary/60"
										: "w-2.5 bg-white",
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
							"group/next flex items-center gap-1.5 px-5 py-2 text-xs font-black tracking-wide outline-none transition-all duration-300",
							canProceed
								? "cursor-pointer bg-zinc-950 text-white hover:bg-zinc-900 active:scale-[0.98]"
								: "cursor-not-allowed bg-muted text-muted-foreground/50",
						)}
						onClick={onNext}
						disabled={!canProceed}
					>
						<span>{t("detail.selfMedia.initPanel.nav.next")}</span>
						<ChevronRight
							size={14}
							className="transition-transform group-hover/next:translate-x-0.5"
						/>
					</button>
				) : (
					<div className="w-24" />
				)}
			</div>
		</div>
	)
}
