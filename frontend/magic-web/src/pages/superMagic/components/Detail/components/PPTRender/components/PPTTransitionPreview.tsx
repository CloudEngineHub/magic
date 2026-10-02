import { useEffect, useRef } from "react"
import { useTranslation } from "react-i18next"
import type { PPTTransition } from "../utils/pptTransitions"
import { animatePPTTransition } from "../utils/pptTransitionAnimation"

export default function PPTTransitionPreview({
	transition,
	run,
	reducedMotion,
}: {
	transition: PPTTransition
	run: number
	reducedMotion: boolean
}) {
	const { t } = useTranslation("super")
	const previousRef = useRef<HTMLDivElement>(null)
	const nextRef = useRef<HTMLDivElement>(null)
	const playedRun = useRef(run)
	useEffect(() => {
		// Reopening the sheet or changing system motion preferences must not autoplay.
		if (playedRun.current === run) return
		playedRun.current = run
		const previous = previousRef.current
		const next = nextRef.current
		if (!run || reducedMotion || !previous || !next) return
		// Preview and presentation share the same fixed effect implementation.
		return animatePPTTransition(previous, next, transition).cancel
	}, [run, reducedMotion, transition])
	return (
		<figure className="space-y-2">
			<div
				className="relative aspect-video overflow-hidden rounded-lg border bg-muted"
				aria-hidden="true"
			>
				<div
					ref={previousRef}
					className="absolute inset-0 flex items-center justify-center bg-muted text-3xl text-muted-foreground"
				>
					A
				</div>
				<div
					ref={nextRef}
					className="absolute inset-0 flex items-center justify-center bg-background text-3xl text-primary"
				>
					B
				</div>
			</div>
			<figcaption className="text-xs text-muted-foreground">
				{t("ppt.transitions.example")}
			</figcaption>
		</figure>
	)
}
