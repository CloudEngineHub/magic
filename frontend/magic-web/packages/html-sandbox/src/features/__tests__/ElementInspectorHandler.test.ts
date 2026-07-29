import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { ElementInspectorHandler } from "../ElementInspectorHandler"

describe("ElementInspectorHandler", () => {
	let container: HTMLDivElement
	let postMessageSpy: ReturnType<typeof vi.spyOn>

	beforeEach(() => {
		container = document.createElement("div")
		container.innerHTML = `
			<div class="art-wrap">
				<img class="art-img" src="images/first.png?token=first" alt="First" />
				<img class="art-img" src="images/target.png?token=secret" data-src="images/target-large.png?signature=hidden" data-token="private" alt="Target" style="background-image: url(images/private.png?token=secret)" />
				<img class="art-img" src="images/last.png?token=last" alt="Last" />
			</div>
		`
		document.body.appendChild(container)
		postMessageSpy = vi.spyOn(window.parent, "postMessage").mockImplementation(() => undefined)
	})

	afterEach(() => {
		postMessageSpy.mockRestore()
		container.remove()
	})

	it("reports normalized image identity and sibling context", () => {
		const handler = new ElementInspectorHandler()
		const target = container.querySelectorAll("img")[1]

		handler.activate()
		target.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }))

		const selectCall = postMessageSpy.mock.calls.find(
			([message]) => (message as { type?: string }).type === "MAGIC_INSPECTOR_SELECT",
		)
		expect(selectCall).toBeDefined()
		const info = (
			selectCall?.[0] as {
				elementInfo: {
					selector: string
					selectorMatchCount: number
					resource: string
					attributes: Record<string, string>
					domContext: {
						siblingIndex: number
						sameTagIndex: number
						sameTagSiblingCount: number
						previousSibling: string
						nextSibling: string
					}
					elementHtml: string
				}
			}
		).elementInfo

		expect(info.selector).toContain("img.art-img:nth-of-type(2)")
		expect(info.selectorMatchCount).toBe(1)
		expect(info.resource).toBe("images/target.png")
		expect(info.attributes).toMatchObject({
			src: "images/target.png",
			"data-src": "images/target-large.png",
			alt: "Target",
		})
		expect(info.attributes).not.toHaveProperty("data-token")
		expect(info.domContext).toMatchObject({
			siblingIndex: 2,
			sameTagIndex: 2,
			sameTagSiblingCount: 3,
		})
		expect(info.domContext.previousSibling).toContain("images/first.png")
		expect(info.domContext.nextSibling).toContain("images/last.png")
		expect(info.elementHtml).toContain('src="images/target.png"')
		expect(info.elementHtml).toContain('data-src="images/target-large.png"')
		expect(info.elementHtml).not.toContain("token=secret")
		expect(info.elementHtml).not.toContain("data-token")
		expect(info.elementHtml).not.toContain("style=")
	})
})
