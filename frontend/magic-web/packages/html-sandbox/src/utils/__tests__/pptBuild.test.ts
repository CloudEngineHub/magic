import { afterEach, describe, expect, it } from "vitest"
import { collectPPTBuilds, parsePPTBuild } from "../pptBuild"
import { ContentCleaner } from "../ContentCleaner"

const build = (step: number, effect = "fade") => JSON.stringify({ version: 1, step, effect })
afterEach(() => {
	document.body.innerHTML = ""
})
describe("PPT authored builds", () => {
	it("rejects unsupported versions, effects and unsafe numbers without hiding content", () => {
		for (const raw of [
			null,
			"{",
			build(0),
			build(1.5),
			build(1001),
			build(1, "script"),
			'{"version":2,"step":1,"effect":"fade"}',
		])
			expect(parsePPTBuild(raw)).toBeNull()
		expect(parsePPTBuild(build(7))).toEqual({ version: 1, step: 7, effect: "fade" })
	})
	it("uses outermost valid HTML elements, ignoring runtime and SVG internals", () => {
		document.body.innerHTML = `<section data-magic-ppt-build='${build(3)}'><p data-magic-ppt-build='${build(1)}'>nested</p></section><div data-injected><p data-magic-ppt-build='${build(2)}'>runtime</p></div><svg><text data-magic-ppt-build='${build(1)}'>svg</text></svg><p data-magic-ppt-build='${build(3)}'>same group</p>`
		expect(
			collectPPTBuilds(document).map(({ element, build }) => [element.tagName, build.step]),
		).toEqual([
			["SECTION", 3],
			["P", 3],
		])
	})
	it("preserves metadata but strips visibility and runtime styles from saved HTML", () => {
		const html = `<!doctype html><html><head><style data-injected>hidden styles</style></head><body><p data-magic-ppt-build='${build(2)}' data-magic-ppt-build-hidden>All content</p></body></html>`
		const cleaned = ContentCleaner.cleanDocument(html)
		expect(cleaned).toContain("data-magic-ppt-build=")
		expect(cleaned).toContain("All content")
		expect(cleaned).not.toContain("data-magic-ppt-build-hidden")
		expect(cleaned).not.toContain("hidden styles")
	})
})
