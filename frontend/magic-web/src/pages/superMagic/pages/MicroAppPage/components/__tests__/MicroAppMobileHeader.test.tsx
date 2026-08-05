import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

import MicroAppMobileHeader from "../MicroAppMobileHeader"

vi.mock("react-i18next", () => ({
	useTranslation: () => ({
		t: (key: string) => key,
	}),
}))

describe("MicroAppMobileHeader", () => {
	it("hides collaborator management when the project is not manageable", () => {
		render(
			<MicroAppMobileHeader
				selectedProject={{ id: "project-1", project_name: "Todo App" } as never}
				hasEntries
				canPublish
				isDatabasePanelOpen={false}
				onBack={vi.fn()}
				onToggleDatabasePanel={vi.fn()}
				onPublish={vi.fn()}
				canManageCollaborators={false}
				onManageCollaborators={vi.fn()}
			/>,
		)

		expect(
			screen.queryByTestId("micro-app-mobile-manage-collaborators"),
		).not.toBeInTheDocument()
	})

	it("shows mobile actions and forwards user interactions", () => {
		const onBack = vi.fn()
		const onToggleDatabasePanel = vi.fn()
		const onPublish = vi.fn()
		const onManageCollaborators = vi.fn()
		const onEdit = vi.fn()

		render(
			<MicroAppMobileHeader
				selectedProject={{ id: "project-1", project_name: "Todo App" } as never}
				hasEntries
				canPublish
				isDatabasePanelOpen={false}
				onBack={onBack}
				onToggleDatabasePanel={onToggleDatabasePanel}
				onPublish={onPublish}
				canEdit
				onEdit={onEdit}
				canManageCollaborators
				onManageCollaborators={onManageCollaborators}
			/>,
		)

		expect(screen.getByText("Todo App")).toBeInTheDocument()
		fireEvent.click(screen.getByLabelText("microAppPage.header.backToApps"))
		fireEvent.click(screen.getByTestId("micro-app-mobile-database-button"))
		fireEvent.click(screen.getByTestId("micro-app-mobile-manage-collaborators"))
		fireEvent.click(screen.getByTestId("micro-app-mobile-publish-button"))
		fireEvent.click(screen.getByTestId("micro-app-mobile-edit-button"))

		expect(onBack).toHaveBeenCalledOnce()
		expect(onToggleDatabasePanel).toHaveBeenCalledOnce()
		expect(onManageCollaborators).toHaveBeenCalledOnce()
		expect(onPublish).toHaveBeenCalledOnce()
		expect(onEdit).toHaveBeenCalledOnce()
	})

	it("uses published status as the mobile publish action label", () => {
		render(
			<MicroAppMobileHeader
				selectedProject={{ id: "project-1", project_name: "Todo App" } as never}
				hasEntries
				canPublish
				isPublished
				isDatabasePanelOpen={false}
				onBack={vi.fn()}
				onToggleDatabasePanel={vi.fn()}
				onPublish={vi.fn()}
			/>,
		)

		expect(screen.getByTestId("micro-app-mobile-publish-button")).toHaveAccessibleName(
			"microAppPage.publish.published",
		)
	})

	it("does not render publish button without publish permission", () => {
		render(
			<MicroAppMobileHeader
				selectedProject={{ id: "project-1", project_name: "Todo App" } as never}
				hasEntries
				canPublish={false}
				isDatabasePanelOpen={false}
				onBack={vi.fn()}
				onToggleDatabasePanel={vi.fn()}
				onPublish={vi.fn()}
			/>,
		)

		expect(screen.queryByTestId("micro-app-mobile-publish-button")).not.toBeInTheDocument()
	})
})
