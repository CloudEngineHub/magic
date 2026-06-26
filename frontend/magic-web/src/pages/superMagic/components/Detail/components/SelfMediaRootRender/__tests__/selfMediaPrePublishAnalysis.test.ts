import { beforeEach, describe, expect, it, vi } from "vitest"
import { sendSelfMediaPrePublishAnalysis } from "../services/selfMediaPrePublishAnalysis"

const {
	mockChat,
	mockCreateTopic,
	mockNavigateToBatchTopic,
	mockPublish,
	mockT,
	mockTranslations,
} = vi.hoisted(() => {
	const translations: Record<string, string> = {
		"detail.selfMedia.analysis.prompt.topicName": "[发布前诊断] {{title}}",
		"detail.selfMedia.analysis.prompt.untitled": "自媒体文章",
		"detail.selfMedia.analysis.prompt.missingValue": "未提供",
		"detail.selfMedia.analysis.prompt.opening": "请对 {{mention}} 做发布前诊断。",
		"detail.selfMedia.analysis.prompt.metadata":
			"平台：{{platform}}\n目标：{{goal}}\n标题：{{title}}\n作者/IP：{{author}}\n标签：{{tags}}",
		"detail.selfMedia.analysis.prompt.instruction":
			"请联网对比同类内容，输出证据清单、评分、关键问题、同类内容差距、优先修改清单和改稿指令。外部资料只作为运营经验参考。",
		"detail.selfMedia.analysis.goals.ipGrowth": "IP增长",
		"detail.selfMedia.initPanel.platforms.rednote": "小红书",
	}
	return {
		mockChat: vi.fn(),
		mockCreateTopic: vi.fn(),
		mockNavigateToBatchTopic: vi.fn(),
		mockPublish: vi.fn(),
		mockTranslations: translations,
		mockT: vi.fn((key: string, options?: Record<string, unknown>) => {
			const template = translations[key] || String(options?.defaultValue || key)
			return template.replace(/\{\{(\w+)\}\}/g, (_, name) => String(options?.[name] ?? ""))
		}),
	}
})

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
		Send_Message_by_Content: "Send_Message_by_Content",
	},
}))

vi.mock("@/apis", () => ({
	ChatApi: {
		chat: mockChat,
	},
	SuperMagicApi: {
		createTopic: mockCreateTopic,
		preWarmSandbox: vi.fn(),
	},
}))

vi.mock("@/models/user", () => ({
	userStore: {
		user: {
			userInfo: {
				user_id: "user-1",
			},
		},
	},
}))

vi.mock("../services/selfMediaBatchSend", () => ({
	navigateToBatchTopic: mockNavigateToBatchTopic,
	SELF_MEDIA_TOPIC_PATTERN: "ip-manager",
}))

