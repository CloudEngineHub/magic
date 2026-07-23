import { describe, expect, it, vi } from "vitest"

vi.mock("../nested-iframe-content", () => ({
	getNestedIframeInterceptorScript: () => "",
}))

vi.mock("virtual:magic-api", () => ({ default: "" }))

vi.mock("@/models/config", () => ({
	configStore: {
		cluster: {
			clusterCode: "",
		},
		i18n: {
			language: "zh_CN",
		},
	},
}))

describe("getFullContent", () => {
	it("injects hidden scrollbar styles without disabling vertical scrolling", async () => {
		const { getFullContent } = await import("../full-content")
		const result = getFullContent(
			"<!DOCTYPE html><html><body><div>Preview</div></body></html>",
			"",
			{
				hideVerticalScroll: true,
			},
		)

		expect(result).toContain("overflow-y: auto !important;")
		expect(result).toContain("scrollbar-width: none;")
	})

	it("does not inject vertical overflow hidden styles by default", async () => {
		const { getFullContent } = await import("../full-content")
		const result = getFullContent("<!DOCTYPE html><html><body><div>Preview</div></body></html>")

		expect(result).not.toContain("overflow-y: auto !important;")
	})

	it("injects iframe content metrics only for document-flow fullscreen", async () => {
		const { getFullContent } = await import("../full-content")
		const result = getFullContent(
			"<!DOCTYPE html><html><body><div>Preview</div></body></html>",
			"",
			{ reportContentMetrics: true },
		)

		expect(result).toContain("__MAGIC_DOCUMENT_FLOW_METRICS__")
		expect(result).toContain('type: "contentMetrics"')
	})

	it("skips serviceWorker mock script when disabled", async () => {
		const { getFullContent } = await import("../full-content")
		const result = getFullContent(
			"<!DOCTYPE html><html><body><div>Preview</div></body></html>",
			"",
			{
				serviceWorkerMockMode: "off",
			},
		)

		expect(result).not.toContain("setupServiceWorkerMock")
	})

	it("injects serviceWorker mock script when force enabled", async () => {
		const { getFullContent } = await import("../full-content")
		const result = getFullContent(
			"<!DOCTYPE html><html><body><div>Preview</div></body></html>",
			"",
			{
				serviceWorkerMockMode: "on",
			},
		)

		expect(result).toContain("setupServiceWorkerMock")
		expect(result).toContain("serviceWorkerMockMode")
	})

	it("places environment prelude before magic-api prelude and original head scripts", async () => {
		const { getFullContent } = await import("../full-content")
		const result = getFullContent(
			"<!DOCTYPE html><html><head><script>window.__USER_HEAD_SCRIPT__ = true</script></head><body><div>Preview</div></body></html>",
		)

		const magicIndex = result.indexOf('data-injected="magic-api"')
		const envIndex = result.indexOf("window.__MAGIC_INITIAL_LANG__")
		const userIndex = result.indexOf("window.__USER_HEAD_SCRIPT__")

		expect(magicIndex).toBeGreaterThanOrEqual(0)
		expect(envIndex).toBeGreaterThanOrEqual(0)
		expect(magicIndex).toBeGreaterThan(envIndex)
		expect(userIndex).toBeGreaterThan(magicIndex)
	})

	it("injects virtual storage snapshot before original head scripts", async () => {
		const { getFullContent } = await import("../full-content")
		const result = getFullContent(
			"<!DOCTYPE html><html><head><script>window.__USER_HEAD_SCRIPT__ = localStorage.getItem('theme')</script></head><body><div>Preview</div></body></html>",
			"",
			{
				virtualStorage: {
					protocol: "magic-html-virtual-storage/v1",
					renderId: "render-1",
					token: "token-1",
					namespace: "namespace-1",
					targetOrigin: "https://app.example.test",
					snapshot: {
						localStorage: { theme: "dark" },
						sessionStorage: { step: "2" },
						cookies: { locale: "zh_CN" },
						indexedDB: {},
					},
				},
			},
		)

		const storageIndex = result.indexOf("setupMagicVirtualStorage")
		const userIndex = result.indexOf("window.__USER_HEAD_SCRIPT__")

		expect(storageIndex).toBeGreaterThanOrEqual(0)
		expect(storageIndex).toBeLessThan(userIndex)
		expect(result).toContain('"namespace":"namespace-1"')
		expect(result).toContain('"theme":"dark"')
		expect(result).not.toContain("MAGIC:iframe:storage:")
	})
})
