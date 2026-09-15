import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { ApiTab } from "../ApiTab"
import type { ApiCallEntry } from "../types"

vi.mock("react-i18next", () => ({
	useTranslation: () => ({ t: (key: string) => key }),
}))

vi.mock("@tanstack/react-virtual", () => ({
	useVirtualizer: ({ count }: { count: number }) => ({
		getTotalSize: () => count * 36,
		getVirtualItems: () =>
			Array.from({ length: count }, (_, index) => ({
				index,
				key: index,
				start: index * 36,
			})),
		measureElement: vi.fn(),
		scrollToIndex: vi.fn(),
	}),
}))

describe("ApiTab", () => {
	it("renders the API response only after the entry is expanded", () => {
		const entry: ApiCallEntry = {
			id: "api-1",
			api: "MagicDatabaseApi",
			event: "request:success",
			details: {
				type: "MAGIC_DB_QUERY_ROWS_REQUEST",
				requestId: "request-1",
			},
			result: { rows: [{ id: 1, name: "First row" }] },
			status: "success",
			startTime: Date.now(),
			duration: 12,
		}

		const { container } = render(<ApiTab entries={[entry]} />)
		expect(container.querySelectorAll('[data-testid="toggle-2"]')).toHaveLength(0)

		fireEvent.click(screen.getByTestId("toggle-expand"))

		const rootToggles = container.querySelectorAll('[data-testid="toggle-2"]')
		expect(rootToggles).toHaveLength(2)
		fireEvent.click(rootToggles[1])
		expect(screen.getByText("rows")).toBeInTheDocument()
		expect(screen.queryByText('"First row"')).not.toBeInTheDocument()

		fireEvent.click(screen.getByText("rows"))
		const propertyToggles = screen.getAllByTestId("toggle")
		fireEvent.click(propertyToggles[propertyToggles.length - 1])
		expect(screen.getByText('"First row"')).toBeInTheDocument()
	})
})
