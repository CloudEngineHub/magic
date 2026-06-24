import { beforeEach, describe, expect, it, vi } from "vitest"
import { SuperMagicApi } from "@/apis"
import pubsub, { PubSubEvents } from "@/utils/pubsub"
import { createAICardViaTopic } from "../aiCardCreate"

const { mockT } = vi.hoisted(() => ({
	mockT: vi.fn((key: string, options?: Record<string, unknown>) => {
		const translations: Record<string, string> = {
			"detail.aiCard.createMessage.topicName": "[AI Card] {{cardName}}",
			"detail.aiCard.createMessage.title": 'Create an AI Card named "{{cardName}}".',
			"detail.aiCard.createMessage.sections.cardData": "Card data",
			"detail.aiCard.createMessage.sections.createRequirement": "Creation requirements",
			"detail.aiCard.createMessage.sections.analysisInstruction": "Analysis instructions",
			"detail.aiCard.createMessage.sections.notificationTargets": "Notification targets",
			"detail.aiCard.createMessage.notificationTargetLine":
				"{{channel}}: {{targetDescription}}",
			"detail.aiCard.createMessage.notificationChannels.dingtalk": "DingTalk",
			"detail.aiCard.createMessage.notificationChannels.lark": "Lark",
			"detail.aiCard.createMessage.cardId": "Card ID: {{cardId}}",
			"detail.aiCard.createMessage.cardLink": "Card link: {{cardLink}}",
			"detail.aiCard.createMessage.location": "Location: {{cardDir}}/",
			"detail.aiCard.createMessage.template": "Template: {{template}}",
			"detail.aiCard.createMessage.customTemplate": "Custom template: {{customTemplate}}",
			"detail.aiCard.createMessage.update.once": "Update mode: one-time generation",
			"detail.aiCard.createMessage.update.defaultScheduled":
				"Update mode: default scheduled updates",
			"detail.aiCard.createMessage.update.scheduled": "Schedule: {{schedule}}{{enabledText}}",
			"detail.aiCard.createMessage.schedule.noRepeat": "once at {{time}}",
			"detail.aiCard.createMessage.schedule.daily": "daily at {{time}}",
			"detail.aiCard.createMessage.schedule.weekly": "weekly on {{day}} at {{time}}",
			"detail.aiCard.createMessage.schedule.monthly": "monthly on day {{day}} at {{time}}",
			"detail.aiCard.createMessage.schedule.default": "at {{time}}",
			"detail.aiCard.createMessage.schedule.enabled": " (enabled)",
			"detail.aiCard.createMessage.schedule.disabled": " (disabled)",
		}
		const template = translations[key] || String(options?.defaultValue || key)
		return template.replace(/\{\{(\w+)\}\}/g, (_, name) => String(options?.[name] ?? ""))
	}),
}))

vi.mock("@/apis", () => ({
	SuperMagicApi: {
		createTopic: vi.fn(),
		preWarmSandbox: vi.fn(),
	},
}))

vi.mock("i18next", () => ({
	default: {
		t: mockT,
	},
	t: mockT,
}))

vi.mock("@/pages/superMagic/stores/core", () => ({
	projectStore: {
		selectedProject: { id: "project-1" },
	},
	topicStore: {
		setSelectedTopic: vi.fn(),
	},
}))

vi.mock("@/pages/superMagic/services/routeManageService", () => ({
	default: {
		navigateToState: vi.fn(),
	},
}))

vi.mock("@/services/superMagic/topicModel", () => ({
	superMagicTopicModelService: {
		saveModel: vi.fn(),
	},
}))

vi.mock("@/utils/pubsub", () => ({
	default: {
		publish: vi.fn(),
	},
	PubSubEvents: {
		Send_Message_by_Content: "Send_Message_by_Content",
	},
}))

vi.mock("@/components/base/MagicEllipseWithTooltip/MagicEllipseWithTooltip", () => ({
	default: ({ children }: { children?: unknown }) => children,
}))

vi.mock("@/pages/superMagic/components/MessageEditor/utils", () => ({
	buildPlainTextJSONContent: (text: string) => ({
		type: "doc",
		content: text.split("\n").map((line) => ({
			type: "paragraph",
			content: line ? [{ type: "text", text: line }] : [],
		})),
	}),
}))

