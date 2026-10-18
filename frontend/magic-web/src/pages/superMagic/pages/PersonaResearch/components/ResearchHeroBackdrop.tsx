import "./research-hero-backdrop.css"

/**
 * Quiet paper backdrop for the research home hero: a warm tone and fine grain, fading into the
 * page. Deliberately no drawn figures; imagery should be real photography or nothing.
 */
export default function ResearchHeroBackdrop() {
	return (
		<div aria-hidden className="prh-root">
			<span className="prh-grain" />
		</div>
	)
}
