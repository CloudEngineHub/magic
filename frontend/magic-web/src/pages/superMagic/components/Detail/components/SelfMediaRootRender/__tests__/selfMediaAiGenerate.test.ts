import { describe, expect, it, vi, beforeEach } from "vitest"
import { generateCardContent, generateTopicsWithDetails } from "../services/selfMediaAiGenerate"
import type { SelfMediaInitGlobalSettings } from "../components/SelfMediaInitPanel/types"
import type { ArticleDetail } from "../components/SelfMediaInitPanel/types"

const mockChat = vi.fn()

vi.mock("@/services/ai", () => ({
	aiLLMService: {
		chat: (...args: unknown[]) => mockChat(...args),
		stream: vi.fn(),
	},
}))

const globalSettings: SelfMediaInitGlobalSettings = {
	author: "Test",
	brandPosition: "Tools",
	targetAudience: "Creators",
	brandImages: [],
}

const baseArticle: ArticleDetail = {
	title: "Test post",
	folderName: "",
	style: "professional",
	visualPreset: "none",
	outline: [],
	cardCount: 24,
	materials: [],
	notes: "",
	platform: "rednote",
	description: "A test article",
	visualReferenceFiles: [],
}

describe("generateCardContent", () => {
	beforeEach(() => {
		mockChat.mockReset()
	})

	it("syncs cardCount to parsed outline length when model returns fewer cards", async () => {
		const eightCards = Array.from({ length: 8 }, (_, i) => `- Card ${i + 1} description`).join(
			"\n",
		)
		mockChat.mockResolvedValueOnce({ content: eightCards })

		const result = await generateCardContent({
			global: globalSettings,
			article: baseArticle,
		})

		expect(result.outline).toHaveLength(8)
		expect(result.cardCount).toBe(8)
		expect(result.outline.every((n) => n.text.length > 0)).toBe(true)
	})
})

describe("generateTopicsWithDetails", () => {
	beforeEach(() => {
		mockChat.mockReset()
	})

	it("reconciles cardCount from outline when model returns mismatched counts", async () => {
		const outlineLines = Array.from({ length: 8 }, (_, i) => `- Point ${i + 1}`).join("\n")
		mockChat.mockResolvedValueOnce({
			content: JSON.stringify([
				{
					title: "Topic A",
					description: "Desc",
					platform: "rednote",
					style: "professional",
					visualPreset: "none",
					cardCount: 24,
					outline: outlineLines,
				},
			]),
		})

		const topics = await generateTopicsWithDetails({
			global: globalSettings,
			count: 1,
		})

		expect(topics).toHaveLength(1)
		expect(topics[0].cardCount).toBe(8)
	})

	it("sets cardCount to 0 for WeChat topics", async () => {
		mockChat.mockResolvedValueOnce({
			content: JSON.stringify([
				{
					title: "WeChat post",
					description: "Desc",
					platform: "wechat-official-accounts",
					style: "professional",
					cardCount: 6,
					outline: "- Section\n  - Sub",
				},
			]),
		})

		const topics = await generateTopicsWithDetails({
			global: globalSettings,
			count: 1,
		})

		expect(topics[0].cardCount).toBe(0)
	})
})
