import { render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import MessageNode from "../index"

const messageNode = vi.hoisted(() => ({
	role: "assistant",
	content: "",
	reasoning_content: "",
	attachments: [],
	tool_calls: [
		{
			function: {
				name: "read_file",
				arguments: '{"path":"missing-id.txt"}',
			},
		},
		{
			id: "tool-missing-name",
			function: {
				name: "",
				arguments: '{"path":"ghost.txt"}',
			},
		},
		{
			id: "tool-valid",
			type: "function",
			function: {
				name: "read_file",
				label: "读取文件",
				arguments: '{"path":"a.txt"}',
			},
		},
	],
}))

vi.mock("mobx-react-lite", () => ({
	observer: (component: unknown) => component,
}))

vi.mock("react-i18next", async (importOriginal) => {
	const actual = await importOriginal<typeof import("react-i18next")>()
	return {
		...actual,
		useTranslation: () => ({
			t: (key: string) => key,
		}),
	}
})

vi.mock("@/pages/superMagic/stores", () => ({
	superMagicStore: {
		getMessageNode: () => messageNode,
		getStreamState: () => undefined,
	},
}))

vi.mock("../tool-call/ToolCallContainer", () => ({
	ToolCallContainer: ({ toolCall }: { toolCall: { id?: string } }) => (
		<div data-testid={`tool-${toolCall.id || "missing"}`} />
	),
}))

vi.mock("@/stores/projectFiles", () => ({
	default: {
		workspaceFilesList: [],
		workspaceFileTree: [],
	},
}))

vi.mock("@/pages/superMagic/components/MessageList/components/Text/components/Markdown", () => ({
	default: () => null,
}))

describe("MessageNode tool filtering", () => {
	it("does not render tool calls without a stable id and function name", () => {
		render(
			<MessageNode
				node={{
					app_message_id: "assistant-1",
					correlation_id: "corr-1",
					topic_id: "topic-1",
				}}
				selectedTopic={null}
			/>,
		)

		expect(screen.queryByTestId("tool-missing")).not.toBeInTheDocument()
		expect(screen.queryByTestId("tool-tool-missing-name")).not.toBeInTheDocument()
		expect(screen.getByTestId("tool-tool-valid")).toBeInTheDocument()
	})
})