describe("selfMediaPrePublishAnalysis", () => {
	beforeEach(() => {
		Object.assign(mockTranslations, {
			"detail.selfMedia.analysis.prompt.topicName": "[发布前诊断] {{title}}",
			"detail.selfMedia.analysis.prompt.untitled": "自媒体文章",
			"detail.selfMedia.analysis.prompt.missingValue": "未提供",
			"detail.selfMedia.analysis.prompt.opening": "请对 {{mention}} 做发布前诊断。",
			"detail.selfMedia.analysis.prompt.metadata":
				"平台：{{platform}}\n目标：{{goal}}\n标题：{{title}}\n作者/IP：{{author}}\n标签：{{tags}}",
			"detail.selfMedia.analysis.prompt.instruction":
				"请联网对比同类内容，输出证据清单、评分、关键问题、同类内容差距、优先修改清单和改稿指令。外部资料只作为运营经验参考。",
			"detail.selfMedia.analysis.goals.ipGrowth": "IP增长",
			"detail.selfMedia.initPanel.platforms.rednote": "小红书",
		})
		mockChat.mockReset().mockResolvedValue(undefined)
		mockCreateTopic.mockReset().mockResolvedValue({
			id: "topic-1",
			chat_topic_id: "chat-topic-1",
			chat_conversation_id: "conversation-1",
		})
		mockNavigateToBatchTopic.mockReset()
		mockPublish.mockReset()
	})

	it("sends a web-search enabled ip-manager analysis request with goal and post folder mention", async () => {
		await sendSelfMediaPrePublishAnalysis({
			selectedProject: { id: "project-1" },
			platform: "rednote",
			analysisGoal: "ip-growth",
			selectedModel,
			post: {
				meta: {
					id: "post-1",
					title: "AI Tools",
					author: "Magic Lab",
					tags: "#AI #工具",
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

		expect(mockCreateTopic).not.toHaveBeenCalled()
		expect(mockChat).not.toHaveBeenCalled()
		expect(mockNavigateToBatchTopic).not.toHaveBeenCalled()
		expect(mockPublish).toHaveBeenCalledTimes(1)
		expect(mockPublish.mock.calls[0]?.[0]).toBe("Create_New_Topic")
		const createPayload = mockPublish.mock.calls[0]?.[1]
		expect(createPayload).toEqual(
			expect.objectContaining({
				topicMode: "ip-manager",
				topicName: "[发布前诊断] AI Tools",
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
		const richText = {
			content: JSON.stringify(sendPayload.content),
			extra: sendPayload.extra,
		}
		expect(mockT).toHaveBeenCalledWith(
			"detail.selfMedia.analysis.prompt.instruction",
			expect.objectContaining({ ns: "super" }),
		)
		expect(mockT).toHaveBeenCalledWith(
			"detail.selfMedia.analysis.prompt.opening",
			expect.objectContaining({ ns: "super" }),
		)
		expect(mockT).not.toHaveBeenCalledWith(
			"detail.selfMedia.analysis.prompt.openingPrefix",
			expect.anything(),
		)
		expect(mockT).not.toHaveBeenCalledWith(
			"detail.selfMedia.analysis.prompt.openingSuffix",
			expect.anything(),
		)
		expect(richText.extra.super_agent).toEqual(
			expect.objectContaining({
				topic_pattern: "ip-manager",
				chat_mode: "normal",
				enable_web_search: true,
			}),
		)
		expect(richText.extra.super_agent.mentions).toBeUndefined()
		const content = JSON.parse(richText.content)
		const contentText = JSON.stringify(content)
		expect(contentText).toContain("IP增长")
		expect(contentText).toContain("发布前诊断")
		expect(contentText).toContain("证据清单")
		expect(contentText).not.toContain("skill")
		expect(contentText).not.toContain("self-media-pre-publish-analyzer")
		expect(contentText).not.toContain("小红书图文基础维度")
		expect(contentText).not.toContain("目标权重解释")
		expect(content.content?.length).toBeLessThanOrEqual(3)
		expect(content.content?.[0]?.content).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					type: "mention",
					attrs: expect.objectContaining({
						type: "project_directory",
						data: expect.objectContaining({
							directory_id: "post-dir",
							directory_name: "post-1",
							directory_path: "posts/post-1/",
						}),
					}),
				}),
			]),
		)
	})

	it("uses the active locale when building the diagnosis topic and message", async () => {
		Object.assign(mockTranslations, {
			"detail.selfMedia.analysis.prompt.topicName": "[Pre-publish diagnosis] {{title}}",
			"detail.selfMedia.analysis.prompt.opening": "Diagnose {{mention}} before publishing.",
			"detail.selfMedia.analysis.prompt.metadata":
				"Platform: {{platform}}\nGoal: {{goal}}\nTitle: {{title}}\nAuthor/IP: {{author}}\nTags: {{tags}}",
			"detail.selfMedia.analysis.prompt.instruction":
				"Search online for comparable content. Output evidence, score, key issues, comparison gaps, prioritized edits, and rewrite instructions.",
			"detail.selfMedia.analysis.goals.ipGrowth": "IP Growth",
			"detail.selfMedia.initPanel.platforms.rednote": "RedNote",
		})

		await sendSelfMediaPrePublishAnalysis({
			selectedProject: { id: "project-1" },
			platform: "rednote",
			analysisGoal: "ip-growth",
			selectedModel,
			post: {
				meta: {
					id: "post-1",
					title: "AI Tools",
					author: "Magic Lab",
					tags: "#AI #Tools",
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

		const createPayload = mockPublish.mock.calls[0]?.[1]
		expect(createPayload.topicName).toBe("[Pre-publish diagnosis] AI Tools")

		const contentText = JSON.stringify(createPayload.afterCreate.content)
		expect(contentText).toContain("Diagnose")
		expect(contentText).toContain("Platform: RedNote")
		expect(contentText).toContain("Goal: IP Growth")
		expect(contentText).toContain("Search online for comparable content")
		expect(contentText).not.toContain("发布前诊断")
		expect(contentText).not.toContain("证据清单")
	})
})
