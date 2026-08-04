import { describe, expect, it } from "vitest"
import {
	pruneProtectedReferencePaths,
	resolveExplicitPromptReferencePaths,
	resolveReferenceBindingState,
	unprotectPromptBoundReferencePaths,
} from "../../message/reference-assets/referenceBinding"
import {
	decodePromptPlaceholdersWithLabels,
	parsePromptPlaceholderTokenMatches,
	resolvePromptPlaceholderDecodeLabels,
	resolvePromptPlaceholderTokenConfig,
} from "../../message/reference-assets/promptPlaceholderTokenConfig"

const tokenConfig = resolvePromptPlaceholderTokenConfig((key, defaultValue) =>
	typeof defaultValue === "string" ? defaultValue : key,
)

const referenceFileInfos = [
	{ path: "/design/images/a.png", fileName: "a.png", src: "/design/images/a.png" },
	{ path: "/design/images/b.png", fileName: "b.png", src: "/design/images/b.png" },
]

describe("imageReferenceBinding", () => {
	it("treats placeholder-bound references as prompt-linked", () => {
		const binding = resolveReferenceBindingState({
			prompt: "请参考[图片1]和[图片2]继续绘制",
			referenceFileInfos,
			tokenConfig,
		})

		expect(binding.mode).toBe("prompt-linked")
		expect(binding.explicitPromptReferencePaths).toEqual([
			"/design/images/a.png",
			"/design/images/b.png",
		])
		expect(binding.protectedReferencePaths).toEqual([])
	})

	it("treats lowercase english placeholder labels as prompt-linked", () => {
		const binding = resolveReferenceBindingState({
			prompt: "请参考[image1]和[image2]继续绘制",
			referenceFileInfos,
			tokenConfig,
		})

		expect(binding.mode).toBe("prompt-linked")
		expect(binding.explicitPromptReferencePaths).toEqual([
			"/design/images/a.png",
			"/design/images/b.png",
		])
		expect(binding.protectedReferencePaths).toEqual([])
	})

	it("parses lowercase english media placeholder labels", () => {
		expect(
			parsePromptPlaceholderTokenMatches("[image1] [video2] [audio3]", tokenConfig),
		).toEqual([
			expect.objectContaining({ kind: "image", label: "image", index: 1 }),
			expect.objectContaining({ kind: "video", label: "video", index: 2 }),
			expect.objectContaining({ kind: "audio", label: "audio", index: 3 }),
		])
	})

	it("decodes lowercase english image placeholders to mentions", () => {
		expect(
			decodePromptPlaceholdersWithLabels(
				"请参考[image1]继续绘制",
				[{ path: "/design/images/a.png", fileName: "a.png" }],
				resolvePromptPlaceholderDecodeLabels("image", tokenConfig),
				tokenConfig,
			),
		).toBe("请参考@a.png继续绘制")
	})

	it("keeps legacy references protected when prompt has no explicit binding", () => {
		const binding = resolveReferenceBindingState({
			prompt: "保持原有构图和光影",
			referenceFileInfos,
			tokenConfig,
		})

		expect(binding.mode).toBe("detached-legacy")
		expect(binding.explicitPromptReferencePaths).toEqual([])
		expect(binding.protectedReferencePaths).toEqual([
			"/design/images/a.png",
			"/design/images/b.png",
		])
	})

	it("recognizes mixed binding when only part of the restored references are explicit", () => {
		const binding = resolveReferenceBindingState({
			prompt: "请继续参考@b.png",
			referenceFileInfos,
			tokenConfig,
		})

		expect(binding.mode).toBe("mixed")
		expect(binding.explicitPromptReferencePaths).toEqual(["/design/images/b.png"])
		expect(binding.protectedReferencePaths).toEqual(["/design/images/a.png"])
	})

	it("resolves duplicate file-name mentions in restored reference order", () => {
		const duplicateReferenceInfos = [
			{ path: "/design/a/cat.png", fileName: "cat.png", src: "/design/a/cat.png" },
			{ path: "/design/b/cat.png", fileName: "cat.png", src: "/design/b/cat.png" },
		]

		expect(
			resolveExplicitPromptReferencePaths({
				prompt: "@cat.png @cat.png",
				referenceFileInfos: duplicateReferenceInfos,
				tokenConfig,
			}),
		).toEqual(["/design/a/cat.png", "/design/b/cat.png"])
	})

	it("prunes removed protected references and unprotects prompt-bound legacy references", () => {
		expect(
			pruneProtectedReferencePaths(
				["/design/images/b.png"],
				["/design/images/a.png", "/design/images/b.png"],
			),
		).toEqual(["/design/images/b.png"])

		expect(
			unprotectPromptBoundReferencePaths(
				["/design/images/a.png", "/design/images/b.png"],
				["/design/images/b.png"],
			),
		).toEqual(["/design/images/a.png"])
	})

	it("compares reference paths by Canvas canonical identity", () => {
		const equivalentInfos = [
			{ path: "./images/a.png", fileName: "a.png", src: "./images/a.png" },
		]
		const binding = resolveReferenceBindingState({
			prompt: "@a.png",
			referenceFileInfos: equivalentInfos,
			tokenConfig,
		})

		expect(binding.explicitPromptReferencePaths).toEqual(["./images/a.png"])
		expect(pruneProtectedReferencePaths(["/images/a.png"], ["./images/a.png"])).toEqual([
			"./images/a.png",
		])
		expect(unprotectPromptBoundReferencePaths(["./images/a.png"], ["/images/a.png"])).toEqual(
			[],
		)
	})
})
