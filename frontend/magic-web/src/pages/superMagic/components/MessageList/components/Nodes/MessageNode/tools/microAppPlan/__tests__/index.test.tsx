import { render, screen, waitFor } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import MicroAppPlanToolCall from "../index"

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
		getMessageNode: vi.fn(),
		messages: new Map(),
	},
}))

vi.mock("@/pages/superMagic/services/askUserToolReplyService", () => ({
	sendUserToolCallReply: vi.fn(),
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
})
