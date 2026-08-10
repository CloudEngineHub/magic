import { render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import MessageNode from "../index"

const finishTaskNode = vi.hoisted(() => ({
	role: "tool",
	task_id: "938538362815287296",
	content: "",
	reasoning_content: null,
	tool_calls: null,
	tool_call_id: "call_4d361d6c459b4a93b04767dd",
	attachments: [
		{
			display_filename: "business-impact.html",
			file_extension: "html",
			file_id: "938540442309406720",
			file_name: "business-impact.html",
			filename: "business-impact.html",
		},
	],
	tool: {
		id: "938540548324491266",
		name: "finish_task",
		status: "finished",
		detail: {
			type: "html",
			data: {
				file_id: "938539108248047617",
				file_name: "index.html",
			},
		},
	},
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
		getMessageNode: () => finishTaskNode,
		getStreamState: () => undefined,
	},
}))

vi.mock("@/pages/superMagic/components/MessageList/components/MessageAttachment", () => ({
	Attachment: ({ attachments }: { attachments: Array<{ filename?: string }> }) => (
		<div data-testid="finish-task-attachments">
			{attachments.map((attachment) => attachment.filename).join(",")}
		</div>
	),
}))

vi.mock("@/stores/projectFiles", () => ({
	default: {
		workspaceFilesList: [],
		workspaceFileTree: [],
	},
}))

vi.mock("@/components/base", () => ({
	MagicTooltip: ({ children }: { children: React.ReactNode }) => children,
	VerticalLine: () => null,
}))

vi.mock("@/pages/superMagic/components/MessageList/components/shared/ToolIconConfig", () => ({
	ToolIconBadge: () => null,
}))

vi.mock("@/pages/superMagic/components/MessageList/components/Text/components/Markdown", () => ({
	default: () => null,
}))

describe("MessageNode finish_task projection", () => {
	it("renders the real orphan finish_task attachment through the tool-message result branch", () => {
		render(
			<MessageNode
				node={{
					app_message_id: "938540548324491265",
					correlation_id: "4d361d6c-459b-4a93-b047-67dd99eedc96",
					topic_id: "topic-events",
				}}
				selectedTopic={null}
			/>,
		)

		expect(screen.getByTestId("finish-task-attachments")).toHaveTextContent(
			"business-impact.html",
		)
		expect(screen.queryByTestId("default-tool")).not.toBeInTheDocument()
	})
})
