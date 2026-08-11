import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { useRef } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const scrollRangeIntoViewMock = vi.hoisted(() => vi.fn())

vi.mock("../../utils/content-search", async () => {
	const actual = await vi.importActual<typeof import("../../utils/content-search")>(
		"../../utils/content-search",
	)
	return {
		...actual,
		scrollMobileRecordingSearchRangeIntoView: scrollRangeIntoViewMock,
	}
})

import { useMobileRecordingContentSearch } from "../useMobileRecordingContentSearch"

/** Renders searchable text with controls that expose the hook's current navigation state. */
function SearchHarness({ content }: { content: string }) {
	const scopeRef = useRef<HTMLDivElement>(null)
	const search = useMobileRecordingContentSearch("match", {
		scopeRef,
		enabled: true,
		contentKey: "stable-panel",
	})

	return (
		<div>
			<div ref={scopeRef}>{content}</div>
			<button type="button" onClick={search.goToNext}>
				next
			</button>
			<output>{`${search.currentIndex}/${search.totalMatches}`}</output>
		</div>
	)
}

describe("useMobileRecordingContentSearch", () => {
	beforeEach(() => {
		scrollRangeIntoViewMock.mockReset()
		vi.stubGlobal(
			"requestAnimationFrame",
			vi.fn((callback: FrameRequestCallback) => {
				callback(0)
				return 1
			}),
		)
		vi.stubGlobal("cancelAnimationFrame", vi.fn())
	})

	afterEach(() => {
		vi.unstubAllGlobals()
	})

	it("keeps the current result and manual scroll position when observed content mutates", async () => {
		const { rerender } = render(<SearchHarness content="match first, match second" />)

		await waitFor(() => expect(screen.getByText("1/2")).toBeInTheDocument())
		expect(scrollRangeIntoViewMock).toHaveBeenCalledTimes(1)

		fireEvent.click(screen.getByRole("button", { name: "next" }))
		expect(screen.getByText("2/2")).toBeInTheDocument()
		expect(scrollRangeIntoViewMock).toHaveBeenCalledTimes(2)

		rerender(<SearchHarness content="match first, match second updated" />)

		await waitFor(() => expect(screen.getByText("2/2")).toBeInTheDocument())
		expect(scrollRangeIntoViewMock).toHaveBeenCalledTimes(2)
	})
})
