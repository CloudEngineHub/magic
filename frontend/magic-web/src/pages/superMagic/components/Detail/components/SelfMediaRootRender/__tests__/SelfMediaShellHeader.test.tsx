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
		fireEvent.click(screen.getByTestId("self-media-shell-back-home-button"))
		expect(onBackHome).toHaveBeenCalledTimes(1)
		expect(screen.queryByTestId("self-media-platform-switcher-host")).not.toBeInTheDocument()
		expect(screen.queryByTestId("self-media-post-selector")).not.toBeInTheDocument()
	})
})
