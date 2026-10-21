import { afterEach, describe, expect, it } from "vitest"
import { collectPPTBuilds, normalizePPTBuild, readPPTBuild, writePPTBuild } from "../pptBuild"
import { ContentCleaner } from "../ContentCleaner"

const attrs = (step: number | string, effect?: string) =>
	`data-ppt-step="${step}"${effect === undefined ? "" : ` data-ppt-effect="${effect}"`}`
const read = (html: string) => {
	document.body.innerHTML = html
	return readPPTBuild(document.body.firstElementChild!)
}
afterEach(() => {
	document.body.innerHTML = ""
})
describe("PPT authored builds", () => {
	it("rejects unsupported effects and unsafe numbers without hiding content", () => {
		for (const html of [
			"<p>no build</p>",
			`<p ${attrs(0)}>`,
			`<p ${attrs("1.5")}>`,
			`<p ${attrs("abc")}>`,
			`<p ${attrs(1001)}>`,
			`<p ${attrs(1, "script")}>`,
		])
			expect(read(html)).toBeNull()
		expect(read(`<p ${attrs(7, "appear")}>`)).toEqual({ step: 7, effect: "appear" })
	})
	it("defaults to fade and omits the default effect when writing", () => {
		expect(read(`<p ${attrs(2)}>`)).toEqual({ step: 2, effect: "fade" })
		const element = document.body.firstElementChild!
		writePPTBuild(element, { step: 3, effect: "fade" })
		expect(element.outerHTML).toBe('<p data-ppt-step="3"></p>')
		writePPTBuild(element, { step: 3, effect: "appear" })
		expect(element.outerHTML).toBe('<p data-ppt-step="3" data-ppt-effect="appear"></p>')
		writePPTBuild(element, null)
		expect(element.outerHTML).toBe("<p></p>")
	})
	it("validates untrusted build payloads", () => {
		expect(normalizePPTBuild({ step: 2, effect: "fade" })).toEqual({ step: 2, effect: "fade" })
		for (const value of [null, {}, { step: "2", effect: "fade" }, { step: 0, effect: "fade" }])
			expect(normalizePPTBuild(value)).toBeNull()
	})
	it("uses outermost valid HTML elements, ignoring runtime and SVG internals", () => {
		document.body.innerHTML = `<section ${attrs(3)}><p ${attrs(1)}>nested</p></section><div data-injected><p ${attrs(2)}>runtime</p></div><svg><text ${attrs(1)}>svg</text></svg><p ${attrs(3)}>same group</p>`
		expect(
			collectPPTBuilds(document).map(({ element, build }) => [element.tagName, build.step]),
		).toEqual([
			["SECTION", 3],
			["P", 3],
		])
	})
	it("preserves metadata but strips visibility and runtime styles from saved HTML", () => {
		const html = `<!doctype html><html><head><style data-injected>hidden styles</style></head><body><p ${attrs(2, "appear")} data-magic-ppt-build-hidden>All content</p></body></html>`
		const cleaned = ContentCleaner.cleanDocument(html)
		expect(cleaned).toContain('data-ppt-step="2"')
		expect(cleaned).toContain('data-ppt-effect="appear"')
		expect(cleaned).toContain("All content")
		expect(cleaned).not.toContain("data-magic-ppt-build-hidden")
		expect(cleaned).not.toContain("hidden styles")
	})
})
