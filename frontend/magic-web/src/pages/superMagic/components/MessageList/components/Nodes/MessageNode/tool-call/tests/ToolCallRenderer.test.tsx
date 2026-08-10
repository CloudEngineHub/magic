import { render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { ToolCallRenderer } from "../ToolCallRenderer"
import type { ToolCallItem, ToolCallViewModel } from "../types"

vi.mock("../tools/Default", () => ({
	default: () => <div data-testid="default-tool" />,
}))

vi.mock("../tools/KnowledgeSearch", () => ({
	default: () => <div data-testid="knowledge-search-tool" />,
}))

vi.mock("../tools/WriteFile", () => ({
	default: () => <div data-testid="write-file-tool" />,
}))

vi.mock("../tools/MCP", () => ({
	MCPTool: () => <div data-testid="mcp-tool" />,
}))

vi.mock("../tools/AskUser", () => ({
	default: () => <div data-testid="ask-user-tool" />,
}))

vi.mock("../tools/MicroAppPlan", () => ({
	default: () => <div data-testid="micro-app-plan-tool" />,
}))

function createToolCall(name: string): ToolCallItem {
	return {
		id: `tool-${name}`,
		type: "function",
		function: {
			name,
			label: name,
			arguments: "{}",
		},
	}
}

function createToolData(name: string): ToolCallViewModel {
	return {
		id: `tool-${name}`,
		name,
		action: name,
		attachments: [],
	}
}

function renderTool(toolCall: ToolCallItem, toolData = createToolData(toolCall.function.name)) {
	return render(
		<ToolCallRenderer
			topicId="topic-1"
			correlationId="correlation-1"
			toolCall={toolCall}
			toolData={toolData}
			loading={false}
			onClick={vi.fn()}
		/>,
	)
}

describe("ToolCallRenderer", () => {
	it("selects the MCP renderer from the protocol wrapper name", () => {
		const toolCall = createToolCall("remote_method")
		toolCall.tool = { name: "mcp_tool_call" }

		renderTool(toolCall)

		expect(screen.getByTestId("mcp-tool")).toBeInTheDocument()
	})

	it("selects the ask-user renderer", async () => {
		renderTool(createToolCall("ask_user"))

		expect(await screen.findByTestId("ask-user-tool")).toBeInTheDocument()
	})

	it("selects the micro-app plan renderer only for micro_app_plan", async () => {
		const { unmount } = renderTool(createToolCall("micro_app_plan"))

		expect(await screen.findByTestId("micro-app-plan-tool")).toBeInTheDocument()
		unmount()

		renderTool(createToolCall("plan"))

		expect(screen.getByTestId("default-tool")).toBeInTheDocument()
	})

	it("selects the write-file renderer", () => {
		renderTool(createToolCall("write_file"))

		expect(screen.getByTestId("write-file-tool")).toBeInTheDocument()
	})

	it("selects the knowledge-search renderer from normalized detail", () => {
		const toolCall = createToolCall("legacy_knowledge_tool")
		const toolData = {
			...createToolData(toolCall.function.name),
			detail: { type: "knowledge_search" },
		}

		renderTool(toolCall, toolData)

		expect(screen.getByTestId("knowledge-search-tool")).toBeInTheDocument()
	})

	it("keeps unknown tools on the default renderer", () => {
		renderTool(createToolCall("unknown_tool"))

		expect(screen.getByTestId("default-tool")).toBeInTheDocument()
	})
})
