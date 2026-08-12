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
		expect(layout.videoCard.width).toBeCloseTo(300)
		expect(layout.audioPlayButton.x).toBeLessThan(layout.audioProgress.x)
		expect(layout.audioProgress.x + layout.audioProgress.width).toBeLessThan(layout.audioInfo.x)
		const progressGapLeft =
			layout.audioProgress.x - (layout.audioPlayButton.x + layout.audioPlayButton.width)
		const progressGapRight =
			layout.audioInfo.x - (layout.audioProgress.x + layout.audioProgress.width)
		expect(progressGapLeft).toBeCloseTo(progressGapRight)
		expect(progressGapLeft).toBeGreaterThan(0)
		// 三区上下 padding 与标题列对齐，形成统一节奏。
		expect(layout.videoTitle.y).toBeCloseTo(16)
		expect(layout.audioTitle.y - layout.audioSection.y).toBeCloseTo(16)
		expect(layout.videoTitle.x).toBeCloseTo(layout.audioTitle.x)
		expect(layout.videoTitle.width).toBeCloseTo(layout.audioTitle.width)
		expect(layout.videoViewport.y - (layout.videoTitle.y + layout.videoTitle.height)).toBeCloseTo(
			12,
		)
		expect(
			layout.audioPlaceholder.y - (layout.audioTitle.y + layout.audioTitle.height),
		).toBeCloseTo(12)
		expect(layout.audioRow.y).toBeGreaterThanOrEqual(layout.audioPlaceholder.y - 0.001)
		expect(layout.audioRow.y + layout.audioRow.height).toBeLessThanOrEqual(
			layout.audioPlaceholder.y + layout.audioPlaceholder.height + 0.001,
		)
		// 有音频时控件行在 placeholder 内垂直居中。
		expect(layout.audioRow.y - layout.audioPlaceholder.y).toBeCloseTo(
			(layout.audioPlaceholder.height - layout.audioRow.height) / 2,
		)
		expect(layout.audioPlaceholder.height).toBeGreaterThan(layout.audioRow.height)
		// 视频 / 页脚按内容定高；音频吃剩余高度并贴底。
		expect(layout.videoCard.width).toBeCloseTo(300)
		expect(layout.videoCard.height).toBeCloseTo(300)
		expect(layout.videoCard.width).toBeCloseTo(layout.videoCard.height)
		expect(layout.videoCardViewport.height).toBeCloseTo(layout.videoCard.height)
		expect(layout.videoSection.height).toBeCloseTo(16 + 22 + 12 + 300 + 16)
		expect(layout.footer.height).toBeCloseTo(16 * 2 + 46)
		expect(layout.audioSection.height).toBeCloseTo(
			720 - layout.videoSection.height - layout.footer.height,
		)
		expect(layout.footer.height).toBeLessThan(layout.audioSection.height)
		expect(layout.mergeButton.height).toBeCloseTo(46)
	})

	it("keeps all primary regions inside a condensed legacy size", () => {
		const layout = resolveVideoEditElementLayout(420, 280)

		expect(layout.mode).toBe("condensed")
		for (const rect of [
			layout.videoSection,
			layout.videoCardViewport,
			layout.videoScrollbar,
			layout.audioSection,
			layout.audioPlaceholder,
			layout.audioRow,
			layout.audioPlayButton,
			layout.audioProgress,
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
