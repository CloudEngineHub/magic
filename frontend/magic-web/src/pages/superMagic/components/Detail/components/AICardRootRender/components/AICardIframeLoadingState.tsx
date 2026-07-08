import type { CSSProperties } from "react"

const AI_CARD_LOADING_STYLE = `
@keyframes aiCardSparkleSync {
	0% {
		transform: translate3d(0, 0, 0) scale(0.26);
		opacity: 0.28;
	}
	50% {
		transform: translate3d(24px, 22px, 0) scale(1);
		opacity: 1;
	}
	100% {
		transform: translate3d(48px, 44px, 0) scale(0.18);
		opacity: 0.12;
	}
}
`

type SparkleStyle = CSSProperties & Record<`--${string}`, string>

const AI_CARD_LOADING_SPARKLES: Array<{
	className: string
	style: SparkleStyle
}> = [
	{
		className: "absolute text-foreground",
		style: {
			left: "3px",
			top: "-3px",
			width: "42px",
			height: "42px",
			animation: "aiCardSparkleSync 2s linear infinite",
			transformOrigin: "center",
		},
	},
	{
		className: "absolute text-foreground",
		style: {
			left: "3px",
			top: "-3px",
			width: "42px",
			height: "42px",
			animation: "aiCardSparkleSync 2s linear -0.666s infinite",
			transformOrigin: "center",
		},
	},
	{
		className: "absolute text-foreground",
		style: {
			left: "3px",
			top: "-3px",
			width: "42px",
			height: "42px",
			animation: "aiCardSparkleSync 2s linear -1.333s infinite",
			transformOrigin: "center",
		},
	},
]

function SparkleShape({ className, style }: { className?: string; style?: SparkleStyle }) {
	return (
		<svg
			viewBox="0 0 100 100"
			className={className}
			style={style}
			focusable="false"
			data-testid="ai-card-loading-sparkle"
		>
			<path
				d="M50 2C55.6 29.6 70.4 44.4 98 50C70.4 55.6 55.6 70.4 50 98C44.4 70.4 29.6 55.6 2 50C29.6 44.4 44.4 29.6 50 2Z"
				fill="currentColor"
			/>
		</svg>
	)
}

export function AICardIframeLoadingState({ label }: { label: string }) {
	return (
		<div
			className="absolute inset-0 z-10 flex items-center justify-center bg-background/70 p-4 backdrop-blur-[2px]"
			data-testid="ai-card-iframe-loading"
			role="status"
			aria-live="polite"
		>
			<div className="flex max-w-[calc(100%-24px)] flex-col items-center bg-background/80 px-4 py-3">
				<div
					className="relative h-20 w-24 text-foreground"
					data-testid="ai-card-loading-icon"
					aria-hidden="true"
				>
					<style>{AI_CARD_LOADING_STYLE}</style>
					{AI_CARD_LOADING_SPARKLES.map((sparkle, index) => (
						<SparkleShape
							key={index}
							className={sparkle.className}
							style={sparkle.style}
						/>
					))}
				</div>
				<span className="mt-3 max-w-full truncate text-xs font-medium text-foreground sm:text-sm">
					{label}
				</span>
			</div>
		</div>
	)
}
