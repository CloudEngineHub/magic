import type { ReactNode } from "react"
import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

import MicroAppConversationFloatingButton from "../MicroAppConversationFloatingButton"
import MicroAppTopicPicker from "../MicroAppTopicPicker"
import MicroAppMobileConversation from ".."

vi.mock("react-i18next", () => ({
	initReactI18next: { type: "3rdParty", init: vi.fn() },
	useTranslation: () => ({
		t: (key: string, options?: { count?: number }) =>
			options?.count == null ? key : `${key}:${options.count}`,
	}),
}))

vi.mock("@/components/base-mobile/MagicPopup", () => ({
	default: ({
		children,
		visible,
		position,
	}: {
		children: ReactNode
		visible?: boolean
		position?: string
	}) =>
		visible ? (
			<div data-testid="micro-app-topic-popup" data-position={position}>
				{children}
			</div>
		) : null,
}))

vi.mock("@/pages/superMagicMobile/components/icons/mobile-resource-type-icon", () => ({
	MobileResourceTypeIcon: () => <span data-testid="topic-status" />,
}))

vi.mock("@/pages/superMagic/components/MessageList", () => ({
	default: ({ fallbackRender }: { fallbackRender?: ReactNode }) => (
		<div data-testid="mobile-message-list">{fallbackRender}</div>
	),
	MessageListProvider: ({ children }: { children: ReactNode }) => children,
}))

vi.mock("@/pages/superMagic/components/ProjectPageInputContainer", () => ({
	default: ({
		showModeToggle,
		showModelSelector,
		modelTopicMode,
	}: {
		showModeToggle?: boolean
		showModelSelector?: boolean
		modelTopicMode?: string
	}) => (
		<div
			data-testid="mobile-project-input"
			data-show-mode-toggle={showModeToggle}
			data-show-model-selector={showModelSelector}
			data-model-topic-mode={modelTopicMode}
		/>
	),
}))

vi.mock("@/pages/superMagic/hooks/useRefreshTopicDetailOnTaskComplete", () => ({
	useRefreshTopicDetailOnTaskComplete: vi.fn(),
}))

vi.mock("@/pages/superMagic/hooks/useTopicMessages", () => ({
	useTopicMessages: () => ({
		handlePullMoreMessage: vi.fn(),
		isMessagesInitialLoading: false,
		isSelectedTopicMessagesReady: true,
	}),
}))

vi.mock("@/pages/superMagic/hooks/useScopedTopicReadProgress", () => ({
	useScopedTopicReadProgress: () => ({ handleTopicMessagesChange: vi.fn() }),
}))

vi.mock("@/pages/superMagic/hooks/useTopicConversationLoading", () => ({
	useTopicConversationLoading: () => ({ messages: [], showLoading: false }),
}))

vi.mock("@/pages/superMagic/hooks/useInterruptAndUndoMessage", () => ({
	useInterruptAndUndoMessage: vi.fn(),
}))

vi.mock("@/models/user", () => ({
	userStore: { user: { userInfo: null } },
}))

vi.mock("@/apis", () => ({
	SuperMagicApi: { getTopicDetail: vi.fn() },
}))

describe("MicroApp mobile conversation controls", () => {
	it("opens conversation from the floating button", () => {
		const onClick = vi.fn()
		render(<MicroAppConversationFloatingButton onClick={onClick} />)

		fireEvent.click(screen.getByTestId("micro-app-mobile-conversation-button"))

		expect(onClick).toHaveBeenCalledOnce()
		expect(screen.getByLabelText("microAppPage.mobileConversation.open")).toBeInTheDocument()
	})

	it("shows topics in a bottom popup and switches the selected topic", () => {
		const onSelect = vi.fn()
		const topics = [
			{ id: "topic-1", topic_name: "需求讨论" },
			{ id: "topic-2", topic_name: "实现细节" },
		] as never

		render(
			<MicroAppTopicPicker
				open
				topics={topics}
				selectedTopicId="topic-1"
				onSelect={onSelect}
				onClose={vi.fn()}
			/>,
		)

		expect(screen.getByTestId("micro-app-topic-popup")).toHaveAttribute(
			"data-position",
			"bottom",
		)
		expect(screen.getByText("microAppPage.mobileConversation.topicCount:2")).toBeInTheDocument()

		fireEvent.click(screen.getByTestId("micro-app-mobile-topic-topic-2"))
		expect(onSelect).toHaveBeenCalledWith(topics[1])
	})

	it("uses default message styling and hides the employee selector", () => {
		const topicStore = {
			selectedTopic: { id: "topic-1", topic_name: "需求讨论" },
			topics: [],
			setSelectedTopic: vi.fn(),
			updateTopic: vi.fn(),
		} as never

		render(
			<MicroAppMobileConversation
				open
				selectedProject={{ id: "project-1", project_name: "微应用" } as never}
				topicStore={topicStore}
				mentionPanelStore={{} as never}
				projectFilesStore={{} as never}
				attachments={[]}
				onOpenFile={vi.fn()}
				onOpenChange={vi.fn()}
			/>,
		)

		expect(screen.getByTestId("mobile-project-input")).toHaveAttribute(
			"data-show-mode-toggle",
			"false",
		)
		expect(screen.getByTestId("mobile-project-input")).toHaveAttribute(
			"data-show-model-selector",
			"true",
		)
		expect(screen.getByTestId("mobile-project-input")).toHaveAttribute(
			"data-model-topic-mode",
			"default",
		)
		expect(screen.getByTestId("mobile-message-list")).toBeInTheDocument()
		expect(
			screen.getByTestId("micro-app-mobile-conversation-empty-illustration"),
		).toHaveAttribute("data-state", "conversation-empty")
	})
})
