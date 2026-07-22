import { describe, expect, it } from "vitest"
import {
	buildPromptOptimizationUserPrompt,
	resolvePromptOptimizationOutputLanguage,
} from "../promptOptimizationUserPrompt"

describe("buildPromptOptimizationUserPrompt", () => {
	it("preserves placeholders already used by an image prompt", () => {
		const prompt = buildPromptOptimizationUserPrompt({
			target: "image",
			currentPrompt: "参考[图片1]生成一张海报",
			outputLanguage: "zh",
			referenceImageCount: 2,
			references: [
				{
					kind: "image",
					placeholder: "[图片1]",
					label: "图片参考 1",
					fileName: "product.png",
					isVisualInput: true,
					visualReferenceIndex: 1,
				},
				{
					kind: "image",
					placeholder: "[图片2]",
					label: "图片参考 2",
					fileName: "style.png",
					isVisualInput: true,
					visualReferenceIndex: 2,
				},
			],
		})

		expect(prompt).toContain("# 任务\n优化一段用于图片生成或图片编辑的提示词")
		expect(prompt).toContain("# 当前输入\n```text\n参考[图片1]生成一张海报\n```")
		expect(prompt).toContain("# 引用规则")
		expect(prompt).toContain("当前输入中已出现的素材占位符必须原样保留：[图片1]")
		expect(prompt).toContain("不要新增当前输入没有出现的占位符")
		expect(prompt).toContain("# 参考素材")
		expect(prompt).toContain("[图片1]：文件名：product.png，对应第 1 张参考图内容")
		expect(prompt).toContain("图片参考 2：文件名：style.png，对应第 2 张参考图内容")
	})

	it("keeps image references as context when the prompt has no placeholders", () => {
		const prompt = buildPromptOptimizationUserPrompt({
			target: "image",
			currentPrompt: "生成一张极简产品图",
			outputLanguage: "zh",
			referenceImageCount: 1,
			references: [
				{
					kind: "image",
					label: "图片参考 1",
					fileName: "product.png",
					isVisualInput: true,
					visualReferenceIndex: 1,
				},
			],
		})

		expect(prompt).toContain(
			"当前输入没有素材占位符，返回结果也不要出现任何 [图片1]、[视频1]、[音频1] 形式的占位符",
		)
		expect(prompt).toContain("# 参考资源概况\n已提供 1 张图片内容作为视觉参考。")
		expect(prompt).toContain("图片参考 1：文件名：product.png，对应第 1 张参考图内容")
	})

	it("describes video frames visually but keeps video and audio files as file context", () => {
		const prompt = buildPromptOptimizationUserPrompt({
			target: "video",
			currentPrompt: "让[视频1]保持原主体，参考首帧做开场",
			outputLanguage: "zh",
			referenceImageCount: 1,
			frameImageCount: 1,
			referenceVideoCount: 1,
			referenceAudioCount: 1,
			references: [
				{
					kind: "image",
					label: "首帧参考",
					fileName: "start.png",
					isVisualInput: true,
					visualReferenceIndex: 1,
					role: "作为视频起始画面的视觉约束",
				},
				{
					kind: "video",
					placeholder: "[视频1]",
					label: "视频文件引用 1",
					fileName: "source.mp4",
				},
				{
					kind: "audio",
					placeholder: "[音频1]",
					label: "音频文件引用 1",
					fileName: "music.mp3",
				},
			],
		})

		expect(prompt).toContain(
			"# 参考资源概况\n已提供 1 张图片内容作为视觉参考，其中 1 张为视频帧参考；1 个视频文件、1 个音频文件仅提供文件名作为上下文，不能推断具体画面或声音内容。",
		)
		expect(prompt).toContain(
			"首帧参考：文件名：start.png，对应第 1 张参考图内容，用途：作为视频起始画面的视觉约束",
		)
		expect(prompt).toContain(
			"[视频1]：文件名：source.mp4。当前只提供文件名作为上下文，不提供视频内容；返回提示词中必须原样保留 [视频1]",
		)
		expect(prompt).toContain(
			"音频文件引用 1：文件名：music.mp3。当前只提供文件名作为上下文，不提供音频内容；不要描述、总结或假设其声音内容。",
		)
	})

	it("adds an English fallback output language rule", () => {
		const prompt = buildPromptOptimizationUserPrompt({
			target: "image",
			currentPrompt: "用户当前未填写",
			outputLanguage: "en",
		})

		expect(prompt).toContain("如果当前输入为空或语言不明显，最终提示词必须使用英文")
	})

	it("resolves output language from prompt before host locale", () => {
		expect(
			resolvePromptOptimizationOutputLanguage({
				currentPrompt: "A cinematic product photo with soft rim light",
				hostUiLocale: "zh_CN",
			}),
		).toBe("en")
		expect(
			resolvePromptOptimizationOutputLanguage({
				currentPrompt: "生成一张干净的产品图",
				hostUiLocale: "en_US",
			}),
		).toBe("zh")
	})

	it("falls back to host locale when prompt language is unclear", () => {
		expect(
			resolvePromptOptimizationOutputLanguage({
				currentPrompt: "[图片1] @product.png",
				hostUiLocale: "en_US",
			}),
		).toBe("en")
		expect(
			resolvePromptOptimizationOutputLanguage({
				currentPrompt: "[图片1]",
				hostUiLocale: "zh_CN",
			}),
		).toBe("zh")
	})
})
