import { describe, expect, it } from "vitest"
import {
	resolveSelfMediaPostDirectoryAttachmentItem,
	resolveSelfMediaPostMentionFileId,
} from "../services/selfMediaCardChat"
import type { SelfMediaAttachmentNode, SelfMediaPost } from "../types"

const attachmentList: SelfMediaAttachmentNode[] = [
	{
		file_id: "root",
		file_name: "self-media",
		relative_file_path: "",
		is_directory: true,
		children: [
			{
				file_id: "wechat-post-dir",
				file_name: "wechat-post",
				relative_file_path: "posts/wechat-post/",
				is_directory: true,
				children: [
					{
						file_id: "post-json",
						file_name: "post.json",
						relative_file_path: "posts/wechat-post/post.json",
					},
					{
						file_id: "article-file",
						file_name: "article.html",
						relative_file_path: "posts/wechat-post/article.html",
					},
				],
			},
			{
				file_id: "rednote-post-dir",
				file_name: "rednote-post",
				relative_file_path: "posts/rednote-post/",
				is_directory: true,
				children: [
					{
						file_id: "rednote-post-json",
						file_name: "post.json",
						relative_file_path: "posts/rednote-post/post.json",
					},
					{
						file_id: "card-file",
						file_name: "01.html",
						relative_file_path: "posts/rednote-post/cards/01.html",
					},
				],
			},
		],
	},
]

describe("selfMediaCardChat", () => {
	it("resolves a WeChat article file to its post directory mention item", () => {
		const item = resolveSelfMediaPostDirectoryAttachmentItem(attachmentList, "article-file")

		expect(item).toEqual(
			expect.objectContaining({
				file_id: "wechat-post-dir",
				file_name: "wechat-post",
				relative_file_path: "posts/wechat-post/",
				is_directory: true,
			}),
		)
	})

	it("uses article file id before card file ids when selecting the post mention anchor", () => {
		const post: SelfMediaPost = {
			meta: { id: "wechat-post" },
			article: { path: "article.html", fileId: "article-file" },
			cards: [{ path: "cards/01.html", fileId: "card-file" }],
		}

		expect(resolveSelfMediaPostMentionFileId(post)).toBe("article-file")
	})
})
