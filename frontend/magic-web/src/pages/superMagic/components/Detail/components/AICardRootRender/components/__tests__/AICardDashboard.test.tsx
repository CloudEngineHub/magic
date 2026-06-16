import { fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import type { ComponentProps, ReactNode } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import AICardDashboard from "../AICardDashboard"
import type { AICardEntry, AICardHistoryEntry } from "../../types"

const scrollIntoViewMock = vi.fn()
Element.prototype.scrollIntoView = scrollIntoViewMock

function mockHorizontalRect(element: Element, left: number, width: number) {
	vi.spyOn(element, "getBoundingClientRect").mockReturnValue({
		bottom: 0,
		height: 0,
		left,
		right: left + width,
		top: 0,
		width,
		x: left,
		y: 0,
		toJSON: () => ({}),
	} as DOMRect)
}

vi.mock("react-i18next", () => ({
	useTranslation: () => ({
		t: (key: string, values?: Record<string, unknown>) => {
			const labels: Record<string, string> = {
				"detail.aiCard.dashboard.loading": "Loading AI Cards...",
				"detail.aiCard.dashboard.loadingDescription": "Parsing card data",
				"detail.aiCard.dashboard.runNow": "Run Now",
				"detail.aiCard.dashboard.running": "Running...",
				"detail.aiCard.dashboard.configure": "Configure",
				"detail.aiCard.dashboard.empty": "No card content yet",
				"detail.aiCard.dashboard.latestVersion": "Latest",
				"detail.aiCard.dashboard.historyVersion": "History",
				"detail.aiCard.dashboard.current": "Current",
				"detail.aiCard.dashboard.archived": "Archived",
				"detail.aiCard.dashboard.latestSectionTitle": "Latest version",
				"detail.aiCard.dashboard.latestSectionDescription": "The current generated card",
				"detail.aiCard.dashboard.historySectionTitle": "Version timeline",
				"detail.aiCard.dashboard.historySectionDescription":
					"Review earlier generated cards",
				"detail.aiCard.dashboard.historyCount": `${values?.count ?? 0} versions`,
				"detail.aiCard.dashboard.historyEmpty": "No history versions yet",
				"detail.aiCard.dashboard.updatedAt": `Updated ${values?.time ?? ""}`,
				"detail.aiCard.dashboard.scheduleDaily": `Daily ${values?.time ?? ""}`,
				"detail.aiCard.dashboard.scheduleWeekly": `Every ${values?.day ?? ""} ${values?.time ?? ""}`,
				"detail.aiCard.dashboard.scheduleMonthly": `Monthly ${values?.day ?? ""} ${values?.time ?? ""}`,
				"detail.aiCard.dashboard.scheduleOnce": `${values?.date ?? ""} ${values?.time ?? ""}`,
				"detail.aiCard.dashboard.scheduleOnceTime": `Once ${values?.time ?? ""}`,
				"detail.aiCard.dashboard.scheduleCustom": `${values?.time ?? ""}`,
				"detail.aiCard.dashboard.modelSummary": `Model ${values?.model ?? ""}`,
				"detail.aiCard.dashboard.weekdays.monday": "Mon",
				"detail.aiCard.dashboard.weekdays.tuesday": "Tue",
				"detail.aiCard.dashboard.weekdays.wednesday": "Wed",
				"detail.aiCard.dashboard.weekdays.thursday": "Thu",
				"detail.aiCard.dashboard.weekdays.friday": "Fri",
				"detail.aiCard.dashboard.weekdays.saturday": "Sat",
				"detail.aiCard.dashboard.weekdays.sunday": "Sun",
			}
			return labels[key] || key
		},
	}),
}))

vi.mock("framer-motion", async () => {
	const React = await import("react")
	return {
		motion: new Proxy(
			{},
			{
				get:
					(_target, tag: string) =>
					({ children, ...props }: { children?: ReactNode }) =>
						React.createElement(tag, props, children),
			},
		),
	}
})

vi.mock("../AICardIframe", () => ({
	default: ({ fileId }: { fileId: string }) => (
		<div data-testid={`ai-card-iframe-${fileId}`}>iframe {fileId}</div>
	),
}))

const cards: AICardEntry[] = [
	{
		id: "card-1",
		name: "Daily Report",
		description: "Report card",
		latestHtmlFileId: "latest-file",
		lastUpdated: "2026-05-04T09:00:00Z",
		status: "active",
	},
]

const historyEntries: AICardHistoryEntry[] = [
	{
		fileId: "history-old",
		fileName: "2026-05-01_09-00.html",
		timestamp: "2026-05-01T09:00:00Z",
		displayTime: "2026-05-01 09:00",
	},
	{
		fileId: "history-new",
		fileName: "2026-05-03_09-00.html",
		timestamp: "2026-05-03T09:00:00Z",
		displayTime: "2026-05-03 09:00",
	},
]

const attachmentList = [
	{
		file_id: "root",
		children: [
			{ file_id: "latest-file", created_at: "2026-05-04T09:00:00Z" },
			{
				file_id: "history",
				children: [
					{ file_id: "history-old", created_at: "2026-05-01T09:00:00Z" },
					{ file_id: "history-new", created_at: "2026-05-03T09:00:00Z" },
				],
			},
		],
	},
]

function renderDashboard(overrides?: Partial<ComponentProps<typeof AICardDashboard>>) {
	return render(
		<AICardDashboard
			cards={cards}
			historyEntries={historyEntries}
			attachmentList={attachmentList}
			onOpenCard={vi.fn()}
			onOpenHistoryEntry={vi.fn()}
			{...overrides}
		/>,
	)
}

describe("AICardDashboard", () => {
	beforeEach(() => {
		scrollIntoViewMock.mockClear()
	})

	it("renders latest card before the history timeline section", () => {
		renderDashboard()

		const latestSection = screen.getByTestId("ai-card-dashboard-latest-section")
		const historySection = screen.getByTestId("ai-card-dashboard-history-timeline")

		expect(within(latestSection).getAllByText("Daily Report")).toHaveLength(2)
		expect(within(latestSection).getByTestId("ai-card-iframe-latest-file")).toBeInTheDocument()
		expect(
			within(historySection).getAllByTestId("ai-card-dashboard-timeline-item"),
		).toHaveLength(2)
		expect(latestSection.compareDocumentPosition(historySection)).toBe(
			Node.DOCUMENT_POSITION_FOLLOWING,
		)
	})

	it("keeps historical versions as summary cards instead of rendering their iframe previews", () => {
		renderDashboard()

		expect(screen.getByTestId("ai-card-iframe-latest-file")).toBeInTheDocument()
		expect(screen.queryByTestId("ai-card-iframe-history-new")).not.toBeInTheDocument()
		expect(screen.queryByTestId("ai-card-iframe-history-old")).not.toBeInTheDocument()
		expect(screen.getAllByTestId("ai-card-dashboard-history-card")).toHaveLength(2)
		expect(screen.getAllByText("Archived")).toHaveLength(2)
	})

	it("keeps history cards compact, varied, and free of file names", () => {
		renderDashboard()

		const historyCards = screen.getAllByTestId("ai-card-dashboard-history-card")
		const tones = new Set(historyCards.map((card) => card.getAttribute("data-tone")))
		const cardShell = historyCards[0].closest('[data-testid="ai-card-dashboard-timeline-item"]')

		expect(tones.size).toBeGreaterThan(1)
		expect(cardShell).toHaveClass("sm:w-[240px]")
		expect(screen.queryByText("2026-05-03_09-00.html")).not.toBeInTheDocument()
		expect(screen.queryByText("2026-05-01_09-00.html")).not.toBeInTheDocument()
	})

	it("does not show latest or history type labels on the card previews", () => {
		renderDashboard()

		expect(screen.queryByText("Latest")).not.toBeInTheDocument()
		expect(screen.queryByText("History")).not.toBeInTheDocument()
	})

	it("shows the saved schedule and model summary in the dashboard header", () => {
		renderDashboard({
			projectConfig: {
				type: "ai-card",
				name: "Daily Report",
				description: "Report card",
				cards: [],
				time_config: {
					type: "daily_repeat",
					time: "9:00",
				},
				model: {
					model_id: "gpt-4.1",
					model_name: "GPT-4.1",
				},
			},
		})

		const meta = screen.getByTestId("ai-card-dashboard-header-meta")

		expect(within(meta).getByText("Daily 09:00")).toBeInTheDocument()
		expect(within(meta).getByText("Model GPT-4.1")).toBeInTheDocument()
	})

	it("keeps history timeline items sorted newest first", () => {
		renderDashboard()

		const items = screen.getAllByTestId("ai-card-dashboard-timeline-item")

		expect(within(items[0]).getByTestId("ai-card-dashboard-history-card")).toHaveAttribute(
			"data-card-id",
			"history-new",
		)
		expect(within(items[1]).getByTestId("ai-card-dashboard-history-card")).toHaveAttribute(
			"data-card-id",
			"history-old",
		)
	})

	it("scrolls the horizontal history rail when a timeline marker is selected", () => {
		renderDashboard()

		const marker = screen.getByTestId("ai-card-dashboard-timeline-marker-history-old")
		fireEvent.click(marker)

		expect(marker).toHaveAttribute("aria-current", "true")
		expect(scrollIntoViewMock).toHaveBeenCalledWith({
			behavior: "smooth",
			block: "nearest",
			inline: "center",
		})
	})

	it("keeps the timeline rail following horizontal card scrolling", async () => {
		renderDashboard()

		const cardRail = screen.getByTestId("ai-card-dashboard-card-rail")
		const cards = screen.getAllByTestId("ai-card-dashboard-timeline-item")
		const oldMarker = screen.getByTestId("ai-card-dashboard-timeline-marker-history-old")

		const oldMarkerScrollIntoView = vi.fn()
		oldMarker.scrollIntoView = oldMarkerScrollIntoView

		mockHorizontalRect(cardRail, 0, 300)
		mockHorizontalRect(cards[0], -350, 300)
		mockHorizontalRect(cards[1], 0, 300)

		fireEvent.scroll(cardRail)

		await waitFor(() => {
			expect(oldMarker).toHaveAttribute("aria-current", "true")
		})
		expect(oldMarkerScrollIntoView).toHaveBeenCalledWith({
			behavior: "auto",
			block: "nearest",
			inline: "center",
		})
	})

	it("does not bounce back when marker sync emits a timeline scroll event", async () => {
		renderDashboard()

		const cardRail = screen.getByTestId("ai-card-dashboard-card-rail")
		const timelineRail = screen.getByTestId("ai-card-dashboard-timeline-rail")
		const cards = screen.getAllByTestId("ai-card-dashboard-timeline-item")
		const newMarker = screen.getByTestId("ai-card-dashboard-timeline-marker-history-new")
		const oldMarker = screen.getByTestId("ai-card-dashboard-timeline-marker-history-old")

		const newCardScrollIntoView = vi.fn()
		cards[0].scrollIntoView = newCardScrollIntoView

		mockHorizontalRect(cardRail, 0, 300)
		mockHorizontalRect(cards[0], -350, 300)
		mockHorizontalRect(cards[1], 0, 300)
		fireEvent.scroll(cardRail)

		await waitFor(() => {
			expect(oldMarker).toHaveAttribute("aria-current", "true")
		})

		mockHorizontalRect(timelineRail, 0, 300)
		mockHorizontalRect(newMarker, 112, 76)
		mockHorizontalRect(oldMarker, 260, 76)
		fireEvent.scroll(timelineRail)

		expect(newCardScrollIntoView).not.toHaveBeenCalled()
		expect(oldMarker).toHaveAttribute("aria-current", "true")
	})

	it("keeps the card rail following horizontal timeline scrolling", async () => {
		renderDashboard()

		const timelineRail = screen.getByTestId("ai-card-dashboard-timeline-rail")
		const newMarker = screen.getByTestId("ai-card-dashboard-timeline-marker-history-new")
		const oldMarker = screen.getByTestId("ai-card-dashboard-timeline-marker-history-old")
		const cards = screen.getAllByTestId("ai-card-dashboard-timeline-item")

		const oldCardScrollIntoView = vi.fn()
		cards[1].scrollIntoView = oldCardScrollIntoView

		mockHorizontalRect(timelineRail, 0, 300)
		mockHorizontalRect(newMarker, -220, 76)
		mockHorizontalRect(oldMarker, 112, 76)

		fireEvent.scroll(timelineRail)

		await waitFor(() => {
			expect(oldMarker).toHaveAttribute("aria-current", "true")
		})
		expect(oldCardScrollIntoView).toHaveBeenCalledWith({
			behavior: "auto",
			block: "nearest",
			inline: "center",
		})
	})

	it("opens the matching history entry from a timeline card", () => {
		const onOpenHistoryEntry = vi.fn()
		const { container } = renderDashboard({ onOpenHistoryEntry })
		const historyCard = container.querySelector('[data-card-id="history-new"]')

		expect(historyCard).toBeInstanceOf(HTMLElement)
		fireEvent.click(historyCard as HTMLElement)

		expect(onOpenHistoryEntry).toHaveBeenCalledWith(historyEntries[1])
	})

	it("shows an empty timeline state when there are no history entries", () => {
		renderDashboard({ historyEntries: [] })

		expect(screen.getByTestId("ai-card-dashboard-history-empty")).toHaveTextContent(
			"No history versions yet",
		)
		expect(screen.getByTestId("ai-card-dashboard-latest-section")).toBeInTheDocument()
	})
})
