import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import SelfMediaShellHeader, { SelfMediaShellViewBar } from "../components/SelfMediaShellHeader"

const mockUseIsMobile = vi.hoisted(() => vi.fn(() => false))

vi.mock("react-i18next", () => ({
	useTranslation: () => ({
		t: (key: string, params?: { index?: number }) =>
			key === "detail.selfMedia.common.postFallbackTitle"
				? `Article ${params?.index ?? 1}`
				: key,
	}),
}))

vi.mock("@/components/shadcn-ui/tooltip", () => ({
	Tooltip: ({ children }: { children: React.ReactNode }) => <>{children}</>,
	TooltipContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
	TooltipTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))

vi.mock("@/hooks/use-mobile", () => ({
	useIsMobile: mockUseIsMobile,
}))

describe("SelfMediaShellHeader", () => {
	it("shows platform icon and full article title instead of switchers", () => {
		const onBackHome = vi.fn()

		render(
			<SelfMediaShellHeader
				platform="instagram"
				posts={[
					{
						meta: {
							id: "post-1",
							title: "Launch Notes",
							feedTitle: "Launch Feed",
						},
						cards: [],
					},
				]}
				activePostIndex={0}
				view="detail"
				tabLabels={{ detail: "Detail" }}
				visibleTabs={["detail"]}
				onChangeView={vi.fn()}
				onRefresh={vi.fn()}
				onBackHome={onBackHome}
				refreshLabel="Refresh"
				refreshTestId="shell-refresh"
			/>,
		)

		expect(screen.getByTestId("self-media-shell-platform-title")).toHaveTextContent(
			"Launch Notes",
		)
		expect(screen.getByTestId("self-media-shell-platform-title")).not.toHaveClass("truncate")
		expect(screen.getByTestId("self-media-shell-platform-icon")).toBeInTheDocument()
		const backButton = screen.getByTestId("self-media-shell-back-home-button")
		fireEvent.click(backButton)
		expect(onBackHome).toHaveBeenCalledTimes(1)
		expect(screen.queryByTestId("self-media-platform-switcher-host")).not.toBeInTheDocument()
		expect(screen.queryByTestId("self-media-post-selector")).not.toBeInTheDocument()
	})

	it("uses shadcn button primitives for the desktop toolbar", () => {
		render(
			<SelfMediaShellHeader
				platform="rednote"
				posts={[
					{
						meta: {
							id: "post-1",
							title: "Launch Notes",
						},
						cards: [],
					},
				]}
				activePostIndex={0}
				view="feed"
				tabLabels={{ feed: "Feed", detail: "Detail" }}
				visibleTabs={["feed", "detail"]}
				onChangeView={vi.fn()}
				onRefresh={vi.fn()}
				onBackHome={vi.fn()}
				refreshLabel="Refresh"
				refreshTestId="shell-refresh"
			/>,
		)

		expect(screen.getByTestId("self-media-shell-back-home-button")).toHaveAttribute(
			"data-slot",
			"button",
		)
		expect(screen.getByTestId("shell-refresh")).toHaveAttribute("data-slot", "button")
		expect(screen.queryByTestId("self-media-shell-tab-zone")).not.toBeInTheDocument()
	})

	it("uses the redesigned header and bottom tab style", () => {
		render(
			<>
				<SelfMediaShellHeader
					platform="rednote"
					posts={[
						{
							meta: {
								id: "post-1",
								title: "Launch Notes",
							},
							cards: [],
						},
					]}
					activePostIndex={0}
					view="detail"
					tabLabels={{ feed: "Home", detail: "Notes", scroll: "Long", edit: "Edit" }}
					visibleTabs={["feed", "detail", "scroll", "edit"]}
					onChangeView={vi.fn()}
					onRefresh={vi.fn()}
					onBackHome={vi.fn()}
					refreshLabel="Refresh"
					refreshTestId="shell-refresh"
					onOpenExport={vi.fn()}
					exportLabel="Export"
				/>
				<SelfMediaShellViewBar
					view="detail"
					tabLabels={{ feed: "Home", detail: "Notes", scroll: "Long", edit: "Edit" }}
					visibleTabs={["feed", "detail", "scroll", "edit"]}
					onChangeView={vi.fn()}
				/>
			</>,
		)

		expect(screen.getByTestId("self-media-shell-header")).toHaveClass("bg-transparent")
		expect(screen.getByTestId("self-media-shell-header")).not.toHaveClass("border-b")
		expect(screen.getByTestId("self-media-shell-header")).toHaveClass("flex", "flex-wrap")
		expect(screen.getByTestId("self-media-shell-title")).toHaveClass(
			"min-w-[20rem]",
			"basis-[24rem]",
			"flex-1",
		)
		expect(screen.getByTestId("self-media-shell-title")).toHaveClass(
			"max-sm:min-w-0",
			"max-sm:basis-auto",
		)
		expect(screen.getByTestId("self-media-shell-back-home-button")).toHaveClass(
			"rounded-[14px]",
		)
		expect(screen.getByTestId("self-media-shell-back-home-button")).toHaveClass("max-sm:size-9")
		expect(screen.getByTestId("self-media-shell-platform-icon-frame")).toHaveClass(
			"max-sm:hidden",
		)
		expect(screen.getByTestId("self-media-shell-mobile-platform-icon")).toHaveClass(
			"hidden",
			"max-sm:flex",
			"size-6",
		)
		expect(screen.getByTestId("self-media-shell-view-bar")).toHaveClass("shrink-0")
		expect(screen.getByTestId("self-media-shell-view-bar")).toHaveClass("max-sm:py-1.5")
		expect(screen.getByTestId("self-media-shell-view-bar")).not.toHaveClass("absolute")
		expect(screen.getByTestId("self-media-view-tabs")).toHaveClass("shrink-0")
		expect(screen.getByTestId("self-media-view-tabs")).toHaveClass("max-sm:w-full")
		expect(screen.getByRole("tablist")).toHaveClass("overflow-visible")
		expect(screen.getByRole("tablist")).toHaveClass("h-10")
		expect(screen.getByTestId("self-media-shell-toolbar")).toHaveClass("rounded-[18px]")
		expect(screen.getByTestId("self-media-shell-toolbar")).toHaveClass("p-1")
		expect(screen.getByTestId("self-media-shell-toolbar")).toHaveClass("-m-1")
		expect(screen.getByTestId("self-media-shell-toolbar")).toHaveClass("overflow-visible")
		expect(screen.getByTestId("self-media-shell-toolbar")).toHaveClass("max-lg:overflow-x-auto")
		expect(screen.getByTestId("self-media-export-btn")).toHaveClass("bg-[#18181b]")
		expect(screen.getByTestId("self-media-export-btn")).toHaveClass("max-sm:h-10")
	})

	it("places the share action between refresh and export", () => {
		const onShare = vi.fn()

		render(
			<SelfMediaShellHeader
				platform="rednote"
				posts={[{ meta: { id: "post-1", title: "Launch Notes" }, cards: [] }]}
				activePostIndex={0}
				view="detail"
				tabLabels={{ detail: "Notes" }}
				visibleTabs={["detail"]}
				onChangeView={vi.fn()}
				onRefresh={vi.fn()}
				refreshLabel="Refresh"
				refreshTestId="shell-refresh"
				onShare={onShare}
				onOpenExport={vi.fn()}
				exportLabel="Export"
			/>,
		)

		const refreshButton = screen.getByTestId("shell-refresh")
		const shareButton = screen.getByTestId("self-media-shell-share-button")
		const exportButton = screen.getByTestId("self-media-export-btn")

		expect(
			refreshButton.compareDocumentPosition(shareButton) & Node.DOCUMENT_POSITION_FOLLOWING,
		).toBeTruthy()
		expect(
			shareButton.compareDocumentPosition(exportButton) & Node.DOCUMENT_POSITION_FOLLOWING,
		).toBeTruthy()

		fireEvent.click(shareButton)
		expect(onShare).toHaveBeenCalledTimes(1)
	})

	it("hides the share action when sharing is unavailable", () => {
		render(
			<SelfMediaShellHeader
				platform="rednote"
				posts={[{ meta: { id: "post-1", title: "Launch Notes" }, cards: [] }]}
				activePostIndex={0}
				view="detail"
				tabLabels={{ detail: "Notes" }}
				visibleTabs={["detail"]}
				onChangeView={vi.fn()}
				onRefresh={vi.fn()}
				refreshLabel="Refresh"
				refreshTestId="shell-refresh"
			/>,
		)

		expect(screen.queryByTestId("self-media-shell-share-button")).not.toBeInTheDocument()
	})

	it("renders the pre-publish analysis action inside the shared footer", () => {
		const onRequestPrePublishAnalysis = vi.fn()

		render(
			<SelfMediaShellViewBar
				view="detail"
				tabLabels={{ feed: "Home", detail: "Notes", scroll: "Long", edit: "Edit" }}
				visibleTabs={["feed", "detail", "scroll", "edit"]}
				onChangeView={vi.fn()}
				onRequestPrePublishAnalysis={onRequestPrePublishAnalysis}
			/>,
		)

		const action = screen.getByTestId("self-media-footer-pre-publish-analysis")
		expect(action).toHaveTextContent("detail.selfMedia.analysis.action")
		expect(screen.getByTestId("self-media-shell-view-bar")).toContainElement(action)
		expect(screen.getByTestId("self-media-shell-view-bar")).toHaveClass("max-sm:py-1.5")
		expect(action).toHaveClass("max-sm:size-10")
		expect(action.querySelector("span")).toHaveClass("max-sm:sr-only")

		fireEvent.click(action)
		expect(onRequestPrePublishAnalysis).toHaveBeenCalledTimes(1)
	})

	it("hides edit-related views on mobile and falls back to the first readable tab", () => {
		const onChangeView = vi.fn()
		mockUseIsMobile.mockReturnValueOnce(true)

		render(
			<SelfMediaShellViewBar
				view="edit"
				tabLabels={{
					feed: "Cover",
					detail: "Content",
					edit: "Edit",
					code: "Source",
				}}
				visibleTabs={["feed", "detail", "edit", "code"]}
				onChangeView={onChangeView}
			/>,
		)

		expect(screen.queryByText("Edit")).not.toBeInTheDocument()
		expect(screen.queryByText("Source")).not.toBeInTheDocument()
		expect(screen.getByText("Cover")).toBeInTheDocument()
		expect(screen.getByText("Content")).toBeInTheDocument()
		expect(onChangeView).toHaveBeenCalledWith("feed")
	})

	it("edits and saves the article title", async () => {
		const onSaveTitle = vi.fn().mockResolvedValue(true)

		render(
			<SelfMediaShellHeader
				platform="rednote"
				posts={[
					{
						meta: {
							id: "post-1",
							title: "Launch Notes",
						},
						cards: [],
					},
				]}
				activePostIndex={0}
				view="detail"
				tabLabels={{ detail: "Notes" }}
				visibleTabs={["detail"]}
				onChangeView={vi.fn()}
				onRefresh={vi.fn()}
				onBackHome={vi.fn()}
				refreshLabel="Refresh"
				refreshTestId="shell-refresh"
				onSaveTitle={onSaveTitle}
			/>,
		)

		fireEvent.click(screen.getByTestId("self-media-shell-edit-title-button"))
		const input = screen.getByTestId("self-media-shell-title-input")
		fireEvent.change(input, { target: { value: "Launch Notes Updated" } })
		fireEvent.click(screen.getByTestId("self-media-shell-save-title-button"))

		await waitFor(() => expect(onSaveTitle).toHaveBeenCalledWith("Launch Notes Updated"))
	})
})
