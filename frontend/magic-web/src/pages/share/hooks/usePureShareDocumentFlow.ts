import { useEffect } from "react"

/**
 * Temporarily releases the fixed-height application shell for a pure share page.
 *
 * Normal workspace routes rely on these shell nodes to own scrolling. A pure HTML share
 * expands an iframe into the document instead, so each boundary must permit its height to flow
 * through to the browser document for whole-page screenshots.
 */
export default function usePureShareDocumentFlow(enabled: boolean) {
	useEffect(() => {
		if (!enabled) return

		const root = document.getElementById("root")
		const magicApp = root?.querySelector<HTMLElement>(".magic-app")
		const targets = [document.documentElement, document.body, root, magicApp].filter(
			(target): target is HTMLElement => Boolean(target),
		)
		const previousInlineStyles = targets.map((target) => ({
			target,
			style: target.getAttribute("style"),
		}))

		// The inline overrides win over fixed shell classes only while the pure share is mounted.
		targets.forEach((target) => {
			target.style.setProperty("height", "auto", "important")
			target.style.setProperty("min-height", "100dvh", "important")
			target.style.setProperty("overflow", "visible", "important")
		})

		return () => {
			previousInlineStyles.forEach(({ target, style }) => {
				if (style === null) {
					target.removeAttribute("style")
				} else {
					target.setAttribute("style", style)
				}
			})
		}
	}, [enabled])
}
