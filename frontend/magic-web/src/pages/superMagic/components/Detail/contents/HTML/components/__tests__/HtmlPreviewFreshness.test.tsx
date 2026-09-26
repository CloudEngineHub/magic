import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { HtmlPreviewFreshness } from "../HtmlPreviewFreshness"

vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }))

describe("HTML preview refresh feedback", () => {
	it("keeps the status quiet until an existing preview is updating", () => {
		const { rerender } = render(
			<HtmlPreviewFreshness phase="rendering" hasRendered={false} onRetry={vi.fn()} />,
		)
		expect(screen.queryByRole("status")).toBeNull()
		rerender(<HtmlPreviewFreshness phase="updating" hasRendered onRetry={vi.fn()} />)
		expect(screen.getByRole("status")).toHaveTextContent("htmlEditor.previewUpdating")
	})
	it("exposes a visible retry action after failure without requiring hover", () => {
		const retry = vi.fn()
		render(<HtmlPreviewFreshness phase="failed" hasRendered onRetry={retry} />)
		expect(screen.getByRole("status")).toHaveTextContent("htmlEditor.previewRefreshFailed")
		fireEvent.click(screen.getByRole("button", { name: "htmlEditor.previewRetry" }))
		expect(retry).toHaveBeenCalledTimes(1)
	})
})
