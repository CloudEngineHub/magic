import { describe, expect, it, vi } from "vitest"
import {
	findMobileRecordingTextNodeMatches,
	isExcludedMobileRecordingSearchNode,
	normalizeMobileRecordingSearchQuery,
	scrollMobileRecordingSearchRangeIntoView,
} from "../content-search"

describe("mobile recording content search", () => {
	it("trims boundary whitespace while preserving internal whitespace", () => {
		expect(normalizeMobileRecordingSearchQuery("  weekly  standup  ")).toBe("weekly  standup")
	})

	it("finds literal case-insensitive matches without overlapping hits", () => {
		const node = document.createTextNode("Topic topic TOPIC aaaa")

		expect(findMobileRecordingTextNodeMatches(node, "topic")).toEqual([
			{ start: 0, end: 5 },
			{ start: 6, end: 11 },
			{ start: 12, end: 17 },
		])
		expect(findMobileRecordingTextNodeMatches(document.createTextNode("aaaa"), "aa")).toEqual([
			{ start: 0, end: 2 },
			{ start: 2, end: 4 },
		])
	})

	it("excludes text rendered inside controls and explicit exclusion regions", () => {
		const wrapper = document.createElement("div")
		wrapper.innerHTML = `
			<p data-search-exclude="true">Hidden label</p>
			<button type="button" data-search-exclude="true">Action label</button>
			<p>Visible paragraph</p>
		`

		expect(isExcludedMobileRecordingSearchNode(wrapper.children[0].firstChild as Text)).toBe(
			true,
		)
		expect(isExcludedMobileRecordingSearchNode(wrapper.children[1].firstChild as Text)).toBe(
			true,
		)
		expect(isExcludedMobileRecordingSearchNode(wrapper.children[2].firstChild as Text)).toBe(
			false,
		)
	})

	it("scrolls only the recording content port when centering a search match", () => {
		const scrollPort = document.createElement("div")
		const scope = document.createElement("div")
		const paragraph = document.createElement("p")
		const textNode = document.createTextNode("Mock searchable content")
		paragraph.append(textNode)
		scope.append(paragraph)
		scrollPort.append(scope)

		Object.defineProperties(scrollPort, {
			clientHeight: { configurable: true, value: 200 },
			scrollHeight: { configurable: true, value: 1000 },
			scrollTop: { configurable: true, writable: true, value: 120 },
		})
		const scrollTo = vi.fn()
		Object.defineProperty(scrollPort, "scrollTo", { configurable: true, value: scrollTo })
		scrollPort.getBoundingClientRect = vi.fn(() => ({ top: 100, height: 200 }) as DOMRect)

		const range = document.createRange()
		range.setStart(textNode, 0)
		range.setEnd(textNode, 4)
		range.getBoundingClientRect = vi.fn(() => ({ top: 430, width: 32, height: 20 }) as DOMRect)

		scrollMobileRecordingSearchRangeIntoView(range, scope, "auto")

		expect(scrollTo).toHaveBeenCalledWith({ top: 360, behavior: "auto" })
	})
})
