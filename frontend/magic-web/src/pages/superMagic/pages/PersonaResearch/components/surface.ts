import type { HypothesisVerdict, ThemeConfidence } from "../types"

/**
 * Raised card on the research canvas: white surface, soft shadow and a hairline ring instead
 * of a hard border, so cards separate from the gray canvas without adding more lines.
 */
export const CARD_SURFACE =
	"rounded-xl bg-card shadow-[0_1px_2px_rgb(0_0_0/0.04),0_2px_8px_-2px_rgb(0_0_0/0.05)] ring-1 ring-border/60"

/** Left accent colour per verdict; the colour carries the conclusion before any text is read. */
export const VERDICT_ACCENT: Record<HypothesisVerdict, string> = {
	supported: "bg-emerald-500",
	refuted: "bg-rose-500",
	mixed: "bg-amber-400",
	insufficient: "bg-slate-300 dark:bg-slate-600",
	pending: "bg-border",
}

/** Left accent colour per theme confidence. */
export const CONFIDENCE_ACCENT: Record<ThemeConfidence, string> = {
	high: "bg-emerald-500",
	medium: "bg-sky-500",
	low: "bg-slate-300 dark:bg-slate-600",
	to_validate: "bg-amber-400",
}
