import { fireEvent, render, screen } from "@testing-library/react"
import { beforeEach, describe, expect, test, vi } from "vitest"

import { resetOverlayStackForTest } from "@/utils/overlayZIndex/overlayStackManager"
import { MobileSettingsSheetContainer } from "../SheetContainer"

vi.mock("react-i18next", () => ({
	useTranslation: () => ({
		t: (key: string) => key,
	}),
}))

/** Verifies shared settings sheets expose stable automation selectors on header actions. */
describe("MobileSettingsSheetContainer", () => {
	beforeEach(() => {
		resetOverlayStackForTest()
	})

	test("exposes a stable close button test id and keeps close behavior", () => {
		const handleOpenChange = vi.fn()

		render(
			<MobileSettingsSheetContainer
				open
				title="Settings"
				onOpenChange={handleOpenChange}
				dataTestId="mobile-settings-root-sheet"
			>
				<div>content</div>
			</MobileSettingsSheetContainer>,
		)

		const closeButton = screen.getByTestId("mobile-settings-root-sheet-close-button")
		fireEvent.click(closeButton)

		expect(handleOpenChange).toHaveBeenCalledWith(false)
	})
})
