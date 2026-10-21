import { describe, expect, it } from "vitest"
import { stripPPTBuildMetadata } from "../pptBuildSource"

describe("stripPPTBuildMetadata", () => {
	it("removes quoted and bare build attributes only", () => {
		const html = `<div class="a" data-magic-ppt-build='{"version":1,"step":1,"effect":"fade"}'>x</div><p data-magic-ppt-build="{&quot;step&quot;:2}" id="b">y</p><i data-magic-ppt-build>z</i>`
		expect(stripPPTBuildMetadata(html)).toBe(`<div class="a">x</div><p id="b">y</p><i>z</i>`)
	})

	it("leaves unrelated markup untouched", () => {
		const html = `<div data-other="1">x</div>`
		expect(stripPPTBuildMetadata(html)).toBe(html)
	})
})
