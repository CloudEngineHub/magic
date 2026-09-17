import { fireEvent, render, screen, waitFor, within } from "@testing-library/react"
import { createContext } from "react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { ReviewActionDialogs } from "@magic-admin-v2/features/platform-publish-review/components/review-action-dialogs"

const { toastError } = vi.hoisted(() => ({ toastError: vi.fn() }))

vi.mock("react-i18next", () => ({
	useTranslation: () => ({ t: (key: string) => key }),
}))

vi.mock("sonner", () => ({
	toast: { error: toastError },
}))

vi.mock("@magic-admin-v2/runtime/context", () => ({
  RuntimeContext: createContext(null),
	useRuntime: () => ({
		organization: { current: { organizationCode: "CUSTOM-ORG" } },
	}),
}))

Object.defineProperty(Element.prototype, "scrollIntoView", {
	configurable: true,
	value: vi.fn(),
})

const record = {
	created_at: "2026-08-25 10:00:00",
	id: "review-1",
	publish_status: "UNPUBLISHED",
	publish_target_type: "ORGANIZATION",
	review_status: "UNDER_REVIEW",
	version: "1.0.0",
}

afterEach(() => {
	vi.clearAllMocks()
})

describe("publish review action dialogs", () => {
	it("submits approval with the selected publisher type and closes on success", async () => {
		const onClose = vi.fn()
		const onConfirm = vi.fn().mockResolvedValue(undefined)

		render(
			<ReviewActionDialogs
				dialogState={{ action: "APPROVED", record }}
				isPending={false}
				onClose={onClose}
				onConfirm={onConfirm}
				variant="platform"
			/>,
		)

		const dialog = screen.getByRole("alertdialog")
		const select = within(dialog).getByRole("combobox")
		fireEvent.click(select)
		fireEvent.click(await screen.findByRole("option", { name: "publishReview.publisherType.official" }))
		fireEvent.click(within(dialog).getByRole("button", { name: "publishReview.action.confirmApprove" }))

		await waitFor(() =>
			expect(onConfirm).toHaveBeenCalledWith({
				action: "APPROVED",
				publisherType: "OFFICIAL",
				record,
			}),
		)
		expect(onClose).toHaveBeenCalledTimes(1)
	})

	it("keeps the approval dialog open and reports the error when approval fails", async () => {
		const onClose = vi.fn()
		const onConfirm = vi.fn().mockRejectedValue(new Error("review failed"))

		render(
			<ReviewActionDialogs
				dialogState={{ action: "APPROVED", record }}
				isPending={false}
				onClose={onClose}
				onConfirm={onConfirm}
				variant="platform"
			/>,
		)

		fireEvent.click(screen.getByRole("button", { name: "publishReview.action.confirmApprove" }))
		await waitFor(() => expect(onConfirm).toHaveBeenCalledTimes(1))
		expect(onClose).not.toHaveBeenCalled()
		expect(toastError).toHaveBeenCalledWith("review failed")
		expect(screen.getByRole("alertdialog")).toBeInTheDocument()
	})

	it("submits a trimmed rejection remark for internal review", async () => {
		const onClose = vi.fn()
		const onConfirm = vi.fn().mockResolvedValue(undefined)

		render(
			<ReviewActionDialogs
				dialogState={{ action: "REJECTED", record }}
				isPending={false}
				onClose={onClose}
				onConfirm={onConfirm}
				variant="internal"
			/>,
		)

		const dialog = screen.getByRole("alertdialog")
		fireEvent.change(within(dialog).getByRole("textbox"), { target: { value: "  invalid content  " } })
		fireEvent.click(within(dialog).getByRole("button", { name: "publishReview.action.confirmReject" }))

		await waitFor(() =>
			expect(onConfirm).toHaveBeenCalledWith({
				action: "REJECTED",
				reviewRemark: "  invalid content  ",
				record,
			}),
		)
		expect(onClose).toHaveBeenCalledTimes(1)
	})
})