vi.mock(
	"@/pages/superMagic/components/Detail/components/AICardRootRender/utils/aiCardDeepLink",
	() => ({
		generateAICardDeepLink: vi.fn(
			(_projectId: string, _topicId: string, cardId: string) =>
				`https://magic.example.com/global/super/project-1/topic-1?ai_card=${cardId}`,
		),
		createAICardId: vi.fn(() => "generated-card-id"),
	}),
)

function extractTextFromJSONContent(value: unknown): string {
	if (!value || typeof value !== "object") return ""
	const node = value as { text?: string; content?: unknown[] }
	return [node.text, ...(node.content || []).map(extractTextFromJSONContent)]
		.filter(Boolean)
		.join("\n")
}

describe("createAICardViaTopic", () => {
	beforeEach(() => {
		vi.useFakeTimers()
		vi.mocked(SuperMagicApi.createTopic).mockResolvedValue({ id: "topic-1" })
		vi.mocked(pubsub.publish).mockReset()
		mockT.mockClear()
	})

	it("includes stable card id and deep link as friendly text in the ai-card creation message", async () => {
		await createAICardViaTopic({
			projectId: "project-1",
			cardName: "运营日报",
			prompt: "分析最新运营数据",
			template: "daily-digest",
			cardId: "card-123",
		})

		vi.advanceTimersByTime(300)

		expect(pubsub.publish).toHaveBeenCalledWith(
			PubSubEvents.Send_Message_by_Content,
			expect.objectContaining({
				jsonContent: expect.any(Object),
			}),
		)
		const payload = vi.mocked(pubsub.publish).mock.calls[0][1] as { jsonContent: unknown }
		const text = extractTextFromJSONContent(payload.jsonContent)

		expect(text).toContain("Card ID: card-123")
		expect(text).toContain(
			"Card link: https://magic.example.com/global/super/project-1/topic-1?ai_card=card-123",
		)
		expect(text).not.toContain('"card_id"')
		expect(text).not.toContain('"card_path_or_link"')
		expect(SuperMagicApi.createTopic).toHaveBeenCalledWith(
			expect.objectContaining({
				topic_name: "[AI Card] 运营日报",
			}),
		)
	})

	it("keeps execution steps in the skill instead of expanding them in the creation message", async () => {
		await createAICardViaTopic({
			projectId: "project-1",
			cardName: "运营日报",
			prompt: "分析最新运营数据",
			template: "daily-digest",
			cardId: "card-123",
		})

		vi.advanceTimersByTime(300)

		const payload = vi.mocked(pubsub.publish).mock.calls[0][1] as { jsonContent: unknown }
		const text = extractTextFromJSONContent(payload.jsonContent)

		expect(text).toContain("━━━ Creation requirements ━━━")
		expect(text).toContain("Location: 运营日报/")
		expect(text).toContain("Template: daily-digest")
		expect(text).toContain("Update mode: default scheduled updates")
		expect(text).not.toContain("━━━ 创建位置 ━━━")
		expect(text).not.toContain("完整路径")
		expect(text).not.toContain("参考预设模板")
		expect(text).not.toContain("请按此规则设置定时任务")
		expect(text).not.toContain("请生成可后续手动打开、编辑和复用")
	})

	it("includes notification targets as readable text in the ai-card creation message", async () => {
		await createAICardViaTopic({
			projectId: "project-1",
			cardName: "运营日报",
			prompt: "分析最新运营数据",
			template: "daily-digest",
			cardId: "card-123",
			notification: {
				channels: [
					{ channel: "dingtalk", targetDescription: "发到「运营日报群」" },
					{ channel: "lark", targetDescription: "发给李四" },
				],
			},
		})

		vi.advanceTimersByTime(300)

		const payload = vi.mocked(pubsub.publish).mock.calls[0][1] as { jsonContent: unknown }
		const text = extractTextFromJSONContent(payload.jsonContent)

		expect(text).toContain("━━━ Notification targets ━━━")
		expect(text).toContain("DingTalk: 发到「运营日报群」")
		expect(text).toContain("Lark: 发给李四")
		expect(text).not.toContain('"channels"')
		expect(text).not.toContain('"channel"')
		expect(text).not.toContain('"targetDescription"')
	})
})
