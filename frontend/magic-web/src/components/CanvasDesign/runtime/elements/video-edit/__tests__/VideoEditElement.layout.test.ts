import { describe, expect, it } from "vitest"
import { resolveVideoEditElementLayout } from "../VideoEditElement.layout"

function expectRectInside(
	rect: { x: number; y: number; width: number; height: number },
	bounds: { x: number; y: number; width: number; height: number },
): void {
	expect(rect.x).toBeGreaterThanOrEqual(bounds.x)
	expect(rect.y).toBeGreaterThanOrEqual(bounds.y)
	expect(rect.x + rect.width).toBeLessThanOrEqual(bounds.x + bounds.width + 0.001)
	expect(rect.y + rect.height).toBeLessThanOrEqual(bounds.y + bounds.height + 0.001)
}

describe("VideoEditElement layout", () => {
	it("allocates video, single-audio and footer sections at the audio element size", () => {
		const layout = resolveVideoEditElementLayout(1280, 720)

		expect(layout.mode).toBe("regular")
		expect(layout.videoSection.y).toBe(0)
		expect(layout.audioSection.y).toBe(layout.videoSection.height)
		expect(layout.footer.y).toBe(layout.audioSection.y + layout.audioSection.height)
		expect(layout.footer.y + layout.footer.height).toBeCloseTo(720)
		expect(layout.videoCard.width).toBeCloseTo(176)
		expect(layout.audioPlayButton.x).toBeLessThan(layout.audioWaveform.x)
		expect(layout.audioWaveform.x + layout.audioWaveform.width).toBeLessThan(layout.audioInfo.x)
	})

	it("keeps all primary regions inside a condensed legacy size", () => {
		const layout = resolveVideoEditElementLayout(420, 280)

		expect(layout.mode).toBe("condensed")
		for (const rect of [
			layout.videoSection,
			layout.videoCardViewport,
			layout.videoScrollbar,
			layout.audioSection,
			layout.audioRow,
			layout.audioPlayButton,
			layout.audioWaveform,
			layout.audioInfo,
			layout.footer,
			layout.footerOutput,
			layout.mergeButton,
		]) {
			expectRectInside(rect, layout.bounds)
		}
		for (const rect of [
			layout.footerParameterRows.aspectRatio.rect,
			layout.footerParameterRows.resolution.rect,
			layout.footerParameterRows.format.rect,
		]) {
			expectRectInside(rect, layout.footerOutput)
		}
		expect(layout.footerParameterRows.aspectRatio.rect.width).toBeCloseTo(
			layout.footerParameterRows.resolution.rect.width,
		)
		expect(layout.footerParameterRows.resolution.rect.width).toBeCloseTo(
			layout.footerParameterRows.format.rect.width,
		)
		expect(layout.footerParameterRows.aspectRatio.rect.height).toBeCloseTo(
			layout.mergeButton.height,
		)
		expect(layout.videoCard.height).toBeLessThanOrEqual(layout.videoCardViewport.height)
		expect(layout.footerOutput.x).toBeLessThan(layout.mergeButton.x)
		expect(layout.mergeButton.y).toBeGreaterThanOrEqual(layout.footerOutput.y)
		expect(layout.mergeButton.y + layout.mergeButton.height).toBeLessThanOrEqual(
			layout.footerOutput.y + layout.footerOutput.height,
		)
	})
})
