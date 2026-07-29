import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import type { IdentifiedOptionItem } from "../../types"
import { EditableGrid } from "../EditableGrid"

describe("EditableGrid", () => {
	it("uses the stable option value for selection and deletion", () => {
		const firstItem: IdentifiedOptionItem = {
			label: "First",
			value: "item-1",
			prompt: "Same prompt",
		}
		const secondItem: IdentifiedOptionItem = {
			label: "Second",
			value: "item-2",
			prompt: "Same prompt",
		}
		const onSelect = vi.fn()
		const onDelete = vi.fn()

		render(
			<EditableGrid
				items={[firstItem, secondItem]}
				selectedKeys={new Set(["item-2"])}
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
