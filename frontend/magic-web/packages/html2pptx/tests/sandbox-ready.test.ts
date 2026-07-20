// @vitest-environment jsdom

import { afterEach, describe, expect, it } from "vitest"
import {
	HtmlRenderSandbox,
	type SandboxReadyControllerConstructor,
} from "../src/sandbox/htmlRenderSandbox"

let sandbox: HtmlRenderSandbox | null = null

afterEach(() => {
	sandbox?.destroy()
	sandbox = null
})

describe("sandbox readiness", () => {
	it("starts readiness only once when polling and DOMContentLoaded overlap", async () => {
		let readyCalls = 0
		const ReadyController = class {
			async waitForReady(): Promise<void> {
				readyCalls += 1
				await new Promise((resolve) => setTimeout(resolve, 10))
			}
			restore(): void {}
		} as SandboxReadyControllerConstructor

		sandbox = new HtmlRenderSandbox(undefined, { ReadyController })
		Object.defineProperty(sandbox.document, "readyState", {
			configurable: true,
			get: () => "complete",
		})
		sandbox.window.requestAnimationFrame = (callback: FrameRequestCallback): number =>
			window.setTimeout(() => callback(performance.now()), 0)

		const render = sandbox.render("<html><body>ready</body></html>")
		sandbox.document.dispatchEvent(new Event("DOMContentLoaded"))
		await render

		expect(readyCalls).toBe(1)
	})
})
