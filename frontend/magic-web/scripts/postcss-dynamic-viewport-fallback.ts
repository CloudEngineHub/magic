import type { Declaration, Plugin } from "postcss"
import valueParser from "postcss-value-parser"

/**
 * This plugin emits a legacy viewport-unit declaration before every supported
 * dynamic viewport declaration so older WebViews can still resolve the rule.
 */

// Avoid parsing declarations that cannot contain a supported dynamic viewport unit.
const DYNAMIC_VIEWPORT_UNIT_CANDIDATE_PATTERN = /[dsl]v[hw]/i

// Map each dynamic viewport unit to the legacy fallback on the same axis.
const DYNAMIC_VIEWPORT_FALLBACK_UNITS = new Map([
	["dvh", "vh"],
	["svh", "vh"],
	["lvh", "vh"],
	["dvw", "vw"],
	["svw", "vw"],
	["lvw", "vw"],
])

/** Replace CSS dimension tokens while preserving strings, comments, and URL contents. */
function replaceDynamicViewportUnits(value: string) {
	if (!DYNAMIC_VIEWPORT_UNIT_CANDIDATE_PATTERN.test(value)) return value

	const parsedValue = valueParser(value)
	let changed = false

	parsedValue.walk((node) => {
		// URL contents are resources, not CSS dimensions, and must remain untouched.
		if (node.type === "function" && node.value.toLowerCase() === "url") return false
		if (node.type !== "word") return

		const dimension = valueParser.unit(node.value)
		if (!dimension) return

		const fallbackUnit = DYNAMIC_VIEWPORT_FALLBACK_UNITS.get(dimension.unit.toLowerCase())
		if (!fallbackUnit) return

		node.value = `${dimension.number}${fallbackUnit}`
		changed = true
	})

	return changed ? parsedValue.toString() : value
}

/** Check whether the declaration already has the fallback immediately before it. */
function hasEquivalentFallback(declaration: Declaration, fallbackValue: string) {
	const previousNode = declaration.prev()

	return (
		previousNode?.type === "decl" &&
		previousNode.prop === declaration.prop &&
		previousNode.value === fallbackValue
	)
}

/** Create a PostCSS plugin that adds legacy viewport fallbacks before dynamic declarations. */
const dynamicViewportFallback = Object.assign(
	function dynamicViewportFallback(): Plugin {
		return {
			postcssPlugin: "postcss-dynamic-viewport-fallback",

			/** Process each static declaration while preserving the modern declaration afterwards. */
			Declaration(declaration) {
				if (declaration.prop.startsWith("--")) return

				const fallbackValue = replaceDynamicViewportUnits(declaration.value)
				if (fallbackValue === declaration.value) return
				if (hasEquivalentFallback(declaration, fallbackValue)) return

				declaration.cloneBefore({ value: fallbackValue })
			},
		}
	},
	// Mark the factory so postcss-load-config invokes it as a PostCSS creator.
	{ postcss: true as const },
)

export default dynamicViewportFallback
