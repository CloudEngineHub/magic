import { useTranslation } from "react-i18next"
import { cn } from "@/lib/utils"
import { STEPS } from "../constants"
import { Check, Compass, ListTodo, Play } from "lucide-react"

interface StepIndicatorProps {
	currentStep: number
	onNavigate: (step: number) => void
}

export default function StepIndicator({ currentStep, onNavigate }: StepIndicatorProps) {
	const { t } = useTranslation("super")

	const getStepIcon = (index: number, active: boolean, passed: boolean) => {
		const iconSize = 14
		if (passed) {
			return <Check size={iconSize} strokeWidth={3} className="text-[#38426f]" />
		}
		switch (index) {
			case 0:
				return (
					<Compass
						size={iconSize}
						className={cn(active ? "text-[#38426f]" : "text-muted-foreground")}
					/>
				)
			case 1:
				return (
					<ListTodo
						size={iconSize}
						className={cn(active ? "text-[#38426f]" : "text-muted-foreground")}
					/>
				)
			case 2:
				return (
					<Play
						size={iconSize}
						className={cn(active ? "text-[#38426f]" : "text-muted-foreground")}
					/>
				)
			default:
				return <span>{index + 1}</span>
		}
	}

	return (
		<div
			className="relative shrink-0 bg-background/80 px-4 py-4 backdrop-blur supports-[backdrop-filter]:bg-background/70 sm:px-6"
			data-testid="self-media-init-panel-header"
		>
			{/* Progress timeline bar */}
			<div
				className="absolute bottom-0 left-0 h-[2px] w-full bg-[#434c81]/[0.08]"
				data-testid="self-media-init-panel-progress-track"
			>
				<div
					className="h-full bg-[#434c81]/60 transition-all duration-700 ease-out"
					style={{ width: `${((currentStep + 1) / STEPS.length) * 100}%` }}
				/>
			</div>

			<div className="mx-auto flex max-w-5xl items-center justify-between gap-3 overflow-x-auto">
				{STEPS.map((step, index) => {
					const isActive = index === currentStep
					const isPassed = index < currentStep

					return (
						<div
							key={step.key}
							className="group/step flex min-w-fit flex-1 items-center last:flex-initial"
						>
							<button
								type="button"
								className="flex cursor-pointer items-center gap-3 rounded-md text-left outline-none transition-colors duration-200 focus-visible:ring-[3px] focus-visible:ring-ring/50"
								onClick={() => onNavigate(index)}
							>
								<div
									data-testid="self-media-init-panel-step-icon"
									className={cn(
										"flex h-9 w-9 items-center justify-center rounded-md transition-transform duration-200 ease-out group-hover/step:-translate-y-0.5",
										isActive
											? "bg-[#434c81]/[0.13] text-[#38426f] shadow-[0_6px_18px_rgba(67,76,129,0.12)]"
											: isPassed
												? "bg-[#434c81]/[0.10] text-[#38426f] group-hover/step:bg-[#434c81]/[0.15]"
												: "bg-muted/45 text-muted-foreground group-hover/step:bg-[#434c81]/[0.06]",
									)}
								>
									{getStepIcon(index, isActive, isPassed)}
								</div>

								<div className="hidden select-none flex-col md:flex">
									<span className="text-[11px] font-medium text-muted-foreground">
										{index + 1}/{STEPS.length}
									</span>
									<span
										className={cn(
											"text-xs transition-colors duration-200",
											isActive
												? "font-semibold text-foreground"
												: "font-medium text-muted-foreground group-hover/step:text-foreground",
										)}
									>
										{t(step.titleKey)}
									</span>
								</div>
							</button>

							{index < STEPS.length - 1 && (
								<div className="relative mx-4 hidden h-[1px] flex-1 sm:block">
									<div
										className={cn(
											"absolute inset-x-0 top-1/2 h-px -translate-y-1/2 transition-colors duration-300",
											isPassed ? "bg-[#434c81]/25" : "bg-muted/55",
										)}
									/>
								</div>
							)}
						</div>
					)
				})}
			</div>
		</div>
	)
}
