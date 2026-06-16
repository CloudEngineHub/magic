import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import MobileFilesSelectionBar from "../MobileFilesSelectionBar"

vi.mock("react-i18next", () => ({
	useTranslation: () => ({
		t: (key: string) => key,
	}),
}))

vi.mock("../MobileFileSelectionCheckbox", () => ({
	default: () => <div data-testid="mobile-file-selection-checkbox" />,
}))

describe("MobileFilesSelectionBar", () => {
	it("renders copy button and invokes onCopy when clicked", () => {
		const onCopy = vi.fn()

		render(
			<MobileFilesSelectionBar
				isAllSelected={false}
				onToggleAll={vi.fn()}
				onCopy={onCopy}
			/>,
		)

		const copyButton = screen.getByRole("button", {
			name: "topicFiles.contextMenu.copyTo",
		})
		expect(copyButton).toBeEnabled()

		fireEvent.click(copyButton)
		expect(onCopy).toHaveBeenCalledTimes(1)
	})

	it("disables copy button when onCopy is not provided", () => {
		render(<MobileFilesSelectionBar isAllSelected={false} onToggleAll={vi.fn()} />)

		const copyButton = screen.getByRole("button", {
			name: "topicFiles.contextMenu.copyTo",
		})
		expect(copyButton).toBeDisabled()
	})
})
