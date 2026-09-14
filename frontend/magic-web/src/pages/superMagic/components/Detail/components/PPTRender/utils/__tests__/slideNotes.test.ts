import { describe, expect, it } from "vitest"
import { extractSlideNotes, stripSlideNotes, upsertSlideNotes } from "../slideNotes"

describe("slide notes html contract", () => {
	it("reads escaped plain text from the inert template", () => {
		const html =
			"<main>Slide</main><template data-magic-slide-notes>Line 1 &amp; &lt;Line 2&gt;</template>"

		expect(extractSlideNotes(html)).toBe("Line 1 & <Line 2>")
	})

	it("inserts notes before the body closing tag without changing slide markup", () => {
		const html = "<html><body><main>Slide</main></body></html>"
		const result = upsertSlideNotes(html, "Talk about <this> & that")

		expect(result).toContain("<main>Slide</main>")
		expect(result).toContain("Talk about &lt;this&gt; &amp; that")
		expect(extractSlideNotes(result)).toBe("Talk about <this> & that")
	})

	it("updates only the canonical notes block", () => {
		const html =
			'<main data-value="keep">Slide</main><template data-magic-slide-notes>Old</template>'

		expect(upsertSlideNotes(html, "New")).toBe(
			'<main data-value="keep">Slide</main><template data-magic-slide-notes data-format="plain-text" data-version="1">\nNew\n</template>',
		)
	})

	it("returns an empty string when a page has no notes", () => {
		expect(extractSlideNotes("<main>Slide</main>")).toBe("")
	})

	it("removes only the inert notes block when comparing visual HTML", () => {
		const visualHtml = '<main data-value="keep">Slide</main>'
		const withNotes = `${visualHtml}<template data-magic-slide-notes>Talk track</template>`

		expect(stripSlideNotes(withNotes)).toBe(visualHtml)
	})

	it("normalizes duplicate notes blocks to one canonical block", () => {
		const html =
			"<main>Slide</main><template data-magic-slide-notes>Old 1</template><template data-magic-slide-notes>Old 2</template>"

		expect(upsertSlideNotes(html, "New")).toBe(
			'<main>Slide</main><template data-magic-slide-notes data-format="plain-text" data-version="1">\nNew\n</template>',
		)
	})
})
