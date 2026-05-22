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
			return <Check size={iconSize} strokeWidth={3} className="text-zinc-950" />
		}
		switch (index) {
			case 0:
				return (
					<Compass
						size={iconSize}
						className={cn(active ? "text-zinc-50" : "text-muted-foreground")}
					/>
				)
			case 1:
				return (
					<ListTodo
						size={iconSize}
						className={cn(active ? "text-zinc-50" : "text-muted-foreground")}
					/>
				)
			case 2:
				return (
					<Play
						size={iconSize}
						className={cn(active ? "text-zinc-50" : "text-muted-foreground")}
					/>
				)
			default:
				return <span>{index + 1}</span>
		}
	}

	return (
		<div
			className="relative shrink-0 border-b border-border/40 bg-white px-6 py-6"
			data-testid="self-media-init-panel-header"
		>
			{/* Progress timeline bar */}
			<div className="absolute bottom-0 left-0 h-[3px] w-full bg-zinc-100">
				<div
					className="h-full border-r-2 border-zinc-950 bg-primary transition-all duration-700 ease-out"
					style={{ width: `${((currentStep + 1) / STEPS.length) * 100}%` }}
				/>
			</div>

			<div className="mx-auto flex max-w-4xl items-center justify-between">
				{STEPS.map((step, index) => {
					const isActive = index === currentStep
					const isPassed = index < currentStep

					return (
						<div
							key={step.key}
							className="group/step flex flex-1 items-center last:flex-initial"
						>
							<button
								type="button"
								className="flex cursor-pointer items-center gap-3 text-left outline-none transition-all duration-300"
								onClick={() => onNavigate(index)}
							>
								{/* Glowing dot with smooth scaling */}
								<div
									className={cn(
										"flex h-9 w-9 items-center justify-center rounded-full transition-all duration-300",
										isActive
											? "scale-105 border border-zinc-950 bg-zinc-950 text-white shadow-sm"
											: isPassed
												? "border border-zinc-950/15 bg-primary/20 text-zinc-950 hover:bg-primary/30"
												: "border border-zinc-200 bg-white text-muted-foreground hover:border-zinc-300",
									)}
								>
									{getStepIcon(index, isActive, isPassed)}
								</div>

								{/* Label text */}
								<div className="hidden select-none flex-col md:flex">
									<span className="text-[10px] font-black uppercase tracking-[0.15em] text-primary">
										STAGE 0{index + 1}
									</span>
									<span
										className={cn(
											"text-xs tracking-wide transition-all duration-300",
											isActive
												? "font-black text-zinc-950"
												: "font-bold text-muted-foreground group-hover/step:text-foreground",
										)}
									>
										{t(step.titleKey)}
									</span>
								</div>
							</button>

							{/* High-end connecting line */}
							{index < STEPS.length - 1 && (
								<div className="relative mx-4 hidden h-[1px] flex-1 sm:block">
									<div
										className={cn(
											"absolute inset-0 border-b transition-all duration-500",
											isPassed
												? "border-solid border-zinc-950/30"
												: "border-dashed border-zinc-200",
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
