import { useTranslation } from "react-i18next"
import { cn } from "@/lib/utils"
import { STEPS } from "./constants"
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
			return <Check size={iconSize} strokeWidth={3} className="text-primary-foreground" />
		}
		switch (index) {
			case 0:
				return (
					<Compass
						size={iconSize}
						className={cn(active ? "text-primary-foreground" : "text-muted-foreground")}
					/>
				)
			case 1:
				return (
					<ListTodo
						size={iconSize}
						className={cn(active ? "text-primary-foreground" : "text-muted-foreground")}
					/>
				)
			case 2:
				return (
					<Play
						size={iconSize}
						className={cn(active ? "text-primary-foreground" : "text-muted-foreground")}
					/>
				)
			default:
				return <span>{index + 1}</span>
		}
	}

	return (
		<div
			className="relative shrink-0 border-b border-border/25 bg-background/35 backdrop-blur-md px-6 py-6"
			data-testid="self-media-init-panel-header"
		>
			{/* High-end ambient background glow behind steps */}
			<div className="absolute left-1/2 top-1/2 -z-10 h-24 w-80 -translate-x-1/2 -translate-y-1/2 rounded-full bg-gradient-to-r from-primary/5 to-indigo-500/5 blur-3xl" />

			{/* Progress timeline bar */}
			<div className="absolute bottom-0 left-0 h-[1.5px] w-full bg-border/20">
				<div
					className="h-full bg-gradient-to-r from-primary via-indigo-500 to-violet-600 transition-all duration-700 ease-out"
					style={{ width: `${((currentStep + 1) / STEPS.length) * 100}%` }}
				/>
			</div>

			<div className="mx-auto max-w-4xl flex items-center justify-between">
				{STEPS.map((step, index) => {
					const isActive = index === currentStep
					const isPassed = index < currentStep

					return (
						<div key={step.key} className="flex-1 flex items-center group/step last:flex-initial">
							<button
								type="button"
								className="flex items-center gap-3 transition-all duration-300 text-left outline-none cursor-pointer"
								onClick={() => onNavigate(index)}
							>
								{/* Glowing dot with smooth scaling */}
								<div
									className={cn(
										"flex h-9 w-9 items-center justify-center rounded-full transition-all duration-500 shadow-sm",
										isActive
											? "bg-gradient-to-br from-primary to-indigo-600 text-primary-foreground ring-4 ring-primary/15 shadow-md shadow-primary/20 scale-105"
											: isPassed
												? "bg-gradient-to-br from-primary/20 to-indigo-500/10 text-primary hover:bg-primary/25 border border-primary/15"
												: "bg-muted/60 text-muted-foreground border border-border hover:bg-muted hover:border-muted-foreground/30",
									)}
								>
									{getStepIcon(index, isActive, isPassed)}
								</div>

								{/* Label text */}
								<div className="hidden md:flex flex-col select-none">
									<span className="bg-gradient-to-r from-primary/70 to-indigo-500/60 bg-clip-text text-[10px] font-bold tracking-[0.15em] text-transparent uppercase">
										STAGE 0{index + 1}
									</span>
									<span
										className={cn(
											"text-xs tracking-wide transition-all duration-300",
											isActive
												? "text-foreground font-bold"
												: "text-muted-foreground font-medium group-hover/step:text-foreground",
										)}
									>
										{t(step.titleKey)}
									</span>
								</div>
							</button>

							{/* High-end connecting line */}
							{index < STEPS.length - 1 && (
								<div className="mx-4 flex-1 h-[1px] relative overflow-hidden hidden sm:block">
									<div className="absolute inset-0 bg-border/40" />
									<div
										className={cn(
											"absolute inset-0 bg-gradient-to-r from-primary to-indigo-500/40 transition-transform duration-700 ease-out origin-left",
											isPassed ? "scale-x-100" : "scale-x-0",
										)}
									/>
								</div>
							)}
						</div>
					);
				})}
			</div>
		</div>
	)
}
