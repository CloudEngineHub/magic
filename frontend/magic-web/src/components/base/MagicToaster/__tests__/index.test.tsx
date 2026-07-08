import { render } from "@testing-library/react"
import { describe, expect, test, vi } from "vitest"
import MagicToaster from ".."

const mockToaster = vi.fn()

vi.mock("@/components/shadcn-ui/sonner", () => ({
	/**
	 * Captures the resolved toaster props so the test can assert our responsive
	 * class contract without depending on Sonner's DOM implementation details.
	 */
	Toaster: (props: Record<string, unknown>) => {
		mockToaster(props)
		return <div data-testid="mock-sonner-toaster" />
	},
}))

describe("MagicToaster", () => {
	test("centered toaster keeps desktop compact rules and adds mobile wrapping safeguards", () => {
		render(<MagicToaster />)

		const firstCall = mockToaster.mock.calls[0]?.[0] as { className?: string } | undefined

		expect(firstCall?.className).toContain("[&_[data-sonner-toast]]:!w-fit")
		expect(firstCall?.className).toContain("max-md:[&_[data-sonner-toast]]:!w-fit")
		expect(firstCall?.className).toContain(
			"max-md:[&_[data-sonner-toast]]:!max-w-[calc(100vw-24px)]",
		)
		expect(firstCall?.className).toContain("max-md:[&_[data-sonner-toast]]:!whitespace-normal")
		expect(firstCall?.className).toContain(
			"max-md:[&_[data-sonner-toast]]:![overflow-wrap:anywhere]",
		)
	})
})
