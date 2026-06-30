import { beforeEach, describe, expect, it, vi } from "vitest"
import { downloadFileWithAnchor } from "../handleFIle"

const openLightModalMock = vi.hoisted(() => vi.fn())

vi.mock("@/utils/clipboard-helpers", () => ({
	clipboard: {
		writeText: vi.fn(),
	},
}))

vi.mock("@/pages/superMagicMobile/utils/mobile", () => ({
	isInApp: () => false,
}))

vi.mock("@/layouts/middlewares/withThirdPartyAuth/Strategy/DingTalkStrategy", () => ({
	isDingTalk: () => false,
}))

vi.mock("@/utils/openLightModal", () => ({
	openLightModal: (...args: unknown[]) => openLightModalMock(...args),
}))

vi.mock("@/components/business/FileDownloadModal", () => ({
	default: () => null,
}))

describe("downloadFileWithAnchor", () => {
	beforeEach(() => {
		openLightModalMock.mockClear()
		vi.restoreAllMocks()
		vi.unstubAllGlobals()
		document.body.innerHTML = ""
	})

	it("uses the original cross-origin URL instead of fetching the whole file first", async () => {
		const fetchMock = vi.fn()
		let clickedAnchor: HTMLAnchorElement | undefined
		const clickSpy = vi
			.spyOn(HTMLAnchorElement.prototype, "click")
			.mockImplementation(function (this: HTMLAnchorElement) {
				clickedAnchor = this
			})

		vi.stubGlobal("fetch", fetchMock)

		await downloadFileWithAnchor("https://cdn.example.com/files/report.pdf?token=1", "report.pdf")

		expect(fetchMock).not.toHaveBeenCalled()
		expect(clickSpy).toHaveBeenCalledTimes(1)
		expect(clickedAnchor?.href).toBe("https://cdn.example.com/files/report.pdf?token=1")
		expect(clickedAnchor?.download).toBe("report.pdf")
		expect(clickedAnchor?.rel).toBe("noopener noreferrer")
	})
})
