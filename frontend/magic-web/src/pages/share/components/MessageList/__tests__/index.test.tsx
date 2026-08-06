import { render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { TaskStatus } from "@/pages/superMagic/pages/Workspace/types"
import type { VirtualMessageItem } from "@/pages/superMagic/components/MessageList/virtual-message-items"
import MessageList from "../index"

vi.mock("@/pages/superMagic/components/MessageList/components/Nodes", () => ({
	Node: ({ node }: { node: { super_message_id?: string } }) => (
		<div data-testid={`share-message-${node.super_message_id}`} />
	),
}))

vi.mock("@/pages/superMagic/components/MessageList/components/VirtualMessageList", () => ({
	VirtualMessageList: ({
		items,
		userIndices,
		renderNode,
	}: {
		items: VirtualMessageItem[]
		userIndices: number[]
		renderNode: (args: { item: VirtualMessageItem }) => React.ReactNode
	}) => (
		<div
			data-testid="share-virtual-message-list"
			data-item-count={items.length}
			data-user-indices={userIndices.join(",")}
		>
			{items.map((item) => (
				<div key={item.key}>{renderNode({ item })}</div>
			))}
		</div>
	),
}))

vi.mock("@/hooks/useIsMobile", () => ({ useIsMobile: () => false }))

vi.mock("../style", () => ({
	useStyles: () => ({ styles: { aiGeneratedTip: "ai-generated-tip" } }),
}))

vi.mock("react-i18next", async (importOriginal) => {
	const actual = await importOriginal<typeof import("react-i18next")>()
	return {
		...actual,
		useTranslation: () => ({ t: (key: string) => key }),
	}
})

describe("share MessageList", () => {
	it("uses the shared flat virtual path for every converted top-level message", () => {
		const scrollContainerRef = { current: document.createElement("div") }

		render(
			<MessageList
				topicId="share-topic"
				messageList={[
					{
						app_message_id: "user-1",
						super_message_id: "user-1",
						role: "user",
					},
					{
						app_message_id: "assistant-1",
						super_message_id: "assistant-1",
						role: "assistant",
					},
					{
						app_message_id: "tool-1",
						super_message_id: "tool-1",
						role: "tool",
					},
				]}
				onSelectDetail={vi.fn()}
				currentTopicStatus={TaskStatus.RUNNING}
				scrollContainerRef={scrollContainerRef}
			/>,
		)

		const virtualList = screen.getByTestId("share-virtual-message-list")
		expect(virtualList).toHaveAttribute("data-item-count", "3")
		expect(virtualList).toHaveAttribute("data-user-indices", "0")
		expect(screen.getByTestId("share-message-assistant-1")).toBeInTheDocument()
	})
})
