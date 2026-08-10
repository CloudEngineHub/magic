import { describe, expect, it } from "vitest"
import {
	findIncompleteStreamingScriptStart,
	resolveStreamingHtmlCommitContent,
} from "../streaming-html-commit"

describe("streaming html commit", () => {
	it("keeps static html streaming without deferral", () => {
		const content = "<!DOCTYPE html><html><body><main>Report</main></body></html>"

		expect(findIncompleteStreamingScriptStart(content)).toBeNull()
		expect(resolveStreamingHtmlCommitContent(content)).toBe(content)
	})

	it("defers an incomplete script opening tag", () => {
		const prefix = "<!DOCTYPE html><html><head>"
		const content = `${prefix}<script src="https://cdn.example.com/chart.js"`

		expect(findIncompleteStreamingScriptStart(content)).toBe(prefix.length)
		expect(resolveStreamingHtmlCommitContent(content)).toBe(prefix)
	})

	it("defers a partially received script tag", () => {
		const prefix = "<html><body><main>Report</main>"
		const content = `${prefix}<scr`

		expect(findIncompleteStreamingScriptStart(content)).toBe(prefix.length)
		expect(resolveStreamingHtmlCommitContent(content)).toBe(prefix)
	})

	it("keeps the last static frame while an inline script is streaming", () => {
		const prefix = "<html><body><main>Report</main>"
		const content = `${prefix}<script>const chart = createChart({ title: "East India`

		expect(resolveStreamingHtmlCommitContent(content)).toBe(prefix)
	})

	it("commits the complete script once its closing tag arrives", () => {
		const content =
			"<html><body><main>Report</main><script>window.ready = true</script></body></html>"

		expect(resolveStreamingHtmlCommitContent(content)).toBe(content)
	})

	it("recognizes a closing script tag after a legacy html comment in script text", () => {
		const content =
			"<html><body><script><!-- legacy comment\nwindow.ready = true</script></body></html>"

		expect(findIncompleteStreamingScriptStart(content)).toBeNull()
		expect(resolveStreamingHtmlCommitContent(content)).toBe(content)
	})

	it("preserves complete scripts before a later incomplete script", () => {
		const safePrefix =
			'<html><head><script src="https://cdn.example.com/chart.js"></script></head><body><main>Report</main>'
		const content = `${safePrefix}<SCRIPT>renderChart(`

		expect(resolveStreamingHtmlCommitContent(content)).toBe(safePrefix)
	})

	it("ignores script-like text inside html comments and tag names", () => {
		const content =
			"<!-- <script>disabled example --><script-template>Example</script-template>"

		expect(findIncompleteStreamingScriptStart(content)).toBeNull()
		expect(resolveStreamingHtmlCommitContent(content)).toBe(content)
	})
})
