import { cn } from "@/lib/utils"

type TranscriptSegmentDensity = "desktop" | "mobile"

/** Keeps transcript rows on a fixed box model so playback highlighting never shifts surrounding content. */
export function getTranscriptSegmentRowClassName(density: TranscriptSegmentDensity) {
	return cn(
		"rounded-xl text-left",
		// Desktop rows intentionally stay airy and borderless to match the latest PC prototype transcript column.
		density === "desktop" ? "cursor-pointer px-2 py-2.5" : "px-3 py-2",
	)
}

/** Emphasizes only the active timestamp instead of adding a larger selection card around the whole row. */
export function getTranscriptSegmentTimeClassName(active: boolean) {
	return cn(
		"shrink-0 tabular-nums transition-colors",
		active ? "text-foreground" : "text-foreground/35",
	)
}

/** Uses text contrast, not layout changes, to mirror the prototype's current-sentence focus. */
export function getTranscriptSegmentTextClassName(
	active: boolean,
	density: TranscriptSegmentDensity,
) {
	return cn(
		density === "desktop" ? "whitespace-pre-wrap text-sm leading-6" : "text-[16px] leading-7",
		"transition-colors",
		active ? "text-foreground" : "text-foreground/65",
	)
}

/** Softens inactive speaker chips so the current sentence chip remains the primary focus cue. */
export function getTranscriptSpeakerChipToneClassName(active: boolean) {
	return cn("transition-opacity", !active && "opacity-70")
}
