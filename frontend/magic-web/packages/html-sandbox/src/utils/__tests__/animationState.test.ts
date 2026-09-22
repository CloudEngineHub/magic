import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { afterEach, describe, expect, it } from "vitest"

// Execute the shell's actual handler; the shell is deployed independently of the editor bundle.
const shell = readFileSync(resolve(__dirname, "../../../index.html"), "utf8")
const handler = shell.slice(
	shell.indexOf("function applyAnimationState()"),
	shell.indexOf("function setupClickListener()"),
)
const applyAnimationState = new Function(
	"isAnimationPaused",
	`${handler}; applyAnimationState();`,
) as (paused: boolean) => void

afterEach(() => {
	document.head.innerHTML = ""
	document.body.innerHTML = ""
})

describe("PPT animation visibility state", () => {
	it("pauses animation timelines without cancelling animation definitions", () => {
		applyAnimationState(true)
		const style = document.querySelector<HTMLStyleElement>("#magic-animation-pause")!
		const rules = Array.from(style.sheet!.cssRules) as CSSStyleRule[]
		expect(rules.map((rule) => rule.selectorText).join(",")).toContain("*::before")
		expect(rules.map((rule) => rule.selectorText).join(",")).toContain("*::after")
		for (const rule of rules) {
			expect(rule.style.getPropertyValue("animation-play-state")).toBe("paused")
			expect(rule.style.getPropertyPriority("animation-play-state")).toBe("important")
			expect(rule.style.getPropertyValue("animation")).toBe("")
		}
	})

	it("removes only the pause override on resume and leaves author styles intact", () => {
		document.head.innerHTML =
			'<style id="author">.title { animation-play-state: paused }</style>'
		document.body.innerHTML =
			'<div class="title" style="animation: entrance 1s both">Title</div>'
		const originalHead = document.head.innerHTML
		const originalBody = document.body.innerHTML
		applyAnimationState(true)
		applyAnimationState(true)
		expect(document.querySelectorAll("#magic-animation-pause")).toHaveLength(1)
		applyAnimationState(false)
		applyAnimationState(false)
		expect(document.head.innerHTML).toBe(originalHead)
		expect(document.body.innerHTML).toBe(originalBody)
	})
})
