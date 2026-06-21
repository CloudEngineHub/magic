import { fireEvent, render, screen } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import RecordSummaryNotificationContent from "../RecordSummaryNotificationContent"

describe("RecordSummaryNotificationContent", () => {
	beforeEach(() => {
		vi.clearAllMocks()
	})

	it("calls onViewClick when the view button is pressed", () => {
		const onViewClick = vi.fn()

		render(
			<RecordSummaryNotificationContent
				title="Summary ready"
				description="Done"
				onViewClick={onViewClick}
				onDismiss={() => undefined}
				viewText="View summary"
				ignoreText="Ignore"
				success
			/>,
		)

		fireEvent.click(screen.getByRole("button", { name: "View summary" }))

		expect(onViewClick).toHaveBeenCalledTimes(1)
	})

	it("calls onDismiss when the ignore button is pressed", () => {
		const onDismiss = vi.fn()

		render(
			<RecordSummaryNotificationContent
				title="Summary ready"
				description="Done"
				onViewClick={() => undefined}
				onDismiss={onDismiss}
				viewText="View summary"
				ignoreText="Ignore"
				success
			/>,
		)

		fireEvent.click(screen.getByRole("button", { name: "Ignore" }))

		expect(onDismiss).toHaveBeenCalledTimes(1)
	})
})
