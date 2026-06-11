import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { SaveConfirmDialog } from "../components/SelfMediaInitPanel/steps/StepBrandInfo/components/SaveConfirmDialog"

vi.mock("react-i18next", () => ({
	useTranslation: () => ({
		t: (_key: string, fallback?: string) => fallback || _key,
	}),
}))

describe("SaveConfirmDialog style", () => {
	it("uses the refined modal layer and keeps actions interactive", () => {
		const onConfirm = vi.fn()
		const onCancel = vi.fn()

		render(<SaveConfirmDialog onConfirm={onConfirm} onCancel={onCancel} />)

		const overlay = screen.getByTestId("self-media-save-confirm-overlay")
		const panel = screen.getByTestId("self-media-save-confirm-panel")
		const icon = screen.getByTestId("self-media-save-confirm-icon")
		const cancelButton = screen.getByTestId("self-media-save-confirm-cancel")
		const confirmButton = screen.getByTestId("self-media-save-confirm-confirm")

		expect(overlay).toHaveClass("z-[1000]")
		expect(overlay).toHaveClass("bg-[#111827]/55")
		expect(panel).not.toHaveClass("border")
		expect(panel).toHaveClass("bg-background/85")
		expect(panel).toHaveClass("shadow-[0_24px_80px_rgba(15,23,42,0.24)]")
		expect(icon).toHaveClass("bg-[#434c81]/[0.10]")
		expect(cancelButton).toHaveClass("hover:-translate-y-0.5")
		expect(confirmButton).toHaveClass("bg-[#161b27]")
		expect(confirmButton).toHaveClass("hover:-translate-y-0.5")

		fireEvent.click(cancelButton)
		fireEvent.click(confirmButton)

		expect(onCancel).toHaveBeenCalledTimes(1)
		expect(onConfirm).toHaveBeenCalledTimes(1)
	})
})
