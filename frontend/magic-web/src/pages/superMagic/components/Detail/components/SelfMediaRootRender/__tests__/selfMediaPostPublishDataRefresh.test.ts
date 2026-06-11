import { beforeEach, describe, expect, it, vi } from "vitest"
import { sendSelfMediaPostPublishDataRefresh } from "../services/selfMediaPostPublishDataRefresh"

const { mockPublish, mockT } = vi.hoisted(() => ({
	mockPublish: vi.fn(),
	mockT: vi.fn((key: string, options?: Record<string, unknown>) => {
		const translations: Record<string, string> = {
			"detail.selfMedia.opsRefresh.prompt.topicName": "[真实数据刷新] {{title}}",
			"detail.selfMedia.opsRefresh.prompt.untitled": "自媒体文章",
			"detail.selfMedia.opsRefresh.prompt.opening":
				"请作为 IP 运营专家，基于 {{mention}} 抓取并回写发布后的真实运营数据。",
			"detail.selfMedia.opsRefresh.prompt.metadata":
				"平台：{{platform}}\n标题：{{title}}\n真实文章链接：{{publishedUrl}}",
			"detail.selfMedia.opsRefresh.prompt.instruction":
				'请优先读取当前文章目录下 ops/source.json 的 publishedUrl，并以本次消息里的真实文章链接作为兜底目标。访问真实文章链接，获取或整理真实曝光、阅读、点赞、收藏、评论、转发、涨粉、转化等数据；将结构化指标回写到当前文章目录下的 ops/metrics.json，将评论/用户反馈回写到 ops/comments.json，将运营复盘、原因归因和下一步动作回写到 ops/review.html，同时更新 ops/source.json 的 fetchStatus、lastFetchedAt 和必要的失败原因。每次同步都要保留 history 快照。下一步动作要渲染为可点击按钮，用 addEventListener 绑定事件，点击时优先调用 window.Magic.project.sendMessage(message, { model: "auto" })，不可用时降级调用 window.Magic.setInputMessage(message)。',
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
		expect(contentText).toContain("IP 运营专家")
		expect(contentText).toContain("https://www.xiaohongshu.com/explore/post-1")
		expect(contentText).toContain("ops/source.json")
		expect(contentText).toContain("ops/metrics.json")
		expect(contentText).toContain("ops/comments.json")
		expect(contentText).toContain("ops/review.html")
		expect(contentText).toContain("window.Magic.setInputMessage")
		expect(contentText).toContain("addEventListener")
		expect(contentText).toContain("history")
		expect(contentText).toContain("当前文章目录")
		expect(contentText).toContain("fetchStatus")
		expect(contentText).not.toContain("ops/review.md")
	})
})
