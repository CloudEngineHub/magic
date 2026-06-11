import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import SelfMediaShellHeader from "../components/SelfMediaShellHeader"

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

describe("SelfMediaShellHeader", () => {
	it("shows platform icon and article title instead of switchers", () => {
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
			"Launch Feed",
		)
		expect(screen.getByTestId("self-media-shell-platform-icon")).toBeInTheDocument()
		const backButton = screen.getByTestId("self-media-shell-back-home-button")
		fireEvent.click(backButton)
		expect(onBackHome).toHaveBeenCalledTimes(1)
		expect(screen.queryByTestId("self-media-platform-switcher-host")).not.toBeInTheDocument()
		expect(screen.queryByTestId("self-media-post-selector")).not.toBeInTheDocument()
	})

	it("uses shadcn button and tabs primitives for the desktop toolbar", () => {
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
		expect(
			screen.getByTestId("self-media-view-tabs").querySelector("[data-slot='tabs-list']"),
		).toBeInTheDocument()
		expect(screen.getByRole("tablist")).toBeInTheDocument()
	})
})
