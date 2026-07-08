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

	it("applies focus-reset classes to the detail more trigger", () => {
		render(
			<ChatConversationMoreMenu
				actions={[{ key: "pinProject", label: "Pin", onClick: vi.fn() }]}
			/>,
		)

		expect(screen.getByTestId("chat-conversation-more-button")).toHaveClass(
			"focus:!border-transparent",
			"focus:!bg-transparent",
			"focus:!outline-none",
			"focus:!ring-0",
			"focus-visible:!border-transparent",
			"focus-visible:!outline-none",
			"focus-visible:!ring-0",
			"active:!bg-transparent",
		)
	})
})
