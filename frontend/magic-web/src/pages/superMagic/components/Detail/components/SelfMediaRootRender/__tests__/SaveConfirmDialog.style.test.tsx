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
		const title = screen.getByRole("heading", { name: /下次还用这套品牌信息吗？/ })
		const description = screen.getByText("保存后，下次新建文章可一键回填。")

		expect(overlay).toHaveClass("z-[1000]")
		expect(overlay).toHaveAttribute("aria-labelledby", title.id)
		expect(overlay).toHaveAttribute("aria-describedby", description.id)
		expect(overlay).toHaveClass("bg-[#111827]/45")
		expect(panel).not.toHaveClass("border")
		expect(panel).toHaveClass("bg-[#f8f8f9]")
		expect(panel).toHaveClass("rounded-[24px]")
		expect(panel).toHaveClass("shadow-[0_24px_72px_rgba(24,24,27,0.18)]")
		expect(icon).toHaveClass("bg-white")
		expect(cancelButton).toHaveClass("rounded-[25px]")
		expect(confirmButton).toHaveClass("bg-[#18181b]")
		expect(confirmButton).toHaveClass("hover:-translate-y-0.5")
		expect(confirmButton).toHaveFocus()
		expect(description).toBeInTheDocument()
		expect(screen.getByRole("button", { name: /不保存，继续/ })).toBeInTheDocument()
		expect(
			screen.queryByText("是否将当前品牌信息保存为历史记录，方便下次快速一键回填？"),
		).not.toBeInTheDocument()

		fireEvent.click(cancelButton)
		fireEvent.click(confirmButton)

		expect(onCancel).toHaveBeenCalledTimes(1)
		expect(onConfirm).toHaveBeenCalledTimes(1)
	})
})
