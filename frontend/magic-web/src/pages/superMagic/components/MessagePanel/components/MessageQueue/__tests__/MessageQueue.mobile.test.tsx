import { fireEvent, render, screen, within } from "@testing-library/react"
import type { JSONContent } from "@tiptap/core"
import { describe, expect, it, vi } from "vitest"

import MessageQueue from "../index"
import type { QueuedMessage } from "../../../hooks/useMessageQueue"

vi.mock("../components/CollapsibleText", () => ({
	default: ({ content }: { content: JSONContent | string }) => (
		<div data-testid="mock-collapsible-text">
			{typeof content === "string" ? content : JSON.stringify(content)}
		</div>
	),
}))

vi.mock("react-i18next", () => ({
	useTranslation: () => ({
		t: (key: string, values?: Record<string, number>) => {
			const translations: Record<string, string> = {
				"messageQueue.mobile.title": "队列中",
				"messageQueue.mobile.count": `${values?.count ?? 0} 条`,
				"messageQueue.mobile.emptyContent": "⋯",
				"messageQueue.editMessage": "编辑消息",
				"messageQueue.exitEdit": "退出编辑",
				"messageQueue.submitNow": "立即发送",
				"messageQueue.removeFromQueue": "从队列移除",
			}
			return translations[key] ?? key
		},
	}),
}))

/** Build a minimal TipTap document so queue preview tests exercise the real text serializer. */
function createTextContent(text: string): JSONContent {
	return {
		type: "doc",
		content: [
			{
				type: "paragraph",
				content: [{ type: "text", text }],
			},
		],
	}
}

/** Create a synthetic queue item with fictional identifiers for UI-only assertions. */
function createQueueItem(id: string, text: string): QueuedMessage {
	return {
		id,
		content: createTextContent(text),
		mentionItems: [],
		timestamp: 1000,
		status: "pending",
	}
}

/** Build a mention-only document to verify mobile fallback preview text. */
function createMentionContent(type: string, data: Record<string, unknown>): JSONContent {
	return {
		type: "doc",
		content: [
			{
				type: "paragraph",
				content: [
					{
						type: "mention",
						attrs: { type, data },
					},
				],
			},
		],
	}
}

const queueStats = {
	total: 3,
	pending: 3,
	processing: 0,
	failed: 0,
}

