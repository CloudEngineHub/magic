import { beforeEach, describe, expect, it, vi } from "vitest"
import { resolveVideoEditElementLayout } from "../VideoEditElement.layout"

beforeEach(() => {
	vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
		font: "",
		measureText: vi.fn((text: string) => ({ width: text.length * 8 })),
	} as unknown as CanvasRenderingContext2D)
})

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
		const layout = resolveVideoEditElementLayout(1920, 1080)

		expect(layout.mode).toBe("regular")
		expect(layout.videoSection.y).toBe(0)
		expect(layout.audioSection.y).toBe(layout.videoSection.height)
		expect(layout.footer.y).toBe(layout.audioSection.y + layout.audioSection.height)
		expect(layout.footer.y + layout.footer.height).toBeCloseTo(1080)
		expect(layout.videoCard.width).toBeCloseTo(450)
		expect(layout.audioPlayButton.x).toBeLessThan(layout.audioProgress.x)
		expect(layout.audioProgress.x + layout.audioProgress.width).toBeLessThan(layout.audioInfo.x)
		const progressGapLeft =
			layout.audioProgress.x - (layout.audioPlayButton.x + layout.audioPlayButton.width)
		const progressGapRight =
			layout.audioInfo.x - (layout.audioProgress.x + layout.audioProgress.width)
		expect(progressGapLeft).toBeCloseTo(progressGapRight)
		expect(progressGapLeft).toBeGreaterThan(0)
		// 三区上下 padding 与标题列对齐，形成统一节奏。
		expect(layout.videoTitle.y).toBeCloseTo(24)
		expect(layout.audioTitle.y - layout.audioSection.y).toBeCloseTo(24)
		expect(layout.videoTitle.x).toBeCloseTo(layout.audioTitle.x)
		expect(layout.videoTitle.width).toBeCloseTo(layout.audioTitle.width)
		expect(layout.videoViewport.y - (layout.videoTitle.y + layout.videoTitle.height)).toBeCloseTo(
			24,
		)
		expect(
			layout.audioPlaceholder.y - (layout.audioTitle.y + layout.audioTitle.height),
		).toBeCloseTo(24)
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
		expect(layout.videoCard.width).toBeCloseTo(450)
		expect(layout.videoCard.height).toBeCloseTo(450)
		expect(layout.videoCard.width).toBeCloseTo(layout.videoCard.height)
		expect(layout.videoCardViewport.height).toBeCloseTo(layout.videoCard.height)
		// 区块标题、右侧次要信息与卡片信息统一使用 caption。
		const headingHeight = Math.max(28 * 1.35, 24)
		expect(layout.videoTitle.height).toBeCloseTo(headingHeight)
		expect(layout.videoSection.height).toBeCloseTo(24 + headingHeight + 24 + 450 + 24)
		expect(layout.fonts.title).toBeCloseTo(28)
		expect(layout.fonts.count).toBeCloseTo(28)
		expect(layout.fonts.cardName).toBeCloseTo(28)
		expect(layout.fonts.cardDuration).toBeCloseTo(28)
		expect(layout.fonts.audioName).toBeCloseTo(28)
		expect(layout.footerParameterRows.aspectRatio.fontSize).toBeCloseTo(
			layout.footerParameterRows.aspectRatio.labelFontSize,
		)
		expect(layout.footer.height).toBeCloseTo(32 * 2 + 92)
		expect(layout.audioSection.height).toBeCloseTo(
			1080 - layout.videoSection.height - layout.footer.height,
		)
		expect(layout.footer.height).toBeLessThan(layout.audioSection.height)
		expect(layout.mergeButton.height).toBeCloseTo(92)
		expect(layout.mergeButtonFontSize).toBeCloseTo(28)
		expect(layout.videoCard.gripSize).toBeCloseTo(48)
	})

	it("sizes the shared section title column from the longest title text", () => {
		const fallback = resolveVideoEditElementLayout(1920, 1080)
		const short = resolveVideoEditElementLayout(1920, 1080, {
			sectionTitles: ["视频", "音频"],
		})
		const long = resolveVideoEditElementLayout(1920, 1080, {
			sectionTitles: ["使用视频", "使用音频"],
		})
		const wider = resolveVideoEditElementLayout(1920, 1080, {
			sectionTitles: ["使用视频素材列表", "使用音频"],
		})

		expect(long.videoTitle.width).toBe(long.audioTitle.width)
		expect(long.videoTitle.width).toBeCloseTo("使用视频".length * 8 + 24)
		expect(long.videoCount.x).toBeCloseTo(long.videoTitle.x + long.videoTitle.width)
		expect(long.audioCount.x).toBeCloseTo(long.audioTitle.x + long.audioTitle.width)
		// 有文案时按内容测宽，不再固定回退 200。
		expect(long.videoTitle.width).not.toBeCloseTo(fallback.videoTitle.width)
		expect(wider.videoTitle.width).toBeGreaterThan(long.videoTitle.width)
		expect(long.videoTitle.width).toBeGreaterThan(short.videoTitle.width)
		expect(long.videoTitle.width).toBeLessThanOrEqual(long.videoSection.width * 0.55 + 0.001)
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
