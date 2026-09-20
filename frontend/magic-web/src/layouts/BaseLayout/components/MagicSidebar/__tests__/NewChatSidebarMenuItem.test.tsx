import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import type { ReactNode } from "react"
import { describe, expect, it, vi } from "vitest"
import NewChatSidebarMenuItem from "../NewChatSidebarMenuItem"

const {
	createProject,
	ensureWorkspace,
	switchChatProject,
	invalidateChatList,
	resolveProjectMode,
} = vi.hoisted(() => ({
	createProject: vi
		.fn()
		.mockResolvedValue({ project: { id: "chat-project" }, topic: { id: "topic" } }),
	ensureWorkspace: vi.fn().mockResolvedValue({ id: "chat-workspace" }),
	switchChatProject: vi.fn().mockResolvedValue(undefined),
	invalidateChatList: vi.fn(),
	resolveProjectMode: vi.fn().mockReturnValue("default"),
}))

vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }))
vi.mock("mobx-react-lite", () => ({ observer: (component: unknown) => component }))
vi.mock("@/components/shadcn-ui/sidebar", () => ({
	SidebarMenuItem: ({ children }: { children: ReactNode }) => <div>{children}</div>,
	SidebarMenuButton: ({
		children,
		...props
	}: { children: ReactNode } & Record<string, unknown>) => <button {...props}>{children}</button>,
}))
vi.mock("@/pages/superMagic/hooks/useChatWorkspace", () => ({
	useChatWorkspace: () => ({
		chatWorkspace: null,
		createProjectInChatWorkspace: createProject,
		ensureChatWorkspace: ensureWorkspace,
	}),
}))
vi.mock("@/pages/superMagic/stores", () => ({ roleStore: { currentRole: "role" } }))
vi.mock("@/services/superMagic/DefaultAgentSelectionService", () => ({
	resolveProjectModeForCreate: resolveProjectMode,
}))
vi.mock("@/pages/superMagic/services", () => ({ default: { switchChatProject } }))
vi.mock("@/pages/superMagic/services/chatConversationListInvalidation", () => ({
	invalidateChatConversationList: invalidateChatList,
}))
vi.mock("@/components/base/MagicToaster/utils", () => ({ default: { error: vi.fn() } }))

describe("NewChatSidebarMenuItem", () => {
	it("creates a conversation and invalidates mounted sidebar lists", async () => {
		const onSelect = vi.fn()
		render(<NewChatSidebarMenuItem collapsed={false} onSelect={onSelect} />)

		const button = screen.getByTestId("sidebar-content-new-chat-button")
		expect(button).toHaveTextContent("sidebar:chats.newChat")
		fireEvent.click(button)

		await waitFor(() => expect(switchChatProject).toHaveBeenCalled())
		expect(resolveProjectMode).toHaveBeenCalledWith("role")
		expect(createProject).toHaveBeenCalledWith({ projectMode: "default" })
		expect(ensureWorkspace).toHaveBeenCalledTimes(1)
		expect(invalidateChatList).toHaveBeenCalledTimes(1)
		expect(onSelect).toHaveBeenCalledTimes(1)
	})
})
