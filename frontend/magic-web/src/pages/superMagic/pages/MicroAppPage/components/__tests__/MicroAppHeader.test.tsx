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
			isDatabasePanelOpen={false}
			onBack={vi.fn()}
			onToggleDatabasePanel={vi.fn()}
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

	it("renders database button and triggers callback", () => {
		const onToggleDatabasePanel = vi.fn()
		renderHeader({ onToggleDatabasePanel })

		fireEvent.click(screen.getByTestId("micro-app-database-button"))

		expect(onToggleDatabasePanel).toHaveBeenCalledTimes(1)
	})
})
