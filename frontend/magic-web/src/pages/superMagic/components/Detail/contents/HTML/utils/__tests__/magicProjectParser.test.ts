import { afterEach, describe, expect, it } from "vitest"
import { parseMagicProjectJsContent } from "../magicProjectParser"

describe("parseMagicProjectJsContent", () => {
	afterEach(() => {
		delete (globalThis as Record<string, unknown>).__magicProjectParserExecuted
	})

	it("extracts slides from magic.project.js content", () => {
		const result = parseMagicProjectJsContent(`
			window.magicProjectConfig = {
				type: "slide",
				slides: ["./slides/fresh-1.html", "./slides/fresh-2.html"]
			};
			window.magicProjectConfigure(window.magicProjectConfig);
		`)

		expect(result?.slides).toEqual(["./slides/fresh-1.html", "./slides/fresh-2.html"])
		expect(result?.config.type).toBe("slide")
	})

	it("does not execute arbitrary JavaScript while parsing config", () => {
		const result = parseMagicProjectJsContent(`
			window.magicProjectConfig = {
				type: "slide",
				slides: ["./slides/safe.html"]
			};
			globalThis.__magicProjectParserExecuted = true;
		`)

		expect(result?.slides).toEqual(["./slides/safe.html"])
		expect((globalThis as Record<string, unknown>).__magicProjectParserExecuted).toBeUndefined()
	})

	it("rejects non-literal values instead of evaluating them", () => {
		const result = parseMagicProjectJsContent(`
			window.magicProjectConfig = {
				type: "slide",
				slides: getSlides()
			};
		`)

		expect(result).toBeNull()
	})

	it("parses ai-card configs with multiline template literal prompts", () => {
		const result = parseMagicProjectJsContent(
			[
				"window.magicProjectConfig = {",
				'  type: "ai-card",',
				'  name: "股票入门指南（日更版）",',
				"  prompt: `你是一位专业的股票入门教育导师。",
				"",
				"【卡片结构】",
				"1. 📅 上期回顾：简要总结上一期的核心内容",
				"2. 🎯 今日主题：清晰点明今天要学习的知识点",
				"3. 🖼️ 漫画图解：保存到 latest/images/daily-comic.png`,",
				'  cards: [{ file: "latest/index.html", label: "今日课程" }],',
				'  template: "template/index.html",',
				"};",
			].join("\n"),
		)

		expect(result?.config.type).toBe("ai-card")
		expect(result?.config.prompt).toContain("股票入门教育导师")
		expect(result?.config.prompt).toContain("latest/images/daily-comic.png")
		expect(result?.config.cards).toEqual([{ file: "latest/index.html", label: "今日课程" }])
	})

	it("rejects template literal expressions instead of evaluating them", () => {
		const result = parseMagicProjectJsContent(`
			window.magicProjectConfig = {
				type: "ai-card",
				prompt: \`today is \${getDate()}\`
			};
		`)

		expect(result).toBeNull()
	})

	it("ignores fake config assignments inside comments", () => {
		const result = parseMagicProjectJsContent(`
			// window.magicProjectConfig = { type: "slide", slides: ["./slides/comment.html"] };
			window.magicProjectConfig = {
				type: "slide",
				slides: ["./slides/real.html"]
			};
		`)

		expect(result?.slides).toEqual(["./slides/real.html"])
	})
})
