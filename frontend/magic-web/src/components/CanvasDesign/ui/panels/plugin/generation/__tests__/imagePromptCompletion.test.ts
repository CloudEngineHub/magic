import { describe, expect, it, vi } from "vitest"

import { completePluginImagePrompt } from "../imagePromptCompletion"

function createCanvas() {
	return {
		magicConfigManager: {
			config: {
				methods: {
					completeImagePrompt: vi.fn().mockResolvedValue({
						prompt: "浅色无缝背景纸延展成柔和摄影棚空间",
					}),
				},
			},
		},
	}
}

describe("imagePromptCompletion", () => {
	it("delegates prompt completion to canvas methods", async () => {
		const canvas = createCanvas()

		const result = await completePluginImagePrompt(canvas as never, {
			user_prompt: "请生成适合商品图分别套用的背景提示词",
			reference_images: ["./product-a.png"],
		})

		expect(canvas.magicConfigManager.config.methods.completeImagePrompt).toHaveBeenCalledWith({
			user_prompt: "请生成适合商品图分别套用的背景提示词",
			reference_images: ["./product-a.png"],
		})
		expect(result).toEqual({
			prompt: "浅色无缝背景纸延展成柔和摄影棚空间",
		})
	})

	it("throws when prompt completion method is unavailable", async () => {
		const canvas = {
			magicConfigManager: {
				config: {
					methods: {},
				},
			},
		}

		await expect(
			completePluginImagePrompt(canvas as never, {
				user_prompt: "生成背景提示词",
			}),
		).rejects.toThrow("completeImagePrompt method not available.")
	})
})
