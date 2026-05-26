import { describe, expect, it } from "vitest"
import type { ArticleDetail } from "../components/SelfMediaInitPanel/types"
import {
	buildSelfMediaPostIndexEntries,
	upsertSelfMediaPostsIndex,
} from "../services/selfMediaMagicProjectIndex"

interface ParsedMagicProjectConfig {
	version?: string
	type?: string
	name?: string
	"self-media": Record<string, { posts: Array<{ id: string; name: string; entry: string }> }>
}

function parseConfig(content: string): ParsedMagicProjectConfig {
	const win: {
		magicProjectConfig?: ParsedMagicProjectConfig
		magicProjectConfigure?: () => void
	} = {
		magicProjectConfigure: () => undefined,
	}
	new Function("window", content)(win)
	if (!win.magicProjectConfig) throw new Error("config missing")
	return win.magicProjectConfig
}

function makeArticle(overrides: Partial<ArticleDetail>): ArticleDetail {
	return {
		title: "Untitled",
		folderName: "",
		style: "professional",
		visualPreset: "none",
		outline: [],
		cardCount: 0,
		materials: [],
		notes: "",
		platform: "rednote",
		description: "",
		visualReferenceFiles: [],
		...overrides,
	}
}

describe("selfMediaMagicProjectIndex", () => {
	it("builds stable post index entries from article folder names", () => {
		const entries = buildSelfMediaPostIndexEntries([
			makeArticle({ title: "Post A", folderName: "post-a", platform: "rednote" }),
			makeArticle({
				title: "WeChat Post",
				folderName: "wechat-post",
				platform: "wechat-official-accounts",
			}),
		])

		expect(entries).toEqual([
			{
				platform: "rednote",
				id: "post-a",
				name: "Post A",
				entry: "posts/post-a/post.json",
			},
			{
				platform: "wechat-official-accounts",
				id: "wechat-post",
				name: "WeChat Post",
				entry: "posts/wechat-post/post.json",
			},
		])
	})

	it("uses the resolved post folder for magic.project.js entries without changing the manifest path", () => {
		const entries = buildSelfMediaPostIndexEntries([
			makeArticle({
				title: "中文标题",
				folderName: "",
				platform: "rednote",
			}),
		])

		expect(entries).toEqual([
			{
				platform: "rednote",
				id: "01-post",
				name: "中文标题",
				entry: "posts/01-post/post.json",
			},
		])
	})

	it("upserts entries by platform while preserving existing order", () => {
		const current = `window.magicProjectConfig = {
  "version": "1.0.0",
  "type": "self-media",
  "name": "My Project",
  "self-media": {
    "rednote": {
      "posts": [
        { "id": "existing", "name": "Old Name", "entry": "posts/existing/post.json" }
      ]
    }
  }
};
window.magicProjectConfigure(window.magicProjectConfig);`

		const updated = upsertSelfMediaPostsIndex(current, [
			{
				platform: "rednote",
				id: "existing",
				name: "New Name",
				entry: "posts/existing/post.json",
			},
			{
				platform: "rednote",
				id: "new-post",
				name: "New Post",
				entry: "posts/new-post/post.json",
			},
			{
				platform: "instagram",
				id: "insta-post",
				name: "Instagram Post",
				entry: "posts/insta-post/post.json",
			},
		])

		const config = parseConfig(updated)
		expect(config.version).toBe("1.0.0")
		expect(config.type).toBe("self-media")
		expect(config.name).toBe("My Project")
		expect(config["self-media"].rednote.posts).toEqual([
			{ id: "existing", name: "New Name", entry: "posts/existing/post.json" },
			{ id: "new-post", name: "New Post", entry: "posts/new-post/post.json" },
		])
		expect(config["self-media"].instagram.posts).toEqual([
			{ id: "insta-post", name: "Instagram Post", entry: "posts/insta-post/post.json" },
		])
		expect(updated).toContain("window.magicProjectConfig = ")
		expect(updated).toContain("window.magicProjectConfigure(window.magicProjectConfig);")
	})

	it("throws when the existing magic.project.js content is invalid", () => {
		expect(() =>
			upsertSelfMediaPostsIndex("window.magicProjectConfig = not-json", [
				{
					platform: "rednote",
					id: "post-a",
					name: "Post A",
					entry: "posts/post-a/post.json",
				},
			]),
		).toThrow("Invalid magic.project.js")
	})
})
