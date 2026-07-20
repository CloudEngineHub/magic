import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import PlanDataModelFields from "../PlanDataModelFields"

describe("PlanDataModelFields", () => {
	it("keeps long fields in a horizontally scrollable rail", () => {
		render(
			<PlanDataModelFields
				fields={[
					"保留 submitter_user_id：string，用于记录提交用户",
					"新增 configuration_screenshots：json，可选，存储配置截图",
				]}
			/>,
		)

		const scrollContainer = screen.getByTestId("plan-data-model-fields-scroll")
		const rail = screen.getByTestId("plan-data-model-fields-rail")

		expect(scrollContainer).toHaveClass("overflow-x-auto", "overscroll-x-contain")
		expect(rail).toHaveClass("min-w-max", "flex-nowrap")
		expect(screen.getAllByText(/submitter_user_id|configuration_screenshots/)).toHaveLength(2)
		screen.getAllByText(/submitter_user_id|configuration_screenshots/).forEach((field) => {
			expect(field).toHaveClass("shrink-0", "whitespace-nowrap")
		})
	})

	it("does not render an empty scroll container", () => {
		render(<PlanDataModelFields fields={[]} />)

		expect(screen.queryByTestId("plan-data-model-fields-scroll")).not.toBeInTheDocument()
	})
})
