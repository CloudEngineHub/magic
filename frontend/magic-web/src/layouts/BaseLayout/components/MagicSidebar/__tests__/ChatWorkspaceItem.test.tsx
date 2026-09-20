import { createRef, forwardRef, useImperativeHandle, useEffect, type ReactNode } from "react"
import { act, fireEvent, render, screen } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { sidebarStore } from "@/stores/layout/SidebarStore"
import ChatWorkspaceItem, { type ChatWorkspaceItemHandle } from "../ChatWorkspaceItem"

const { mountList, createChat, refreshChats } = vi.hoisted(() => ({
	mountList: vi.fn(),
	createChat: vi.fn().mockResolvedValue(undefined),
	refreshChats: vi.fn().mockResolvedValue(undefined),
}))

vi.mock("react-i18next", () => ({
	useTranslation: () => ({ t: (key: string) => key }),
}))
vi.mock("../ChatsSubMenu", () => ({
	default: forwardRef(function ChatList(
		{ active, searchKeyword }: { active: boolean; searchKeyword: string },
		ref,
	) {
		useImperativeHandle(ref, () => ({ create: createChat, refresh: refreshChats }), [])
		useEffect(() => {
			mountList()
		}, [])
		return (
			<div data-testid="conversation-list" data-active={active} data-search={searchKeyword} />
		)
	}),
}))
vi.mock("@/components/base/MagicTooltip", () => ({
	default: ({ children }: { children: ReactNode }) => children,
}))

describe("ChatWorkspaceItem", () => {
	beforeEach(() => {
		sidebarStore.setWorkspaceExpanded("sidebar-my-chats", false)
		vi.clearAllMocks()
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

	it("searches a collapsed workspace and restores its expansion when cleared", () => {
		const { rerender } = render(<ChatWorkspaceItem active searchKeyword="roadmap" />)
		expect(screen.getByTestId("conversation-list")).toBeVisible()
		expect(screen.getByTestId("conversation-list")).toHaveAttribute("data-search", "roadmap")
		rerender(<ChatWorkspaceItem active searchKeyword="" />)
		expect(screen.getByTestId("conversation-list")).not.toBeVisible()
		expect(screen.getByTestId("conversation-list")).toHaveAttribute("data-search", "")
	})

	it("creates from the header even before the list was opened", () => {
		render(<ChatWorkspaceItem active />)
		fireEvent.click(screen.getByTestId("sidebar-my-chats-add"))
		expect(createChat).toHaveBeenCalledTimes(1)
		expect(screen.getByTestId("sidebar-my-chats-toggle")).toHaveAttribute(
			"aria-expanded",
			"true",
		)
	})

	it("refreshes an already loaded collapsed list through the shared controls", async () => {
		const ref = createRef<ChatWorkspaceItemHandle>()
		render(<ChatWorkspaceItem ref={ref} active />)
		await act(async () => {
			await ref.current?.refresh()
		})
		expect(refreshChats).not.toHaveBeenCalled()
		fireEvent.click(screen.getByTestId("sidebar-my-chats-toggle"))
		fireEvent.click(screen.getByTestId("sidebar-my-chats-toggle"))
		await act(async () => {
			await ref.current?.refresh()
		})
		expect(refreshChats).toHaveBeenCalledTimes(1)
	})
})
