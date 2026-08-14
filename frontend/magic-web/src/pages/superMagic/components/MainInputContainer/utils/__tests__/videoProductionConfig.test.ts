import { describe, expect, it } from "vitest"
import { getPromptRichTextPlainText } from "../../panels/promptRichText"
import { buildVideoProductionPresetContent } from "../videoProductionConfig"

describe("videoProductionConfig", () => {
	it("builds a prompt suffix from the visible video settings", () => {
		const content = buildVideoProductionPresetContent({
			generationMode: "普通",
			aspectRatio: "9:16",
			durationSeconds: 15,
			resolution: "1080p",
			showAspectRatio: true,
			showDuration: true,
			showResolution: true,
			labels: {
				generation: "生成模式",
				aspectRatio: "画幅",
				duration: "时长",
				resolution: "清晰度",
			},
		})

		expect(getPromptRichTextPlainText(content)).toBe(
			"生成模式: 普通; 画幅: 9:16; 时长: 15s; 清晰度: 1080p.",
		)
	})

	it("omits capability fields that are hidden for the current model", () => {
		const content = buildVideoProductionPresetContent({
			generationMode: "detailed",
			aspectRatio: "9:16",
			durationSeconds: 15,
			resolution: "1080p",
			showAspectRatio: false,
			showDuration: false,
			showResolution: false,
		})

		expect(getPromptRichTextPlainText(content)).toBe("generation: detailed.")
	})
})
