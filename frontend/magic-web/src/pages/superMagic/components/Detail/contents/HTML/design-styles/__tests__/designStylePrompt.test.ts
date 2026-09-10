import i18next from "i18next"
import { beforeAll, beforeEach, describe, expect, it } from "vitest"
import { MentionItemType } from "@/components/business/MentionPanel/types"
import enSuper from "@/assets/locales/en_US/super.json"
import zhSuper from "@/assets/locales/zh_CN/super.json"
import { buildDesignStylePromptContent } from "../designStylePrompt"
import { designStyleFixture } from "./fixtures"

describe("buildDesignStylePromptContent", () => {
	beforeAll(async () => {
		await i18next.init({
			lng: "en_US",
			fallbackLng: "en_US",
			ns: ["super"],
			defaultNS: "super",
			resources: {
				en_US: { super: enSuper },
				zh_CN: { super: zhSuper },
			},
		})
	})

	beforeEach(async () => {
		await i18next.changeLanguage("en_US")
	})

	it("includes the current HTML file mention and style code", () => {
		const style = designStyleFixture
		const result = buildDesignStylePromptContent(
			{
				fileId: "file-1",
				fileName: "index.html",
				filePath: "pages/index.html",
			},
			style,
		)
		const paragraphs = result.content ?? []
		const mention = paragraphs[0]?.content?.find((node) => node.type === "mention")

		expect(mention?.attrs).toMatchObject({
			type: MentionItemType.PROJECT_FILE,
			data: {
				file_id: "file-1",
				file_name: "index.html",
				file_path: "pages/index.html",
				file_extension: "html",
			},
		})
		expect(JSON.stringify(result)).toContain(`style_code: ${style.code}`)
		expect(paragraphs).toHaveLength(2)
		expect(JSON.stringify(result)).not.toContain("Preserve the current content")
	})

	it.each([
		{
			language: "en_US",
			filePrompt: "Restyle this HTML file: ",
			stylePrompt: 'Target style: "Fixture Style" (style_code: fixture-style).',
		},
		{
			language: "zh_CN",
			filePrompt: "请更换这个 HTML 文件的风格：",
			stylePrompt: "目标风格：「Fixture Style」（style_code: fixture-style）。",
		},
	])("uses the $language prompt", async ({ language, filePrompt, stylePrompt }) => {
		await i18next.changeLanguage(language)
		const result = buildDesignStylePromptContent(
			{ fileId: "file-1", fileName: "index.html", filePath: "pages/index.html" },
			designStyleFixture,
		)

		expect(result.content?.[0]?.content?.[0]?.text).toBe(filePrompt)
		expect(result.content?.[1]?.content?.[0]?.text).toBe(stylePrompt)
	})

	it("rejects an incomplete file context", () => {
		expect(() =>
			buildDesignStylePromptContent(
				{ fileId: "", fileName: "index.html", filePath: "pages/index.html" },
				designStyleFixture,
			),
		).toThrow("HTML file context is incomplete")
	})
})
