import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import AiActionButton from "../components/SelfMediaInitPanel/components/ai/AiActionButton"

vi.mock("../components/SelfMediaInitPanel/components/picker/ModelSelector", () => ({
	default: ({
		disabled,
		disabledReason,
		onChange,
	}: {
		disabled?: boolean
		disabledReason?: string
		onChange: (modelId: string) => void
	}) => (
		<button
			type="button"
			data-testid="model-selector"
			disabled={disabled}
			title={disabledReason}
			onClick={() => onChange("model-b")}
		>
			Model
		</button>
	),
}))

describe("AiActionButton", () => {
	it("disables the model selector while keeping the disabled reason available", () => {
		const onModelChange = vi.fn()
		const onClick = vi.fn()
		const reason = "Add a title first so AI can generate card content."

		render(
			<AiActionButton
				modelValue="model-a"
				onModelChange={onModelChange}
				disabled
				disabledReason={reason}
				onClick={onClick}
				label="Generate"
			/>,
		)

		const modelSelector = screen.getByTestId("model-selector")
		const actionButton = screen.getByRole("button", { name: "Generate" })

		expect(modelSelector).toBeDisabled()
		expect(modelSelector).toHaveAttribute("title", reason)
		expect(actionButton).toBeDisabled()
		expect(actionButton).toHaveAccessibleDescription(reason)

		fireEvent.click(modelSelector)
		fireEvent.click(actionButton)

		expect(onModelChange).not.toHaveBeenCalled()
		expect(onClick).not.toHaveBeenCalled()
	})
})
