import { useReducedMotion } from "framer-motion"
import { useId } from "react"
import { cn } from "@/lib/utils"

interface SlidesTemplateGlowBorderProps {
	className?: string
	radius?: number
}

export default function SlidesTemplateGlowBorder({
	className,
	radius = 10,
}: SlidesTemplateGlowBorderProps) {
	const reduceMotion = Boolean(useReducedMotion())
	const id = useId().replaceAll(":", "")
	const gradientId = `slides-template-glow-gradient-${id}`
	const filterId = `slides-template-glow-filter-${id}`

	return (
		<div
			aria-hidden="true"
			className={cn(
				"pointer-events-none absolute inset-0 z-30 transition-opacity duration-300",
				className,
			)}
			data-testid="slides-template-glow-border"
		>
			<svg
				className="absolute inset-px size-[calc(100%-2px)] overflow-visible"
				preserveAspectRatio="none"
			>
				<defs>
					<linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
						<stop offset="0%" stopColor="#79c7ff" />
						<stop offset="18%" stopColor="#7785ff" />
						<stop offset="38%" stopColor="#ad72ff" />
						<stop offset="58%" stopColor="#ed72c4" />
						<stop offset="76%" stopColor="#ff8d8d" />
						<stop offset="90%" stopColor="#e7b66d" />
						<stop offset="100%" stopColor="#79c7ff" />
						{reduceMotion ? null : (
							<animateTransform
								attributeName="gradientTransform"
								type="rotate"
								from="0 0.5 0.5"
								to="360 0.5 0.5"
								dur="7.5s"
								repeatCount="indefinite"
							/>
						)}
					</linearGradient>
					<filter id={filterId} x="-30%" y="-30%" width="160%" height="160%">
						<feGaussianBlur stdDeviation="3.2" />
					</filter>
				</defs>
				<rect
					x="0"
					y="0"
					width="100%"
					height="100%"
					rx={radius}
					fill="none"
					stroke={`url(#${gradientId})`}
					strokeWidth="5"
					opacity="0.58"
					filter={`url(#${filterId})`}
					vectorEffect="non-scaling-stroke"
				/>
				<rect
					x="0"
					y="0"
					width="100%"
					height="100%"
					rx={radius}
					fill="none"
					stroke={`url(#${gradientId})`}
					strokeWidth="1.8"
					opacity="0.98"
					vectorEffect="non-scaling-stroke"
				/>
				<rect
					x="0"
					y="0"
					width="100%"
					height="100%"
					rx={radius}
					fill="none"
					stroke="rgba(255,255,255,0.34)"
					strokeWidth="0.55"
					vectorEffect="non-scaling-stroke"
				/>
			</svg>
		</div>
	)
}
