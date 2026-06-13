import { beforeEach, describe, expect, it, vi } from "vitest"
import { sendSelfMediaPostPublishDataRefresh } from "../services/selfMediaPostPublishDataRefresh"

const { mockPublish, mockT } = vi.hoisted(() => ({
	mockPublish: vi.fn(),
	mockT: vi.fn((key: string, options?: Record<string, unknown>) => {
		const translations: Record<string, string> = {
			"detail.selfMedia.opsRefresh.prompt.topicName": "[真实数据刷新] {{title}}",
			"detail.selfMedia.opsRefresh.prompt.untitled": "自媒体文章",
			"detail.selfMedia.opsRefresh.prompt.metadata":
				"平台：{{platform}}\n标题：{{title}}\n真实文章链接：{{publishedUrl}}",
			"detail.selfMedia.initPanel.platforms.rednote": "小红书",
		}
		const template = translations[key] || String(options?.defaultValue || key)
		return template.replace(/\{\{(\w+)\}\}/g, (_, name) => String(options?.[name] ?? ""))
	}),
}))

const selectedModel = {
	id: "model-1",
	group_id: "group-1",
	model_id: "gpt-5",
	model_name: "GPT-5",
	provider_model_id: "gpt-5",
	model_description: "",
	model_icon: "",
	model_status: "normal",
	sort: 1,
}

vi.mock("i18next", () => ({
	default: {
		t: mockT,
	},
	t: mockT,
}))

vi.mock("@/utils/pubsub", () => ({
	default: {
		publish: mockPublish,
	},
	PubSubEvents: {
		Create_New_Topic: "Create_New_Topic",
	},
}))

vi.mock("../services/selfMediaBatchSend", () => ({
	SELF_MEDIA_TOPIC_PATTERN: "ip-manager",
}))

describe("selfMediaPostPublishDataRefresh", () => {
	beforeEach(() => {
		mockPublish.mockReset()
	})

	it("creates a web-search enabled post-publish data refresh topic with source URL and folder mention", async () => {
		await sendSelfMediaPostPublishDataRefresh({
			selectedProject: { id: "project-1" },
			platform: "rednote",
			selectedModel,
			publishedUrl: "https://www.xiaohongshu.com/explore/post-1",
			post: {
				meta: {
					id: "post-1",
					title: "AI Tools",
					author: "Magic Lab",
				},
				cards: [{ path: "cards/01.html", fileId: "card-1" }],
			},
			postDirectoryItem: {
				file_id: "post-dir",
				file_name: "post-1",
				relative_file_path: "posts/post-1/",
				is_directory: true,
			} as never,
		})

		expect(mockPublish).toHaveBeenCalledTimes(1)
		expect(mockPublish.mock.calls[0]?.[0]).toBe("Create_New_Topic")
		const createPayload = mockPublish.mock.calls[0]?.[1]
		expect(createPayload).toEqual(
			expect.objectContaining({
				topicMode: "ip-manager",
				topicName: "[真实数据刷新] AI Tools",
			}),
		)

		const sendPayload = createPayload.afterCreate
		expect(sendPayload).toEqual(
			expect.objectContaining({
				send: true,
				topicMode: "ip-manager",
				selectedModel,
			}),
		)
		expect(sendPayload.extra.super_agent).toEqual(
			expect.objectContaining({
				topic_pattern: "ip-manager",
				chat_mode: "normal",
				enable_web_search: true,
			}),
		)
		expect(sendPayload.extra.super_agent).not.toHaveProperty("agent_code")
		expect(sendPayload.extra.super_agent.mentions).toEqual([
			{
				type: "project_directory",
				data: expect.objectContaining({
					directory_id: "post-dir",
					directory_name: "post-1",
					directory_path: "posts/post-1/",
				}),
			},
		])

		const contentText = JSON.stringify(sendPayload.content)
		expect(contentText.length).toBeLessThan(950)
		expect(contentText).toContain("self-media-composer")
		expect(contentText).toContain("发布入盘")
		expect(contentText).toContain("发布后数据同步")
		expect(contentText).toContain("fixed ops schema")
		expect(contentText).toContain("https://www.xiaohongshu.com/explore/post-1")
		expect(contentText).toContain("ops/source.json")
		expect(contentText).toContain("ops/metrics.json")
		expect(contentText).toContain("ops/comments.json")
		expect(contentText).toContain("ops/review.html")
		expect(contentText).toContain("current post folder")
		expect(contentText).toContain("fetchStatus")
		expect(contentText).not.toContain("window.Magic.setInputMessage")
		expect(contentText).not.toContain("addEventListener")
		expect(contentText).not.toContain("ops/review.md")
	})
})
