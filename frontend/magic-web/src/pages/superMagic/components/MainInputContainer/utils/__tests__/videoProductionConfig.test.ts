import { describe, expect, it } from "vitest"
import { buildVideoProductionPresetContent } from "../videoProductionConfig"

describe("videoProductionConfig", () => {
	it("builds a natural-language message suffix from stable config values", () => {
		const payload = buildVideoProductionPresetContent({
			generationMode: "normal",
			aspectRatio: "16:9",
			durationSeconds: 5,
			resolution: "768p",
			showAspectRatio: true,
			showDuration: true,
			showResolution: true,
			labels: {
				generation: "生成方式",
				aspectRatio: "画幅",
				duration: "时长",
				resolution: "清晰度",
			},
		})

		expect(payload).toEqual({
			type: "doc",
			content: [
				{
					type: "paragraph",
					content: [
						{
							type: "text",
							text: "生成方式: normal; 画幅: 16:9; 时长: 5s; 清晰度: 768p.",
						},
					],
				},
			],
		})
	})
})
