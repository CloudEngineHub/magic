import { fireEvent, render, screen } from "@testing-library/react"
import type { ReactNode } from "react"
import { describe, expect, it, vi } from "vitest"

const { setTopStatusMock, closeMenuMock } = vi.hoisted(() => ({
	setTopStatusMock: vi.fn(),
	closeMenuMock: vi.fn(),
}))

vi.mock("react-i18next", () => ({
	useTranslation: () => ({
		t: (key: string) => key,
	}),
}))

vi.mock("@/components/base/MagicButton", () => ({
	default: ({ children, onClick }: { children: ReactNode; onClick?: () => void }) => (
		<button type="button" onClick={onClick}>
			{children}
		</button>
	),
}))

vi.mock("@/components/base/MagicIcon", () => ({
	default: () => null,
}))

vi.mock("@/stores/chatNew/conversation", () => ({
	default: {
		conversations: {
			"conversation-pinned": { is_top: 1 },
			"conversation-normal": { is_top: 0 },
		},
	},
}))

vi.mock("@/services/chat/conversation/ConversationService", () => ({
	default: {
		setTopStatus: setTopStatusMock,
	},
}))

vi.mock("@/stores/chatNew/chatMenu", () => ({
	default: {
		closeMenu: closeMenuMock,
	},
}))

import TopConversationButton from "../TopConversationButton"

describe("TopConversationButton", () => {
	it("pins a normal conversation when clicked", () => {
		render(<TopConversationButton conversationId="conversation-normal" />)

		fireEvent.click(screen.getByRole("button", { name: "chat.floatButton.topConversation" }))

		expect(setTopStatusMock).toHaveBeenCalledWith("conversation-normal", 1)
		expect(closeMenuMock).toHaveBeenCalled()
	})

	it("unpinns a pinned conversation when clicked", () => {
		render(<TopConversationButton conversationId="conversation-pinned" />)

		fireEvent.click(
			screen.getByRole("button", { name: "chat.floatButton.cancelTopConversation" }),
		)

		expect(setTopStatusMock).toHaveBeenCalledWith("conversation-pinned", 0)
		expect(closeMenuMock).toHaveBeenCalled()
	})
})
