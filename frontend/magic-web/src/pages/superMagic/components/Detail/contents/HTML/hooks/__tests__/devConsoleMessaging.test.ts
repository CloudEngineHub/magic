import { describe, expect, it, vi } from "vitest"

import { sendDevToolsToggle } from "../devConsoleMessaging"

describe("sendDevToolsToggle", () => {
	it("preserves the iframe parent bridge before enabling DevTools", () => {
		const postMessage = vi.fn()

		sendDevToolsToggle({ postMessage } as unknown as Window, true)

		expect(postMessage).toHaveBeenCalledTimes(2)
		expect(postMessage.mock.calls[0][0]).toMatchObject({
			type: "MAGIC_DEVTOOLS_EVAL",
			code: expect.stringContaining('Object.getOwnPropertyDescriptor(window, "parent")'),
		})
		expect(postMessage.mock.calls[1][0]).toMatchObject({
			type: "MAGIC_DEVTOOLS_TOGGLE",
			enabled: true,
		})
	})

	it("restores the iframe parent bridge after disabling DevTools", () => {
		const postMessage = vi.fn()

		sendDevToolsToggle({ postMessage } as unknown as Window, false)

		expect(postMessage).toHaveBeenCalledTimes(2)
		expect(postMessage.mock.calls[0][0]).toMatchObject({
			type: "MAGIC_DEVTOOLS_TOGGLE",
			enabled: false,
		})
		expect(postMessage.mock.calls[1][0]).toMatchObject({
			type: "MAGIC_DEVTOOLS_EVAL",
			code: expect.stringContaining('Object.defineProperty(window, "parent", descriptor)'),
		})
	})
})
