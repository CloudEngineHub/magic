import { render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import type { ChatConversationListItem } from "@/pages/superMagicMobile/pages/ChatsPage/hooks/useChatConversationList"
import ChatConversationSubMenuRow from "../ChatConversationSubMenuRow"

vi.mock("react-i18next", () => ({
	useTranslation: () => ({
		t: (key: string) => key,
	}),
}))

vi.mock("@/components/shadcn-ui/dropdown-menu", () => ({
	DropdownMenu: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
	DropdownMenuTrigger: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
	DropdownMenuContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
	DropdownMenuItem: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
	DropdownMenuSeparator: () => <hr />,
}))

/** Builds a minimal chat row fixture with fictional ids and titles for unit tests. */
function createListItem(
	overrides: Partial<ChatConversationListItem> = {},
): ChatConversationListItem {
	return {
		id: "chat-project-alpha",
		title: "Mock conversation alpha",
		timeLabel: "2 minutes ago",
		isPinned: false,
		isRunning: false,
		project: { id: "chat-project-alpha" } as ChatConversationListItem["project"],
		...overrides,
	}
}

const defaultRowProps = {
	moreAriaLabel: "More actions",
	renameLabel: "Rename",
	saveAsLabel: "Save as project",
	deleteLabel: "Delete",
	onOpen: vi.fn(),
	onMenuOpenChange: vi.fn(),
	onRename: vi.fn(),
	onSaveAsProject: vi.fn(),
	onDelete: vi.fn(),
}

describe("ChatConversationSubMenuRow", () => {
	it("does not mark an unselected row as selected", () => {
		render(
			<ChatConversationSubMenuRow
				item={createListItem()}
				isSelected={false}
				{...defaultRowProps}
			/>,
		)

		const row = screen.getByTestId("sidebar-chats-submenu-item-chat-project-alpha")
		expect(row).toHaveAttribute("data-selected", "false")
		expect(row).not.toHaveClass("bg-sidebar-accent")
	})

	it("applies selected styling when isSelected is true", () => {
		render(
			<ChatConversationSubMenuRow item={createListItem()} isSelected {...defaultRowProps} />,
		)

		const row = screen.getByTestId("sidebar-chats-submenu-item-chat-project-alpha")
		expect(row).toHaveAttribute("data-selected", "true")
		expect(row).toHaveClass("bg-sidebar-accent")
		expect(screen.getByText("Mock conversation alpha")).toHaveClass(
			"text-sidebar-accent-foreground",
		)
	})
})
