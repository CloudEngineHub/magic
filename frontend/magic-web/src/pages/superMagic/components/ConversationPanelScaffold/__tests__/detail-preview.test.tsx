import type { ReactNode } from "react"
import { render } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

import ConversationPanelScaffold from ".."

const messageListMocks = vi.hoisted(() => ({
	setSelectedDetail: undefined as ((detail: unknown) => void) | undefined,
}))

vi.mock("@/hooks/useIsMobile", () => ({
	useIsMobile: () => false,
}))

vi.mock("@/pages/superMagic/components/MessageList", () => ({
	default: ({ setSelectedDetail }: { setSelectedDetail?: (detail: unknown) => void }) => {
		messageListMocks.setSelectedDetail = setSelectedDetail
		return <div data-testid="message-list" />
	},
	MessageListProvider: ({ children }: { children: ReactNode }) => children,
}))

function EmptyState() {
	return <div />
}

describe("ConversationPanelScaffold detail preview", () => {
	it("forwards the detail selection handler to the message list", () => {
		const setSelectedDetail = vi.fn()

		render(
			<ConversationPanelScaffold
				scope="test-conversation"
				emptyHero={<EmptyState />}
				emptyCompact={<div />}
				editor={<div />}
				messageListProviderValue={{} as never}
				messages={[{ id: "message-1", role: "assistant", type: "tool_call" }] as never}
				selectedTopic={{ id: "topic-1" } as never}
				setSelectedDetail={setSelectedDetail}
			/>,
		)

		expect(messageListMocks.setSelectedDetail).toBe(setSelectedDetail)
	})
})
