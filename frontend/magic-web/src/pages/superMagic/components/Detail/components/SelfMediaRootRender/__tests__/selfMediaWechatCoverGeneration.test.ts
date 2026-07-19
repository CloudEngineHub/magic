import { beforeEach, describe, expect, it, vi } from "vitest"
import { sendSelfMediaWechatCoverGeneration } from "../services/selfMediaWechatCoverGeneration"

const { mockPublish, mockT } = vi.hoisted(() => ({
	mockPublish: vi.fn(),
	mockT: vi.fn((key: string, options?: Record<string, unknown>) => {
		const translations: Record<string, string> = {
			"detail.selfMedia.coverGeneration.prompt.topicName": "[生成封面] {{title}}",
			"detail.selfMedia.coverGeneration.prompt.opening": "为 {{mention}} 生成缺少的封面。",
			"detail.selfMedia.coverGeneration.prompt.metadata":
				"标题：{{title}}\n需要生成：{{coverTypes}}",
			"detail.selfMedia.coverGeneration.prompt.instruction":
				"使用 generate_image 生成封面并更新 post.json。",
			"detail.selfMedia.coverGeneration.prompt.heroCover": "21:9 横向封面（heroCover）",
		}
		const template = translations[key] || String(options?.defaultValue || key)
		return template.replace(/\{\{(\w+)\}\}/g, (_, name) => String(options?.[name] ?? ""))
	}),
}))

vi.mock("i18next", () => ({
	default: { t: mockT },
	t: mockT,
}))

vi.mock("@/utils/pubsub", () => ({
	default: { publish: mockPublish },
	PubSubEvents: { Create_New_Topic: "Create_New_Topic" },
}))

vi.mock("../services/selfMediaBatchSend", () => ({
	SELF_MEDIA_TOPIC_PATTERN: "ip-manager",
}))

describe("selfMediaWechatCoverGeneration", () => {
	beforeEach(() => mockPublish.mockReset())

	it("creates a topic that requests only the missing WeChat covers", async () => {
		await sendSelfMediaWechatCoverGeneration({
			selectedProject: { id: "project-1" },
			post: { meta: { id: "post-1", title: "AI Tools" }, cards: [] },
			postDirectoryItem: {
				file_id: "post-dir",
				file_name: "post-1",
				relative_file_path: "posts/post-1/",
				is_directory: true,
			} as never,
			coverTypes: ["heroCover", "thumbnailCover"],
		})

		expect(mockPublish).toHaveBeenCalledWith(
			"Create_New_Topic",
			expect.objectContaining({
				topicMode: "ip-manager",
				topicName: "[生成封面] AI Tools",
			}),
		)
		const payload = mockPublish.mock.calls[0]?.[1]
		expect(payload.afterCreate.mentionItems).toHaveLength(1)
		expect(payload.afterCreate.extra.super_agent).toEqual(
			expect.objectContaining({
				topic_pattern: "ip-manager",
				chat_mode: "normal",
				enable_web_search: false,
			}),
		)
		const contentText = JSON.stringify(payload.afterCreate.content)
		expect(contentText).toContain("generate_image")
		expect(contentText).toContain("21:9")
		expect(contentText).toContain("thumbnailCover")
	})

	it("rejects requests without a project", async () => {
		await expect(
			sendSelfMediaWechatCoverGeneration({
				selectedProject: undefined,
				post: { meta: { id: "post-1" }, cards: [] },
				postDirectoryItem: { file_id: "post-dir" } as never,
				coverTypes: ["heroCover"],
			}),
		).rejects.toThrow("No project selected")
	})
})
