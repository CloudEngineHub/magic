import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/pages/superMagic/utils/api", () => ({
	getTemporaryDownloadUrl: vi.fn(),
}))

vi.mock("@/utils/env", () => ({
	env: vi.fn(),
}))

vi.mock("@/utils/packageAsset", () => ({
	getPackageAssetUrl: () => "https://cdn.example.test",
}))

vi.mock("../index", () => ({
	rewriteHtmlCdnWithHost: (content: string) =>
		new DOMParser().parseFromString(content, "text/html"),
}))

import { generateFetchInterceptorScript } from "../fetchInterceptor"

describe("generateFetchInterceptorScript", () => {
	let originalFetch: typeof window.fetch
	let originalXhrOpen: typeof XMLHttpRequest.prototype.open
	let originalXhrSend: typeof XMLHttpRequest.prototype.send

	beforeEach(() => {
		originalFetch = window.fetch
		originalXhrOpen = XMLHttpRequest.prototype.open
		originalXhrSend = XMLHttpRequest.prototype.send
	})

	afterEach(() => {
		window.fetch = originalFetch
		XMLHttpRequest.prototype.open = originalXhrOpen
		XMLHttpRequest.prototype.send = originalXhrSend
		vi.restoreAllMocks()
	})

	it("preserves a Request input when forwarding an external PUT request", async () => {
		const fetchSpy = vi.fn(async () => new Response(null, { status: 204 }))
		window.fetch = fetchSpy as typeof window.fetch

		window.eval(generateFetchInterceptorScript())

		const request = new Request("https://api.example.test/items/1", {
			method: "PUT",
			headers: {
				Authorization: "Bearer token",
				"Content-Type": "application/json",
			},
			body: JSON.stringify({ name: "updated" }),
		})

		await window.fetch(request)

		expect(fetchSpy).toHaveBeenCalledOnce()
		const [forwardedInput, forwardedInit] = fetchSpy.mock.calls[0]
		expect(forwardedInput).toBe(request)
		expect(forwardedInit).toBeUndefined()
		expect((forwardedInput as Request).method).toBe("PUT")
		expect((forwardedInput as Request).headers.get("Authorization")).toBe("Bearer token")
		expect(await (forwardedInput as Request).clone().text()).toBe(
			JSON.stringify({ name: "updated" }),
		)
	})

	it("preserves PUT init when resolving a relative URL", async () => {
		const fetchSpy = vi.fn(async () => new Response(null, { status: 204 }))
		window.fetch = fetchSpy as typeof window.fetch
		vi.spyOn(window, "postMessage").mockImplementation((message) => {
			if (message.type !== "MAGIC_FETCH_URL_REQUEST") return
			window.dispatchEvent(
				new MessageEvent("message", {
					data: {
						type: "MAGIC_FETCH_URL_RESPONSE",
						requestId: message.requestId,
						success: true,
						url: "https://download.example.test/items/1",
					},
				}),
			)
		})

		window.eval(generateFetchInterceptorScript())

		const init: RequestInit = {
			method: "PUT",
			headers: { Authorization: "Bearer token" },
			body: JSON.stringify({ name: "updated" }),
		}
		await window.fetch("./items/1", init)

		expect(fetchSpy).toHaveBeenCalledWith("https://download.example.test/items/1", init)
	})
})
