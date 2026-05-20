import { describe, expect, it } from "vitest"
import type { JSONContent } from "@tiptap/react"
import { buildArticlePromptContent } from "../services/selfMediaPromptBuilder"
import type {
	ArticleDetail,
	MaterialItem,
	SelfMediaInitGlobalSettings,
} from "../components/SelfMediaInitPanel/types"

function makeMaterial(name: string, uploadedPath: string, description = ""): MaterialItem {
	return {
		id: `${name}-${uploadedPath}`,
		file: new File(["dummy"], name, { type: "image/png" }),
		previewUrl: "",
		description,
		uploadedPath,
	}
}

function paragraphText(node: JSONContent | undefined): string {
	if (!node?.content) return ""
	return node.content
		.map((item) => {
			if (item.type === "text") return item.text || ""
			if (item.type === "hardBreak") return "\n"
			return ""
		})
		.join("")
}

function paragraphHasMention(node: JSONContent | undefined, filePath: string): boolean {
	return Boolean(
		node?.content?.some(
			(item) =>
				item.type === "mention" &&
				item.attrs?.type === "project_file" &&
				item.attrs?.data?.file_path === filePath,
		),
	)
}

describe("buildArticlePromptContent", () => {
	const global: SelfMediaInitGlobalSettings = {
		author: "测试账号",
		brandPosition: "效率工具分享",
		targetAudience: "职场创作者",
		brandImages: [],
	}

	it("adds image placeholder guidance for generated content", () => {
		const article: ArticleDetail = {
			title: "用 AI 提高写作效率",
			folderName: "",
			style: "professional",
			visualPreset: "none",
			outline: [],
			cardCount: 6,
			materials: [],
			notes: "",
			platform: "rednote",
			description: "",
			visualReferenceFiles: [],
		}

		const result = buildArticlePromptContent(
			global,
			article,
			"self-media/posts/01-post/materials",
		)
		const doc = result.content.content || []
		const fullText = doc.map((node) => paragraphText(node)).join("\n")

		expect(fullText).toContain("图片占位符")
	})

	it("embeds each outline level attachment as inline @ mentions", () => {
		const rootMaterial = makeMaterial(
			"root.png",
			"self-media/posts/01-post/materials/root.png",
			"一级节点配图",
		)
		const childMaterial = makeMaterial(
			"child.png",
			"self-media/posts/01-post/materials/child.png",
			"二级节点配图",
		)

		const article: ArticleDetail = {
			title: "分层大纲测试",
			folderName: "",
			style: "professional",
			visualPreset: "none",
			outline: [
				{
					id: "root-1",
					text: "一级节点",
					materials: [rootMaterial],
					children: [
						{
							id: "child-1",
							text: "二级节点",
							materials: [childMaterial],
							children: [],
						},
					],
				},
			],
			cardCount: 0,
			materials: [],
			notes: "",
			platform: "rednote",
			description: "",
			visualReferenceFiles: [],
		}

		const result = buildArticlePromptContent(
			global,
			article,
			"self-media/posts/01-post/materials",
		)
		const doc = result.content.content || []
		const rootParagraph = doc.find((node) => paragraphText(node).includes("一级节点"))
		const childParagraph = doc.find((node) => paragraphText(node).includes("二级节点"))

		expect(paragraphHasMention(rootParagraph, rootMaterial.uploadedPath!)).toBe(true)
		expect(paragraphHasMention(childParagraph, childMaterial.uploadedPath!)).toBe(true)
	})
})
