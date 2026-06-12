import { render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { ChatConversationMoreMenu } from "../ChatConversationMoreMenu"

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
	DropdownMenuSeparator: (props: React.ComponentProps<"hr">) => <hr {...props} />,
}))

/**
 * Verifies destructive conversation actions stay visually isolated from regular actions.
 */
describe("ChatConversationMoreMenu", () => {
	it("renders a separator before the delete group", () => {
		render(
			<ChatConversationMoreMenu
				actions={[
					{ key: "share-topic", label: "Share", onClick: vi.fn() },
					{ key: "rename", label: "Rename", onClick: vi.fn() },
					{ key: "delete", label: "Delete", onClick: vi.fn(), variant: "danger" },
				]}
			/>,
		)

		const separator = screen.getByTestId("chat-conversation-more-delete-separator")
		expect(separator).toBeInTheDocument()
		expect(separator).toHaveClass("-mx-1", "my-1", "bg-border")
		expect(screen.getByText("Delete")).toBeInTheDocument()
	})
})
