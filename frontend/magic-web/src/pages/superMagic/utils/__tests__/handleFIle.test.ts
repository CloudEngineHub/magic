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
		const clickSpy = vi
			.spyOn(HTMLAnchorElement.prototype, "click")
			.mockImplementation(() => undefined)

		vi.stubGlobal("fetch", fetchMock)

		await downloadFileWithAnchor(
			"https://cdn.example.com/files/report.pdf?token=1",
			"report.pdf",
		)

		expect(fetchMock).not.toHaveBeenCalled()
		expect(clickSpy).toHaveBeenCalledTimes(1)
		const clickedAnchor = clickSpy.mock.contexts[0] as HTMLAnchorElement | undefined
		expect(clickedAnchor?.href).toBe("https://cdn.example.com/files/report.pdf?token=1")
		expect(clickedAnchor?.download).toBe("report.pdf")
		expect(clickedAnchor?.rel).toBe("noopener noreferrer")
	})

	it("keeps the download modal at the default layer when no modal options are provided", async () => {
		vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined)

		await downloadFileWithAnchor("https://cdn.example.com/files/report.pdf", "report.pdf")

		expect(openLightModalMock).toHaveBeenCalledTimes(1)
		expect(openLightModalMock.mock.calls[0][1]).toMatchObject({
			open: true,
			fileName: "report.pdf",
			downloadUrl: "https://cdn.example.com/files/report.pdf",
			modalZIndex: undefined,
		})
	})

	it("passes the optional modal z-index to the download modal", async () => {
		vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined)

		await downloadFileWithAnchor("blob:mock-qrcode-url", "share-qrcode.jpeg", undefined, {
			modalZIndex: 1300,
		})

		expect(openLightModalMock).toHaveBeenCalledTimes(1)
		expect(openLightModalMock.mock.calls[0][1]).toMatchObject({
			fileName: "share-qrcode.jpeg",
			downloadUrl: "blob:mock-qrcode-url",
			modalZIndex: 1300,
		})
	})

	it("passes the optional modal-close lifecycle callback to the download modal", async () => {
		vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined)
		const onModalClose = vi.fn()

		await downloadFileWithAnchor("blob:canvas-media", "canvas-media.zip", undefined, {
			onModalClose,
		})

		expect(openLightModalMock.mock.calls[0][1]).toMatchObject({
			onAfterClose: onModalClose,
		})
	})
})
