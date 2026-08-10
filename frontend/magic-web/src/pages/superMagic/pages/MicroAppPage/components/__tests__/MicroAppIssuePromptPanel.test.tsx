import {
	cloneElement,
	createContext,
	isValidElement,
	useContext,
	type ReactElement,
	type ReactNode,
} from "react"
import { fireEvent, render, screen } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import MicroAppIssuePromptPanel from "../MicroAppIssuePromptPanel"

const { publishMock } = vi.hoisted(() => ({
	publishMock: vi.fn(),
}))

vi.mock("react-i18next", () => ({
	useTranslation: () => ({
		t: (key: string) => {
			const labels: Record<string, string> = {
				"microAppPage.issuePrompts.empty": "没有找到相关问题",
				"microAppPage.issuePrompts.featured": "常用问题",
				"microAppPage.issuePrompts.searchPlaceholder": "搜索你遇到的现象",
				"microAppPage.issuePrompts.subtitle": "选择你看到的现象",
				"microAppPage.issuePrompts.title": "常见问题",
				"microAppPage.issuePrompts.trigger": "常见问题",
			}
			return labels[key] ?? key
		},
		i18n: { language: "zh_CN", resolvedLanguage: "zh_CN" },
	}),
}))

vi.mock("@/utils/pubsub", () => ({
	default: { publish: publishMock },
	PubSubEvents: { Append_Suggestion_To_Editor: "Append_Suggestion_To_Editor" },
}))

vi.mock("@/components/base-mobile/MagicPopup", () => ({
	default: ({ children, visible }: { children: ReactNode; visible?: boolean }) =>
		visible ? <div data-testid="mobile-issue-popup">{children}</div> : null,
}))

vi.mock("@/components/shadcn-ui/popover", () => {
	const PopoverContext = createContext<{
		open: boolean
		onOpenChange: (open: boolean) => void
	} | null>(null)

	return {
		Popover: ({
			children,
			open,
			onOpenChange,
		}: {
			children: ReactNode
			open: boolean
			onOpenChange: (open: boolean) => void
		}) => (
			<PopoverContext.Provider value={{ open, onOpenChange }}>
				{children}
			</PopoverContext.Provider>
		),
		PopoverTrigger: ({ children }: { children: ReactNode }) => {
			const context = useContext(PopoverContext)
			if (!context || !isValidElement(children)) return children
			return cloneElement(children as ReactElement<{ onClick?: () => void }>, {
				onClick: () => context.onOpenChange(true),
			})
		},
		PopoverContent: ({ children }: { children: ReactNode }) => {
			const context = useContext(PopoverContext)
			return context?.open ? <div data-testid="desktop-issue-popover">{children}</div> : null
		},
	}
})

describe("MicroAppIssuePromptPanel", () => {
	beforeEach(() => {
		publishMock.mockReset()
	})

	it("opens the desktop library, searches by user symptom, and appends a repair prompt", () => {
		render(<MicroAppIssuePromptPanel variant="desktop" />)

		fireEvent.click(screen.getByTestId("micro-app-issue-prompts-trigger"))
		expect(screen.getByTestId("desktop-issue-popover")).toBeInTheDocument()
		expect(screen.getByTestId("micro-app-issue-prompt-page-blank")).toBeInTheDocument()

		fireEvent.change(screen.getByTestId("micro-app-issue-prompts-search"), {
			target: { value: "别人数据" },
		})
		fireEvent.click(screen.getByTestId("micro-app-issue-prompt-access-see-others-data"))

		expect(publishMock).toHaveBeenCalledOnce()
		expect(publishMock).toHaveBeenCalledWith(
			"Append_Suggestion_To_Editor",
			expect.stringContaining("我看到了不该看到的其他人数据"),
		)
		expect(screen.queryByTestId("desktop-issue-popover")).not.toBeInTheDocument()
	})

	it("opens the same issue library in a mobile bottom popup", () => {
		render(<MicroAppIssuePromptPanel variant="mobile" />)

		fireEvent.click(screen.getByTestId("micro-app-issue-prompts-trigger"))

		expect(screen.getByTestId("mobile-issue-popup")).toBeInTheDocument()
		expect(screen.getByTestId("micro-app-issue-prompt-page-blank")).toBeInTheDocument()
	})

	it("clears search when the user switches to a category", () => {
		render(<MicroAppIssuePromptPanel variant="desktop" />)

		fireEvent.click(screen.getByTestId("micro-app-issue-prompts-trigger"))
		const searchInput = screen.getByTestId("micro-app-issue-prompts-search")
		fireEvent.change(searchInput, { target: { value: "别人数据" } })
		fireEvent.click(screen.getByRole("button", { name: "页面显示" }))

		expect(searchInput).toHaveValue("")
		expect(screen.getByTestId("micro-app-issue-prompt-page-blank")).toBeInTheDocument()
	})
})
