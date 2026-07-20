import { render, screen } from "@testing-library/react"
import { Suspense } from "react"
import { describe, expect, it, vi } from "vitest"
import { ToolCall } from "../ToolCall"

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

vi.mock("@/pages/superMagic/stores", () => ({
	superMagicStore: {
		toolResponseMap: new Map(),
	},
}))

vi.mock("@/utils/pubsub", () => ({
	default: {
		publish: vi.fn(),
	},
	PubSubEvents: {},
}))

vi.mock("../tools/microAppPlan", () => ({
	default: () => <span>micro app plan</span>,
}))

vi.mock("../tools/askUser", () => ({
	default: () => null,
}))

vi.mock("../tools/DefaultTool", () => ({
	default: () => <span>default tool</span>,
}))

vi.mock("../tools/WriteFile", () => ({
	default: () => null,
}))

vi.mock("../tools/MCPTool", () => ({
	MCPTool: () => null,
}))

function renderTool(toolName: string) {
	return render(
		<Suspense fallback={null}>
			<ToolCall
				topicId="topic-1"
				correlationId="corr-1"
				toolCall={{
					id: "tool-1",
					type: "function",
					function: {
						name: toolName,
						label: toolName,
						arguments: "{}",
					},
				}}
			/>
		</Suspense>,
	)
}

describe("ToolCall micro-app plan routing", () => {
	it("renders the plan card only for micro_app_plan", async () => {
		const { unmount } = renderTool("micro_app_plan")

		expect(await screen.findByText("micro app plan")).toBeInTheDocument()
		unmount()

		renderTool("plan")

		expect(await screen.findByText("default tool")).toBeInTheDocument()
	})
})
