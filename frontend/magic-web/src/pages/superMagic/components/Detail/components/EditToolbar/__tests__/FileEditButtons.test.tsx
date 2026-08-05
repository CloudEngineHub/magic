import { fireEvent, render, waitFor } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import type { PropsWithChildren } from "react"
import FileEditButtons from "../FileEditButtons"

vi.mock("@/hooks/useIsMobile", () => ({
	useIsMobile: () => false,
}))

vi.mock("react-i18next", () => ({
	useTranslation: () => ({ t: (key: string) => key }),
}))

vi.mock("@/pages/superMagic/hooks/useHTMLGuideTour", () => ({
	HTMLGuideTourElementId: { HTMLFileEditButton: "html-file-edit-button" },
}))

vi.mock("@/components/shadcn-ui/button", () => ({
	Button: ({ children, disabled }: PropsWithChildren<{ disabled?: boolean }>) => (
		<button disabled={disabled}>{children}</button>
	),
}))

vi.mock("@/components/shadcn-ui/kbd", () => ({
	Kbd: ({ children }: PropsWithChildren) => <span>{children}</span>,
}))

vi.mock("../ConditionalTooltip", () => ({
	default: ({ children }: PropsWithChildren) => children,
}))

describe("FileEditButtons", () => {
	it("ignores global edit shortcuts while interaction is disabled", async () => {
		const onSave = vi.fn().mockResolvedValue(undefined)
		const onCancel = vi.fn()
		const { rerender } = render(
			<FileEditButtons
				interactionDisabled
				isEditMode
				showButtonText
				onSave={onSave}
				onCancel={onCancel}
			/>,
		)

		fireEvent.keyDown(document, { key: "s", ctrlKey: true })
		fireEvent.keyDown(document, { key: "Escape" })
		expect(onSave).not.toHaveBeenCalled()
		expect(onCancel).not.toHaveBeenCalled()

		rerender(<FileEditButtons isEditMode showButtonText onSave={onSave} onCancel={onCancel} />)

		fireEvent.keyDown(document, { key: "s", ctrlKey: true })
		await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1))
	})
})
