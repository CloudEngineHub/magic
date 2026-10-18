import { useEffect, useState } from "react"
import { useMemoizedFn } from "ahooks"
import { useUserInfo } from "@/models/user/hooks"
import { useIsMobile } from "@/hooks/useIsMobile"
// The manager module only, not the LazyGuideTour barrel: the barrel pulls the tour's lazy chunk.
import { isHomeOnboardingRunBlocking } from "@/pages/superMagic/components/LazyGuideTour/GuideTourManager"
import ResearchSpotlight, { type ResearchSpotlightOutcome } from "./ResearchSpotlight"
import {
	hasSeenResearchOnboarding,
	markResearchOnboardingSeen,
	subscribeResearchOnboardingReplay,
	type ResearchOnboardingPage,
} from "./onboardingState"
import { useResearchOnboardingSteps } from "./useResearchOnboardingSteps"

/** Lets the page settle (fonts, avatars, the stepper) before the first anchor is measured. */
const AUTO_OPEN_DELAY = 600

interface ResearchOnboardingProps {
	page: ResearchOnboardingPage
	/** The page has rendered its real content (not a skeleton); anchors can be measured. */
	ready: boolean
	/** Runs after the last step's primary action, e.g. focusing the home composer. */
	onFinish?: () => void
}

/**
 * Plays the page's tour once per user and browser, and again whenever the help dialog asks.
 * Desktop only: the tour points at a desktop layout, and phones keep the help dialog.
 */
export default function ResearchOnboarding({ page, ready, onFinish }: ResearchOnboardingProps) {
	const isMobile = useIsMobile()
	const { userInfo } = useUserInfo()
	const userId = userInfo?.magic_id
	const [open, setOpen] = useState(false)
	const { steps, finishLabel } = useResearchOnboardingSteps(page)

	useEffect(() => {
		if (!ready || isMobile || !userId || hasSeenResearchOnboarding(page, userId)) return
		const timer = window.setTimeout(() => {
			// Never stack on another overlay: the benefits tour, or a dialog the user opened in
			// the meantime. The tour simply waits for the next visit.
			if (isHomeOnboardingRunBlocking()) return
			if (document.querySelector('[role="dialog"][data-state="open"]')) return
			setOpen(true)
		}, AUTO_OPEN_DELAY)
		return () => window.clearTimeout(timer)
	}, [isMobile, page, ready, userId])

	useEffect(() => subscribeResearchOnboardingReplay(page, () => setOpen(true)), [page])

	const close = useMemoizedFn((outcome: ResearchSpotlightOutcome) => {
		setOpen(false)
		// A tour that found nothing to show has not been seen; let a later visit try again.
		if (userId && outcome !== "empty") markResearchOnboardingSeen(page, userId)
		if (outcome === "finished") onFinish?.()
	})

	if (!open || isMobile) return null
	return <ResearchSpotlight steps={steps} finishLabel={finishLabel} onClose={close} />
}
