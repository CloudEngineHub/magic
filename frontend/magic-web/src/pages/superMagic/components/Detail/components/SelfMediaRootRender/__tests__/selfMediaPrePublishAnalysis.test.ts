import { beforeEach, describe, expect, it, vi } from "vitest"
import { sendSelfMediaPrePublishAnalysis } from "../services/selfMediaPrePublishAnalysis"

const { mockChat, mockCreateTopic, mockNavigateToBatchTopic } = vi.hoisted(() => ({
	mockChat: vi.fn(),
	mockCreateTopic: vi.fn(),
	mockNavigateToBatchTopic: vi.fn(),
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
		mockChat.mockReset().mockResolvedValue(undefined)
		mockCreateTopic.mockReset().mockResolvedValue({
			id: "topic-1",
			chat_topic_id: "chat-topic-1",
			chat_conversation_id: "conversation-1",
		})
		mockNavigateToBatchTopic.mockReset()
	})

	it("sends a web-search enabled ip-manager analysis request with goal and post folder mention", async () => {
		await sendSelfMediaPrePublishAnalysis({
			selectedProject: { id: "project-1" },
			platform: "rednote",
			analysisGoal: "ip-growth",
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

		expect(mockCreateTopic).toHaveBeenCalledWith({
			project_id: "project-1",
			topic_name: "[发布前诊断] AI Tools",
		})
		expect(mockChat).toHaveBeenCalledTimes(1)
		const payload = mockChat.mock.calls[0][1]
		const richText = payload.message.rich_text
		expect(richText.extra.super_agent).toEqual(
			expect.objectContaining({
				topic_pattern: "ip-manager",
				chat_mode: "normal",
				enable_web_search: true,
			}),
		)
		expect(richText.extra.super_agent.mentions).toEqual([
			{
				type: "project_directory",
				data: expect.objectContaining({
					directory_id: "post-dir",
					directory_name: "post-1",
					directory_path: "posts/post-1/",
				}),
			},
		])
		expect(JSON.stringify(JSON.parse(richText.content))).toContain("IP增长")
		expect(JSON.stringify(JSON.parse(richText.content))).toContain("二级分项评分")
		expect(JSON.stringify(JSON.parse(richText.content))).toContain("按平台评分卡和目标场景")
		expect(JSON.stringify(JSON.parse(richText.content))).toContain("证据清单")
		expect(mockNavigateToBatchTopic).toHaveBeenCalledWith("project-1", expect.any(Object))
	})
})
