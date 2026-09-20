import { useEffect } from "react"
import { fireEvent, render, screen } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { sidebarStore } from "@/stores/layout/SidebarStore"
import ChatWorkspaceItem from "../ChatWorkspaceItem"

const { mountList } = vi.hoisted(() => ({ mountList: vi.fn() }))

vi.mock("react-i18next", () => ({
	useTranslation: () => ({ t: (key: string) => key }),
}))
vi.mock("../ChatsSubMenu", () => ({
	default: function ChatList({ active }: { active: boolean }) {
		useEffect(() => {
			mountList()
		}, [])
		return <div data-testid="conversation-list" data-active={active} />
	},
}))

describe("ChatWorkspaceItem", () => {
	beforeEach(() => {
		sidebarStore.setWorkspaceExpanded("sidebar-my-chats", false)
		mountList.mockClear()
	})

	it("loads on first expansion and keeps the same list when reopened", () => {
		render(<ChatWorkspaceItem active />)
		expect(mountList).not.toHaveBeenCalled()
		const toggle = screen.getByRole("button", { name: "chats.myChats" })
		fireEvent.click(toggle)
		expect(toggle).toHaveAttribute("aria-expanded", "true")
		expect(mountList).toHaveBeenCalledTimes(1)
		fireEvent.click(toggle)
		expect(screen.getByTestId("conversation-list")).not.toBeVisible()
		expect(screen.getByTestId("conversation-list")).toHaveAttribute("data-active", "false")
		fireEvent.click(toggle)
		expect(screen.getByTestId("conversation-list")).toBeVisible()
		expect(mountList).toHaveBeenCalledTimes(1)
	})

	it("does not load a persisted expanded workspace until spaces are visible", () => {
		sidebarStore.setWorkspaceExpanded("sidebar-my-chats", true)
		const { rerender } = render(<ChatWorkspaceItem active={false} />)
		expect(mountList).not.toHaveBeenCalled()
		rerender(<ChatWorkspaceItem active />)
		expect(mountList).toHaveBeenCalledTimes(1)
	})
})
