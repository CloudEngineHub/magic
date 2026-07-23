import { useEffect } from "react"

const documentFlowStyleOverrides = [
	["height", "auto"],
	["min-height", "100dvh"],
	["overflow", "visible"],
] as const

/**
 * Temporarily releases the fixed-height application shell for a pure share page.
 *
 * Normal workspace routes rely on these shell nodes to own scrolling. A pure HTML share
 * expands an iframe into the document instead, so each boundary must permit its height to flow
 * through to the browser document for whole-page screenshots. The page-level overrides are
 * deliberately limited to this special share mode and are removed when the route is left.
 */
export default function usePureShareDocumentFlow(enabled: boolean) {
	useEffect(() => {
		if (!enabled) return

		const root = document.getElementById("root")
		const magicApp = root?.querySelector<HTMLElement>(".magic-app")
		const targets = [document.documentElement, document.body, root, magicApp].filter(
			(target): target is HTMLElement => Boolean(target),
		)
		const previousStyleProperties = targets.flatMap((target) =>
			documentFlowStyleOverrides.map(([property, overrideValue]) => ({
				target,
				property,
				overrideValue,
				value: target.style.getPropertyValue(property),
				priority: target.style.getPropertyPriority(property),
			})),
		)

		// The app shell normally owns a viewport-sized internal scroll area. In a pure share, the
		// iframe must expand into the browser document so whole-page capture tools can scroll it.
		// Use !important only while this route is mounted to override shell utility classes.
		targets.forEach((target) => {
			documentFlowStyleOverrides.forEach(([property, value]) => {
				target.style.setProperty(property, value, "important")
			})
		})

		return () => {
			previousStyleProperties.forEach(
				({ target, property, overrideValue, value, priority }) => {
					// Another feature may have changed the same property while this hook was active.
					// Restore it only when the current declaration is still owned by this hook.
					if (
						target.style.getPropertyValue(property) !== overrideValue ||
						target.style.getPropertyPriority(property) !== "important"
					) {
						return
					}

					if (value) {
						target.style.setProperty(property, value, priority)
					} else {
						target.style.removeProperty(property)
					}
				},
			)
		}
	}, [enabled])
}
