import { afterEach, describe, expect, it, vi } from "vitest"
import { ElementInspectorHandler } from "../features/ElementInspectorHandler"
import "../index"

describe("iframe runtime message boundary", () => {
	afterEach(() => {
		vi.restoreAllMocks()
	})

	it("ignores inspector commands from a non-parent window", () => {
		const activate = vi.spyOn(ElementInspectorHandler.prototype, "activate")
		const iframe = document.createElement("iframe")
		document.body.appendChild(iframe)

		try {
			window.dispatchEvent(
				new MessageEvent("message", {
					source: iframe.contentWindow,
					origin: "https://attacker.example",
					data: { type: "MAGIC_INSPECTOR_START" },
				}),
			)

			expect(activate).not.toHaveBeenCalled()
		} finally {
			iframe.remove()
		}
	})

	it("accepts inspector commands from the parent window", () => {
		const activate = vi.spyOn(ElementInspectorHandler.prototype, "activate")

		window.dispatchEvent(
			new MessageEvent("message", {
				source: window,
				origin: window.location.origin,
				data: { type: "MAGIC_INSPECTOR_START" },
			}),
		)

		expect(activate).toHaveBeenCalledOnce()

		window.dispatchEvent(
			new MessageEvent("message", {
				source: window,
				origin: window.location.origin,
				data: { type: "MAGIC_INSPECTOR_STOP" },
			}),
		)
	})
})
