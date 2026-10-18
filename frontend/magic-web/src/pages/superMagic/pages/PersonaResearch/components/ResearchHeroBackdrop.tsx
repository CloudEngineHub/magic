import type { CSSProperties } from "react"
import "./research-hero-backdrop.css"

/** Seconds for every respondent to have spoken once. */
const CYCLE = 24

/** Speaking colours, muted to sit on the paper tone. */
const COLORS = [
	"oklch(0.62 0.11 160)",
	"oklch(0.6 0.11 250)",
	"oklch(0.68 0.12 70)",
	"oklch(0.6 0.13 25)",
	"oklch(0.58 0.11 300)",
	"oklch(0.62 0.09 200)",
]

/**
 * Two loose clusters beside the content column, so the headline and composer stay clear.
 * `gap` is the distance in px outward from the column edge; y is from the top of the hero.
 */
const RESPONDENTS: Array<{
	name: string
	side: "left" | "right"
	gap: number
	y: number
	size: number
}> = [
	{ name: "吴", side: "left", gap: 30, y: 125, size: 22 },
	{ name: "刘", side: "left", gap: 60, y: 235, size: 30 },
	{ name: "陈", side: "left", gap: 90, y: 60, size: 26 },
	{ name: "周", side: "left", gap: 120, y: 330, size: 24 },
	{ name: "王", side: "left", gap: 140, y: 150, size: 28 },
	{ name: "李", side: "left", gap: 210, y: 245, size: 38 },
	{ name: "张", side: "left", gap: 250, y: 70, size: 34 },
	{ name: "黄", side: "left", gap: 290, y: 340, size: 28 },
	{ name: "马", side: "right", gap: 30, y: 135, size: 22 },
	{ name: "何", side: "right", gap: 55, y: 240, size: 30 },
	{ name: "郭", side: "right", gap: 95, y: 62, size: 26 },
	{ name: "罗", side: "right", gap: 115, y: 335, size: 24 },
	{ name: "孙", side: "right", gap: 150, y: 160, size: 28 },
	{ name: "杨", side: "right", gap: 205, y: 255, size: 38 },
	{ name: "赵", side: "right", gap: 245, y: 80, size: 34 },
	{ name: "林", side: "right", gap: 285, y: 350, size: 28 },
]

/** Half the hero content width (max-w-4xl) plus breathing room. */
const COLUMN_HALF = 470

/**
 * Decorative "listening" backdrop for the research home hero: a panel of AI respondents that
 * take turns to speak while sound waves spread from the headline. Hidden from assistive tech.
 */
export default function ResearchHeroBackdrop() {
	// Interleave the two clusters so turns alternate left and right.
	const order = RESPONDENTS.map((_, index) =>
		index % 2 === 0 ? index / 2 : RESPONDENTS.length / 2 + (index - 1) / 2,
	)
	const step = CYCLE / RESPONDENTS.length
	return (
		<div aria-hidden className="prh-root">
			<span className="prh-grain" />
			<span className="prh-waves">
				<span className="prh-wave" />
				<span className="prh-wave" />
				<span className="prh-wave" />
			</span>
			{order.map((respondentIndex, turn) => {
				const respondent = RESPONDENTS[respondentIndex]
				const vars = {
					"--prh-x":
						respondent.side === "left"
							? `calc(50% - ${COLUMN_HALF + respondent.gap}px)`
							: `calc(50% + ${COLUMN_HALF + respondent.gap}px)`,
					"--prh-y": `${respondent.y}px`,
					"--prh-size": `${respondent.size}px`,
					"--prh-color": COLORS[turn % COLORS.length],
					"--prh-cycle": `${CYCLE}s`,
					"--prh-turn": `${turn * step}s`,
					"--prh-float-delay": `${-(respondentIndex * 0.9)}s`,
				} as CSSProperties
				return (
					<span key={respondent.name} className="prh-person" style={vars}>
						<span className="prh-avatar">{respondent.name}</span>
					</span>
				)
			})}
		</div>
	)
}
