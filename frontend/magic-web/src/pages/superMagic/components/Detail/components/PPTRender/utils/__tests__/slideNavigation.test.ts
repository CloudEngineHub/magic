import { describe, expect, it } from "vitest"
import { findPPTSlideIndex } from "../slideNavigation"

const slides = [
	{ path: "slides/slide-1.html" },
	{ path: "slides/slide-2.html" },
	{ path: "slides/section/slide-3.html" },
]

describe("findPPTSlideIndex", () => {
	it("matches project-root relative paths", () => {
		expect(findPPTSlideIndex(slides, "slides/slide-1.html", "slides/slide-2.html")).toBe(1)
	})

	it("matches paths relative to the current slide folder", () => {
		expect(findPPTSlideIndex(slides, "slides/section/slide-3.html", "../slide-2.html")).toBe(1)
	})

	it("ignores query strings and hashes", () => {
		expect(
			findPPTSlideIndex(slides, "slides/slide-1.html", "slide-2.html?mode=preview#top"),
		).toBe(1)
	})

	it("returns -1 for empty or unknown paths", () => {
		expect(findPPTSlideIndex(slides, "slides/slide-1.html", "")).toBe(-1)
		expect(findPPTSlideIndex(slides, "slides/slide-1.html", "other.html")).toBe(-1)
	})
})
