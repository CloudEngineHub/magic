import postcss from "postcss"
import { describe, expect, it } from "vitest"
import dynamicViewportFallback from "../postcss-dynamic-viewport-fallback"

/** Process a CSS snippet with the local dynamic viewport fallback plugin. */
async function processCss(css: string) {
	const result = await postcss([dynamicViewportFallback()]).process(css, { from: undefined })
	return result.css
}

describe("postcss dynamic viewport fallback", () => {
	it("adds a vh fallback for dynamic height units", async () => {
		// Verify that old WebViews can use the cloned height declaration.
		expect(await processCss(".popup { height: 100dvh; }")).toBe(
			".popup { height: 100vh; height: 100dvh; }",
		)
	})

	it("adds a vw fallback for dynamic width units", async () => {
		// Verify that width units receive the corresponding legacy fallback.
		expect(await processCss(".panel { width: 80dvw; }")).toBe(
			".panel { width: 80vw; width: 80dvw; }",
		)
	})

	it("converts dynamic units inside complex expressions", async () => {
		// Ensure nested calc and min expressions are converted as one declaration.
		expect(
			await processCss(
				".popup { height: min(98dvh, calc(100dvh - 3rem)); inset-inline-size: calc(100dvw - 2rem); }",
			),
		).toBe(
			".popup { height: min(98vh, calc(100vh - 3rem)); height: min(98dvh, calc(100dvh - 3rem)); inset-inline-size: calc(100vw - 2rem); inset-inline-size: calc(100dvw - 2rem); }",
		)
	})

	it("maps small and large viewport units to the matching axis", async () => {
		// Cover every supported dynamic unit variant in a single stylesheet.
		expect(
			await processCss(
				".layout { height: 50svh; min-height: 60lvh; width: 50svw; max-width: 60lvw; }",
			),
		).toBe(
			".layout { height: 50vh; height: 50svh; min-height: 60vh; min-height: 60lvh; width: 50vw; width: 50svw; max-width: 60vw; max-width: 60lvw; }",
		)
	})

	it("leaves ordinary viewport units and custom properties unchanged", async () => {
		// Avoid touching already-compatible declarations and variable definitions.
		expect(
			await processCss(
				":root { --mobile-height: 100dvh; } .layout { height: 100vh; width: 100vw; }",
			),
		).toBe(":root { --mobile-height: 100dvh; } .layout { height: 100vh; width: 100vw; }")
	})

	it("preserves strings, URLs, and identifiers containing viewport-like text", async () => {
		// Only CSS dimension tokens should participate in fallback generation.
		expect(
			await processCss(
				'.icon { content: "100dvh"; background: url("100dvw"); mask: url(100svh); animation-name: foo100lvw; }',
			),
		).toBe(
			'.icon { content: "100dvh"; background: url("100dvw"); mask: url(100svh); animation-name: foo100lvw; }',
		)
	})

	it("is idempotent when the plugin runs more than once", async () => {
		// Prevent repeated PostCSS passes from accumulating duplicate fallbacks.
		const result = await postcss([
			dynamicViewportFallback(),
			dynamicViewportFallback(),
		]).process(".popup { height: 100dvh; }", { from: undefined })

		expect(result.css).toBe(".popup { height: 100vh; height: 100dvh; }")
	})
})
