import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import PlanDataModelFields from "../PlanDataModelFields"

describe("PlanDataModelFields", () => {
	it("keeps long fields in a horizontally scrollable rail", () => {
		render(
			<PlanDataModelFields
				fields={[
					{
						name: "submitter_user_id",
						type: "string",
						description: "记录提交用户",
						text: "",
						details: [],
					},
					{
						name: "configuration_screenshots",
						type: "json",
						description: "存储配置截图",
						text: "",
						details: [{ label: "required", value: "false" }],
					},
				]}
			/>,
		)

		const scrollContainer = screen.getByTestId("plan-data-model-fields-scroll")
		const rail = screen.getByTestId("plan-data-model-fields-rail")

		expect(scrollContainer).toHaveClass("overflow-x-auto", "overscroll-x-contain")
		expect(rail).toHaveClass("min-w-max", "flex-nowrap")
		expect(screen.getAllByTestId("plan-data-model-field")).toHaveLength(2)
		expect(screen.getByText("submitter_user_id")).toBeInTheDocument()
		expect(screen.getByText("string")).toBeInTheDocument()
		expect(screen.getByText("记录提交用户")).toBeInTheDocument()
		expect(screen.getByText("configuration_screenshots")).toBeInTheDocument()
		expect(screen.getByText("json")).toBeInTheDocument()
		expect(screen.getByText("存储配置截图")).toBeInTheDocument()
		expect(screen.getByText("required")).toBeInTheDocument()
		expect(screen.getByText("false")).toBeInTheDocument()
		expect(screen.queryByText(/\{.*\}/)).not.toBeInTheDocument()
	})

	it("does not render an empty scroll container", () => {
		render(<PlanDataModelFields fields={[]} />)

		expect(screen.queryByTestId("plan-data-model-fields-scroll")).not.toBeInTheDocument()
	})
})
