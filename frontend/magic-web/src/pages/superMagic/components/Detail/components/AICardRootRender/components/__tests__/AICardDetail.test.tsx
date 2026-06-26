import { fireEvent, render, screen } from "@testing-library/react"
import type { ReactNode } from "react"
import { describe, expect, it, vi } from "vitest"
import AICardDetail from "../AICardDetail"
import type { AICardEntry } from "../../types"

vi.mock("react-i18next", () => ({
	useTranslation: () => ({
		t: (key: string) => {
			const labels: Record<string, string> = {
				"detail.aiCard.detail.back": "Back",
				"detail.aiCard.detail.noContent": "No card content",
				"detail.aiCard.detail.previousVersion": "Newer version",
				"detail.aiCard.detail.previousVersionDisabled": "Already at latest version",
				"detail.aiCard.detail.nextVersion": "Older version",
				"detail.aiCard.detail.nextVersionDisabled": "Already at earliest version",
			}
			return labels[key] || key
		},
	}),
}))

vi.mock("framer-motion", async () => {
	const React = await import("react")
	const motionProps = new Set(["initial", "animate", "exit", "transition", "layoutId"])
	return {
		motion: new Proxy(
			{},
			{
				get:
					(_target, tag: string) =>
					({
						children,
						...props
					}: { children?: ReactNode } & Record<string, unknown>) => {
						const domProps = Object.fromEntries(
							Object.entries(props).filter(([key]) => !motionProps.has(key)),
						)
						return React.createElement(tag, domProps, children)
					},
			},
		),
	}
})

vi.mock("../AICardIframe", () => ({
	default: ({ fileId }: { fileId: string }) => (
		<div data-testid="ai-card-detail-iframe">iframe {fileId}</div>
	),
}))

const card: AICardEntry = {
	id: "card-1",
	name: "Daily Report",
	description: "Report card",
	latestHtmlFileId: "latest-file",
	lastUpdated: "2026-05-04T09:00:00Z",
	status: "active",
}

describe("AICardDetail", () => {
	it("renders version switch buttons with correct disabled states", () => {
		const onOpenPreviousVersion = vi.fn()
		const onOpenNextVersion = vi.fn()

		render(
			<AICardDetail
				card={card}
				onBack={vi.fn()}
				canGoToPreviousVersion={false}
				canGoToNextVersion
				onOpenPreviousVersion={onOpenPreviousVersion}
				onOpenNextVersion={onOpenNextVersion}
			/>,
		)

		const previousButton = screen.getByRole("button", { name: "Newer version" })
		const nextButton = screen.getByRole("button", { name: "Older version" })

		expect(previousButton).toBeDisabled()
		expect(previousButton).toHaveAttribute("title", "Already at latest version")
		expect(previousButton.className).toContain("disabled:cursor-not-allowed")
		expect(nextButton).not.toBeDisabled()
		expect(nextButton.className).toContain("hover:bg-muted/80")

		fireEvent.click(previousButton)
		fireEvent.click(nextButton)

		expect(onOpenPreviousVersion).not.toHaveBeenCalled()
		expect(onOpenNextVersion).toHaveBeenCalledTimes(1)
	})
})
