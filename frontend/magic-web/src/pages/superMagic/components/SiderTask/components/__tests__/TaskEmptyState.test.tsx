import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

import TaskEmptyState from "../TaskEmptyState"

vi.mock("react-i18next", () => ({
	useTranslation: () => ({ t: (key: string) => key }),
}))

describe("TaskEmptyState", () => {
	it("preserves the empty-state spacing and keeps the create action available", () => {
		const onCreateTask = vi.fn()
		const { container } = render(<TaskEmptyState onCreateTask={onCreateTask} />)

		const emptyState = container.querySelector('[data-slot="project-panel-empty"]')
		expect(emptyState).toHaveClass("gap-6")

		fireEvent.click(screen.getByRole("button", { name: "scheduleTask.createTask" }))
		expect(onCreateTask).toHaveBeenCalledTimes(1)
	})
})
