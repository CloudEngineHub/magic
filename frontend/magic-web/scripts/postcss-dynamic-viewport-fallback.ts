import type { Declaration, Plugin } from "postcss"

/**
 * This plugin emits a legacy viewport-unit declaration before every supported
 * dynamic viewport declaration so older WebViews can still resolve the rule.
 */

// Match numeric dynamic viewport lengths while preserving the numeric portion.
const DYNAMIC_VIEWPORT_UNIT_PATTERN = /(\d*\.?\d+)(dvh|svh|lvh|dvw|svw|lvw)\b/gi

// Height-axis units map to vh; all supported width-axis units map to vw.
const DYNAMIC_HEIGHT_UNITS = new Set(["dvh", "svh", "lvh"])

/** Replace dynamic viewport units with their legacy viewport equivalents. */
function replaceDynamicViewportUnits(value: string) {
	return value.replace(
		DYNAMIC_VIEWPORT_UNIT_PATTERN,
		(_match, numericValue: string, dynamicUnit: string) => {
			const fallbackUnit = DYNAMIC_HEIGHT_UNITS.has(dynamicUnit.toLowerCase()) ? "vh" : "vw"
			return `${numericValue}${fallbackUnit}`
		},
	)
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
