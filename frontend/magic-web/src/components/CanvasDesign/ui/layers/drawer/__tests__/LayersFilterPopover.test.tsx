import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { CanvasDesignI18nProvider } from "../../../../app/providers/I18nProvider"
import { ElementTypeEnum } from "../../../../runtime/document/types"
import type { CanvasLayersFilterState } from "../../../../public/magic-types"
import LayersFilterPopover, { LayersFilterForm } from "../LayersFilterPopover"

const defaultFilter: CanvasLayersFilterState = {
	visibility: "all",
	locked: "all",
	types: [],
}

function renderPopover(filter = defaultFilter) {
	return render(
		<CanvasDesignI18nProvider>
			<LayersFilterPopover
				filter={filter}
				isActive={
					filter.visibility !== "all" ||
					filter.locked !== "all" ||
					filter.types.length > 0
				}
				isOpen={false}
				onOpenChange={vi.fn()}
				onFilterChange={vi.fn()}
			/>
		</CanvasDesignI18nProvider>,
	)
}

describe("LayersFilterPopover", () => {
	it("opens the filter controls and exposes all filter groups", () => {
		renderPopover()

		fireEvent.click(screen.getByRole("button", { name: "筛选图层" }))

		expect(screen.getByRole("button", { name: "筛选图层" })).toHaveAttribute(
			"aria-expanded",
			"false",
		)
	})

	it("forwards status, type and reset interactions", () => {
		const onFilterChange = vi.fn()

		render(
			<CanvasDesignI18nProvider>
				<LayersFilterForm filter={defaultFilter} onFilterChange={onFilterChange} />
			</CanvasDesignI18nProvider>,
		)
		fireEvent.click(screen.getByRole("button", { name: "隐藏" }))
		fireEvent.click(screen.getByRole("button", { name: "元素类型" }))
		fireEvent.click(screen.getByRole("option", { name: "图片" }))

		expect(onFilterChange).toHaveBeenCalledWith("visibility", "hidden")
		expect(onFilterChange).toHaveBeenCalledWith("types", [ElementTypeEnum.Image])
	})
})
