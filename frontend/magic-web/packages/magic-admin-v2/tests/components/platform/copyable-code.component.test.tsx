import { act, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { CopyableCode } from "../../../src/features/platform-slides-template/components/copyable-code"

vi.mock("@magic-admin-v2/utils/clipboard-helpers", () => ({
	clipboard: { writeText: vi.fn().mockResolvedValue(undefined) },
}))

vi.mock("react-i18next", () => ({
	useTranslation: () => ({ t: (key: string) => key }),
}))

afterEach(() => {
	vi.useRealTimers()
})

describe("copyable code", () => {
	it("restarts the copied-state timer after repeated clicks", async () => {
		vi.useFakeTimers()
		const { container } = render(<CopyableCode value="template-code" />)
		const button = screen.getByRole("button", { name: "slidesTemplate.aria.copyCode" })

		await act(async () => {
			fireEvent.click(button)
			await Promise.resolve()
		})
		act(() => vi.advanceTimersByTime(600))
		await act(async () => {
			fireEvent.click(button)
			await Promise.resolve()
		})
		act(() => vi.advanceTimersByTime(600))

		expect(container.querySelector(".lucide-check")).toBeInTheDocument()

		act(() => vi.advanceTimersByTime(600))
		expect(container.querySelector(".lucide-check")).not.toBeInTheDocument()
	})

	it("clears the copied-state timer when unmounted", async () => {
		vi.useFakeTimers()
		const clearTimeoutSpy = vi.spyOn(window, "clearTimeout")
		const { unmount } = render(<CopyableCode value="template-code" />)

		await act(async () => {
			fireEvent.click(screen.getByRole("button", { name: "slidesTemplate.aria.copyCode" }))
			await Promise.resolve()
		})
		unmount()

		expect(clearTimeoutSpy).toHaveBeenCalled()
		clearTimeoutSpy.mockRestore()
	})
})
