import { afterEach, describe, expect, it, vi } from "vitest"

import { MessageProxy } from "../MessageProxy"

const nativeParentDescriptor = Object.getOwnPropertyDescriptor(window, "parent")

afterEach(() => {
	if (nativeParentDescriptor) {
		Object.defineProperty(window, "parent", nativeParentDescriptor)
	} else {
		Reflect.deleteProperty(window, "parent")
	}
})

describe("MessageProxy", () => {
	it("restores the existing parent bridge after DevTools is disabled", () => {
		const hostPostMessage = vi.fn()
		const hostParent = { postMessage: hostPostMessage }
		Object.defineProperty(window, "parent", {
			configurable: true,
			get: () => hostParent,
		})

		const proxy = new MessageProxy()
		proxy.enable()
		proxy.disable()

		window.parent.postMessage({ type: "MAGIC_INSPECTOR_START" }, "*")

		expect(hostPostMessage).toHaveBeenCalledWith({ type: "MAGIC_INSPECTOR_START" }, "*")
	})
})
