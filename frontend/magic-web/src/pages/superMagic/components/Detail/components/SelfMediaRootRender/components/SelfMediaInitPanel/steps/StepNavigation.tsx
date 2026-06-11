import { useTranslation } from "react-i18next"
import { cn } from "@/lib/utils"
import MagicTooltip from "@/components/base/MagicTooltip"
import { Button } from "@/components/shadcn-ui/button"
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
			className="shrink-0 bg-background/80 px-4 pb-[max(var(--safe-area-inset-bottom),1rem)] pt-4 backdrop-blur supports-[backdrop-filter]:bg-background/70 sm:px-6"
			data-testid="self-media-init-panel-footer"
		>
			<div className="mx-auto flex max-w-5xl items-center justify-between gap-4">
				{/* Left side actions */}
				<div className="flex items-center gap-2">
					{onBackHome ? (
						<MagicTooltip title={t("detail.selfMedia.initPanel.nav.backHome")}>
							<Button
								type="button"
								variant="outline"
								size="icon-sm"
								onClick={onBackHome}
								data-testid="self-media-init-panel-back-home-button"
							>
								<Home size={15} />
							</Button>
						</MagicTooltip>
					) : null}

					<MagicTooltip title={t("detail.selfMedia.initPanel.nav.clear")}>
						<Button
							type="button"
							className={cn(
								hasAnyInitData ? "text-destructive hover:text-destructive" : "",
							)}
							variant="ghost"
							size="icon-sm"
							onClick={onClear}
							disabled={!hasAnyInitData}
							data-testid="self-media-init-panel-clear-button"
						>
							<RefreshCw
								size={15}
								className={cn(
									hasAnyInitData &&
										"transition-transform duration-500 hover:rotate-180",
								)}
							/>
						</Button>
					</MagicTooltip>

					{currentStep > 0 && (
						<Button
							type="button"
							variant="outline"
							size="sm"
							className="group/prev text-xs"
							onClick={onPrev}
							data-testid="self-media-init-panel-prev-button"
						>
							<ChevronLeft
								size={14}
								className="transition-transform group-hover/prev:-translate-x-0.5"
							/>
							<span>{t("detail.selfMedia.initPanel.nav.prev")}</span>
						</Button>
					)}
				</div>

				{/* Center milestone dot indicators */}
				<div className="flex select-none items-center gap-2">
					{STEPS.map((_, index) => (
						<Button
							key={index}
							type="button"
							className={cn(
								"h-2.5 cursor-pointer rounded-full p-0 outline-none transition-all duration-300",
								index === currentStep
									? "w-8 bg-[#434c81]/65"
									: index < currentStep
										? "w-2.5 bg-[#434c81]/35"
										: "w-2.5 bg-muted/45",
							)}
							variant="ghost"
							onClick={() => onNavigate(index)}
							aria-label={t("detail.selfMedia.initPanel.nav.jumpTo", {
								title: t(STEPS[index].titleKey),
							})}
						/>
					))}
				</div>

				{/* Right side actions */}
				{currentStep < STEPS.length - 1 ? (
					<Button
						type="button"
						className={cn("group/next text-xs")}
						size="sm"
						onClick={onNext}
						disabled={!canProceed}
					>
						<span>{t("detail.selfMedia.initPanel.nav.next")}</span>
						<ChevronRight
							size={14}
							className="transition-transform group-hover/next:translate-x-0.5"
						/>
					</Button>
				) : (
					<div className="w-24" />
				)}
			</div>
		</div>
	)
}
