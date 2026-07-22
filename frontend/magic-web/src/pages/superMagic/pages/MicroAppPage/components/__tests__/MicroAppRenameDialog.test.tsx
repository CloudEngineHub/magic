import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

import MicroAppRenameDialog from "../MicroAppRenameDialog"

vi.mock("react-i18next", () => ({
	useTranslation: () => ({
		t: (key: string) => key,
	}),
}))

vi.mock("@/utils/inputFocusPolicy", () => ({
	shouldSuppressInputAutoFocusInMagicApp: () => false,
}))

describe("MicroAppRenameDialog", () => {
	it("submits the trimmed project name and closes after success", async () => {
		const onConfirm = vi.fn().mockResolvedValue(true)
		const onOpenChange = vi.fn()

		render(
			<MicroAppRenameDialog
				open
				projectName="Demo App"
				onOpenChange={onOpenChange}
				onConfirm={onConfirm}
			/>,
		)

		fireEvent.change(screen.getByTestId("micro-app-rename-input"), {
			target: { value: "  New App  " },
		})
		fireEvent.click(screen.getByTestId("micro-app-rename-confirm"))

		await waitFor(() => expect(onConfirm).toHaveBeenCalledWith("New App"))
		expect(onOpenChange).toHaveBeenCalledWith(false)
	})

	it("does not allow empty or unchanged names", () => {
		render(
			<MicroAppRenameDialog
				open
				projectName="Demo App"
				onOpenChange={vi.fn()}
				onConfirm={vi.fn().mockResolvedValue(true)}
			/>,
		)

		const input = screen.getByTestId("micro-app-rename-input")
		const confirm = screen.getByTestId("micro-app-rename-confirm")
		expect(confirm).toBeDisabled()

		fireEvent.change(input, { target: { value: "   " } })
		expect(confirm).toBeDisabled()
	})
})
