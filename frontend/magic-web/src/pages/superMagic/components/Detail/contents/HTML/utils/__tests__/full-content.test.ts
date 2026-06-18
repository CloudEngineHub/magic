import { describe, expect, it, vi } from "vitest"

vi.mock("../nested-iframe-content", () => ({
	getNestedIframeInterceptorScript: () => "",
}))

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

	it("places magic-api prelude before environment prelude and original head scripts", async () => {
		const { getFullContent } = await import("../full-content")
		const result = getFullContent(
			"<!DOCTYPE html><html><head><script>window.__USER_HEAD_SCRIPT__ = true</script></head><body><div>Preview</div></body></html>",
		)

		const magicIndex = result.indexOf('data-injected="magic-api"')
		const envIndex = result.indexOf("window.__MAGIC_INITIAL_LANG__")
		const userIndex = result.indexOf("window.__USER_HEAD_SCRIPT__")

		expect(magicIndex).toBeGreaterThanOrEqual(0)
		expect(envIndex).toBeGreaterThan(magicIndex)
		expect(userIndex).toBeGreaterThan(envIndex)
	})
})