describe("MessageQueue mobile variant", () => {
	it("renders prototype-like shell and keeps three items collapsed by default", () => {
		render(
			<MessageQueue
				variant="mobile"
				queue={[
					createQueueItem("queue-item-alpha", "Mock queued task alpha"),
					createQueueItem("queue-item-beta", "Mock queued task beta"),
					createQueueItem("queue-item-gamma", "Mock queued task gamma"),
				]}
				queueStats={queueStats}
				editingQueueItem={null}
				onRemoveMessage={vi.fn()}
				onSendMessage={vi.fn()}
				onStartEdit={vi.fn()}
				onCancelEdit={vi.fn()}
			/>,
		)

		const root = screen.getByTestId("mobile-message-queue")
		expect(root.className).toContain("rounded-3xl")
		expect(root.className).toContain("bg-card")
		expect(screen.getByText("队列中")).toBeInTheDocument()
		expect(screen.getByText("· 3 条")).toBeInTheDocument()
		expect(screen.queryByText("Mock queued task alpha")).not.toBeInTheDocument()
	})

	it("expands rows with prototype action order and invokes original handlers", () => {
		const onStartEdit = vi.fn()
		const onSendMessage = vi.fn()
		const onRemoveMessage = vi.fn()

		render(
			<MessageQueue
				variant="mobile"
				queue={[
					createQueueItem("queue-item-alpha", "Mock queued task alpha"),
					createQueueItem("queue-item-beta", "Mock queued task beta"),
					createQueueItem("queue-item-gamma", "Mock queued task gamma"),
				]}
				queueStats={queueStats}
				editingQueueItem={null}
				onRemoveMessage={onRemoveMessage}
				onSendMessage={onSendMessage}
				onStartEdit={onStartEdit}
				onCancelEdit={vi.fn()}
			/>,
		)

		fireEvent.click(screen.getByTestId("mobile-message-queue-toggle"))

		const rows = screen.getAllByTestId("mobile-message-queue-item")
		expect(rows).toHaveLength(3)

		const firstRow = rows.find((row) => row.textContent?.includes("Mock queued task alpha"))
		expect(firstRow).toBeTruthy()

		const rowScope = within(firstRow as HTMLElement)
		const actions = [
			rowScope.getByTestId("mobile-message-queue-edit-button"),
			rowScope.getByTestId("mobile-message-queue-send-button"),
			rowScope.getByTestId("mobile-message-queue-remove-button"),
		]
		expect(actions.map((button) => button.getAttribute("aria-label"))).toEqual([
			"编辑消息",
			"立即发送",
			"从队列移除",
		])

		fireEvent.click(actions[0])
		fireEvent.click(actions[1])
		fireEvent.click(actions[2])

		expect(onStartEdit).toHaveBeenCalledWith("queue-item-alpha")
		expect(onSendMessage).toHaveBeenCalledWith("queue-item-alpha")
		expect(onRemoveMessage).toHaveBeenCalledWith("queue-item-alpha")
	})

	it("keeps one or two queued messages expanded by default", () => {
		render(
			<MessageQueue
				variant="mobile"
				queue={[
					createQueueItem("queue-item-alpha", "Mock queued task alpha"),
					createQueueItem("queue-item-beta", "Mock queued task beta"),
				]}
				queueStats={{
					total: 2,
					pending: 2,
					processing: 0,
					failed: 0,
				}}
				editingQueueItem={null}
				onRemoveMessage={vi.fn()}
				onSendMessage={vi.fn()}
				onStartEdit={vi.fn()}
				onCancelEdit={vi.fn()}
			/>,
		)

		expect(screen.getByText("Mock queued task alpha")).toBeInTheDocument()
		expect(screen.getByText("Mock queued task beta")).toBeInTheDocument()
	})

	it("disables cancel editing while the edited queue item is saving", () => {
		const onCancelEdit = vi.fn()
		const editingItem = {
			...createQueueItem("queue-item-alpha", "Mock queued task alpha"),
			isEditingLoading: true,
		}

		render(
			<MessageQueue
				variant="mobile"
				queue={[editingItem]}
				queueStats={{
					total: 1,
					pending: 1,
					processing: 0,
					failed: 0,
				}}
				editingQueueItem={editingItem}
				onRemoveMessage={vi.fn()}
				onSendMessage={vi.fn()}
				onStartEdit={vi.fn()}
				onCancelEdit={onCancelEdit}
			/>,
		)

		const cancelButton = screen.getByTestId("mobile-message-queue-cancel-edit-button")
		expect(cancelButton).toBeDisabled()
		expect(screen.getByTestId("mobile-message-queue-editing-loading")).toBeInTheDocument()

		fireEvent.click(cancelButton)
		expect(onCancelEdit).not.toHaveBeenCalled()
	})

	it("shows mention fallback preview text when mention data has no display name", () => {
		render(
			<MessageQueue
				variant="mobile"
				queue={[
					{
						...createQueueItem("queue-item-alpha", ""),
						content: createMentionContent("project_file", {}),
					},
				]}
				queueStats={{
					total: 1,
					pending: 1,
					processing: 0,
					failed: 0,
				}}
				editingQueueItem={null}
				onRemoveMessage={vi.fn()}
				onSendMessage={vi.fn()}
				onStartEdit={vi.fn()}
				onCancelEdit={vi.fn()}
			/>,
		)

		expect(screen.getByText("@File")).toBeInTheDocument()
	})
})
