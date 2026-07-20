import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

import MicroAppMobileHeader from "../MicroAppMobileHeader"

vi.mock("react-i18next", () => ({
	useTranslation: () => ({
		t: (key: string) => key,
	}),
}))

describe("MicroAppMobileHeader", () => {
	it("shows mobile actions and forwards user interactions", () => {
		const onBack = vi.fn()
		const onToggleDatabasePanel = vi.fn()
		const onPublish = vi.fn()
		const onManageCollaborators = vi.fn()

		render(
			<MicroAppMobileHeader
				selectedProject={{ id: "project-1", project_name: "Todo App" } as never}
				hasEntries
				isDatabasePanelOpen={false}
				onBack={onBack}
				onToggleDatabasePanel={onToggleDatabasePanel}
				onPublish={onPublish}
				canManageCollaborators
				onManageCollaborators={onManageCollaborators}
			/>,
		)

		expect(screen.getByText("Todo App")).toBeInTheDocument()
		fireEvent.click(screen.getByLabelText("microAppPage.header.backToApps"))
		fireEvent.click(screen.getByTestId("micro-app-mobile-database-button"))
		fireEvent.click(screen.getByTestId("micro-app-mobile-manage-collaborators"))
		fireEvent.click(screen.getByTestId("micro-app-mobile-publish-button"))

		expect(onBack).toHaveBeenCalledOnce()
		expect(onToggleDatabasePanel).toHaveBeenCalledOnce()
		expect(onManageCollaborators).toHaveBeenCalledOnce()
		expect(onPublish).toHaveBeenCalledOnce()
	})
})
