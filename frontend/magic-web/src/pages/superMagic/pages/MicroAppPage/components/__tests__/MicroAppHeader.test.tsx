import { fireEvent, render, screen } from "@testing-library/react"
import type { ComponentProps } from "react"
import { describe, expect, it, vi } from "vitest"
import type { ProjectListItem } from "@/pages/superMagic/pages/Workspace/types"
import MicroAppHeader from "../MicroAppHeader"

vi.mock("react-i18next", () => ({
	useTranslation: () => ({
		t: (key: string) => key,
	}),
}))

const project = {
	id: "project-1",
	project_name: "Demo App",
} as ProjectListItem

function renderHeader(props: Partial<ComponentProps<typeof MicroAppHeader>> = {}) {
	return render(
		<MicroAppHeader
			selectedProject={project}
			hasEntries={false}
			onBack={vi.fn()}
			onPublish={vi.fn()}
			{...props}
		/>,
	)
}

describe("MicroAppHeader", () => {
	it("does not render publish button when there is no root html file", () => {
		renderHeader()

		expect(screen.queryByTestId("micro-app-publish-button")).not.toBeInTheDocument()
	})

	it("renders publish button when root html exists and triggers callback", () => {
		const onPublish = vi.fn()
		renderHeader({
			hasEntries: true,
			onPublish,
		})

		fireEvent.click(screen.getByTestId("micro-app-publish-button"))

		expect(onPublish).toHaveBeenCalledTimes(1)
	})

	it("hides collaborator management when the project is not manageable", () => {
		renderHeader({
			canManageCollaborators: false,
			onManageCollaborators: vi.fn(),
		})

		expect(screen.queryByTestId("micro-app-manage-collaborators")).not.toBeInTheDocument()
	})

	it("renders collaborator management when the project is manageable", () => {
		renderHeader({
			canManageCollaborators: true,
			onManageCollaborators: vi.fn(),
		})

		expect(screen.getByTestId("micro-app-manage-collaborators")).toBeInTheDocument()
	})

	it("renders the rename entry for editable projects", () => {
		const onRename = vi.fn()
		renderHeader({ canRename: true, onRename })

		fireEvent.click(screen.getByTestId("micro-app-rename-button"))

		expect(onRename).toHaveBeenCalledOnce()
	})

	it("does not render the rename entry for read-only projects", () => {
		renderHeader({ canRename: false, onRename: vi.fn() })

		expect(screen.queryByTestId("micro-app-rename-button")).not.toBeInTheDocument()
	})
})
