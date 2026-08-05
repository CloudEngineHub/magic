import { render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import QuickActionCards from "./QuickActionCards"

vi.mock("react-i18next", () => ({
	useTranslation: () => ({ t: (key: string) => key }),
}))

describe("QuickActionCards", () => {
	it("hides settings and publishing actions for viewer", () => {
		render(
			<QuickActionCards
				settingsLabel="Settings"
				publishLabel="Publish"
				unpublishedChangesLabel="Draft"
				publishStatus="published"
				hideSettings
				hidePublish
			/>,
		)

		expect(screen.queryByTestId("skill-edit-quick-actions")).not.toBeInTheDocument()
		expect(screen.queryByTestId("skill-edit-settings-button")).not.toBeInTheDocument()
		expect(screen.queryByTestId("skill-edit-publish-button")).not.toBeInTheDocument()
	})

	it("keeps the container when extra content is visible", () => {
		const { container } = render(
			<QuickActionCards
				settingsLabel="Settings"
				publishLabel="Publish"
				unpublishedChangesLabel="Draft"
				publishStatus="published"
				hideSettings
				hidePublish
				extraContent={<div>Collaborators</div>}
			/>,
		)

		expect(screen.getByTestId("skill-edit-quick-actions")).toBeInTheDocument()
		expect(screen.getByText("Collaborators")).toBeInTheDocument()
		expect(container.querySelector('[data-slot="separator"]')).not.toBeInTheDocument()
	})
})
