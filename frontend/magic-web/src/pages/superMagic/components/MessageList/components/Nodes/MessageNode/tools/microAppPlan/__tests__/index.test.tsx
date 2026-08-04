import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import MicroAppPlanToolCall from "../index"

const { getMessageNodeMock, messagesMock, sendUserToolCallReplyMock } = vi.hoisted(() => ({
	getMessageNodeMock: vi.fn(),
	messagesMock: new Map<string, Array<Record<string, unknown>>>(),
	sendUserToolCallReplyMock: vi.fn(),
}))

vi.mock("mobx-react-lite", () => ({
	observer: (component: unknown) => component,
}))

vi.mock("react-i18next", () => ({
	initReactI18next: {
		type: "3rdParty",
		init: vi.fn(),
	},
	useTranslation: () => ({
		t: (key: string) => key,
	}),
}))

vi.mock("@/pages/superMagic/hooks/useShareRoute", () => ({
	default: () => ({ isShareRoute: false }),
}))

vi.mock("@/pages/superMagic/stores", () => ({
	superMagicStore: {
		getMessageNode: getMessageNodeMock,
		messages: messagesMock,
	},
}))

vi.mock("@/pages/superMagic/services/askUserToolReplyService", () => ({
	sendUserToolCallReply: sendUserToolCallReplyMock,
}))

vi.mock("@/components/base/MagicToaster/utils", () => ({
	default: {
		error: vi.fn(),
	},
}))

vi.mock(
	"@/pages/superMagic/components/MessageList/components/Nodes/ToolCall/tools/DefaultTool",
	() => ({
		default: () => null,
	}),
)

vi.mock("../PlanDataModelFields", () => ({
	default: () => null,
}))

describe("MicroAppPlanToolCall streaming", () => {
	beforeEach(() => {
		messagesMock.clear()
		getMessageNodeMock.mockReset()
		sendUserToolCallReplyMock.mockReset()
		messagesMock.set("topic-1", [
			{
				app_message_id: "assistant-app-message-1",
				super_message_id: "assistant-super-message-1",
			},
		])
		getMessageNodeMock.mockImplementation((messageId?: string) => {
			if (messageId !== "assistant-super-message-1") return undefined
			return {
				task_id: "task-1",
				tool_calls: [{ id: "plan-1" }],
			}
		})
	})

	it("renders partial content and enables actions only after arguments are complete", async () => {
		const selectedTopic = {
			chat_conversation_id: "conversation-1",
			chat_topic_id: "topic-1",
		}
		const { rerender } = render(
			<MicroAppPlanToolCall
				loading
				selectedTopic={selectedTopic}
				toolData={{
					id: "plan-1",
					name: "micro_app_plan",
					rawArguments:
						'{"plan_title":"流式计划","requirements":["第一项","正在生成的第二',
				}}
			/>,
		)

		expect(await screen.findByText("流式计划")).toBeInTheDocument()
		expect(screen.getByText("正在生成的第二")).toBeInTheDocument()
		expect(screen.getByText("plan.status.generating")).toBeInTheDocument()
		expect(screen.getByTestId("plan-approve-button")).toBeDisabled()

		rerender(
			<MicroAppPlanToolCall
				loading
				selectedTopic={selectedTopic}
				toolData={{
					id: "plan-1",
					name: "micro_app_plan",
					rawArguments: JSON.stringify({
						plan_title: "流式计划",
						requirements: ["第一项", "完整的第二项"],
					}),
				}}
			/>,
		)

		await waitFor(() => {
			expect(screen.getByText("完整的第二项")).toBeInTheDocument()
			expect(screen.getByText("plan.status.pending")).toBeInTheDocument()
			expect(screen.getByTestId("plan-approve-button")).toBeEnabled()
		})
	})

	it("keeps pending plan actions enabled after transport loading finishes", async () => {
		render(
			<MicroAppPlanToolCall
				loading={false}
				selectedTopic={{
					chat_conversation_id: "conversation-1",
					chat_topic_id: "topic-1",
				}}
				toolData={{
					id: "plan-1",
					name: "micro_app_plan",
					rawArguments: JSON.stringify({
						plan_title: "刷新后的待确认计划",
						status: "pending",
					}),
				}}
			/>,
		)

		expect(await screen.findByText("刷新后的待确认计划")).toBeInTheDocument()
		const approveButton = screen.getByTestId("plan-approve-button")
		expect(approveButton).toBeEnabled()

		fireEvent.click(approveButton)

		await waitFor(() => {
			expect(sendUserToolCallReplyMock).toHaveBeenCalledWith(
				expect.objectContaining({
					conversationId: "conversation-1",
					topicId: "topic-1",
					toolCallId: "plan-1",
					detail: expect.objectContaining({ task_id: "task-1" }),
				}),
			)
		})
	})
})
