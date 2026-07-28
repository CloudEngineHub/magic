import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import type { OptionItem } from "../../types"
import { EditableGrid } from "../EditableGrid"

describe("EditableGrid", () => {
	it("uses the runtime item key for duplicate prompt selection and deletion", () => {
		const firstItem: OptionItem = { label: "First", value: "Same prompt" }
		const secondItem: OptionItem = { label: "Second", value: "Same prompt" }
		const onSelect = vi.fn()
		const onDelete = vi.fn()

		render(
			<EditableGrid
				items={[firstItem, secondItem]}
				selectedKeys={new Set(["item-2"])}
				getItemKey={(item) => (item === firstItem ? "item-1" : "item-2")}
				onSelect={onSelect}
				onEdit={vi.fn()}
				onDelete={onDelete}
			/>,
		)

		expect(screen.getByTestId("editable-grid-card-checkbox-item-1")).toHaveAttribute(
			"data-state",
			"unchecked",
		)
		expect(screen.getByTestId("editable-grid-card-checkbox-item-2")).toHaveAttribute(
			"data-state",
			"checked",
		)

		fireEvent.click(screen.getByTestId("editable-grid-card-checkbox-item-1"))
		expect(onSelect).toHaveBeenCalledWith("item-1", true)

		fireEvent.click(screen.getByTestId("editable-grid-card-delete-item-2"))
		expect(onDelete).toHaveBeenCalledWith("item-2")
	})
})
