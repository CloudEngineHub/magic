import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { ModelReasoningFooter, resolveReasoningFooterModel } from "../ModelReasoningFooter"
import { ModelStatusEnum, type ModelItem } from "../../types"

const { setReasoningEffort } = vi.hoisted(() => ({
	setReasoningEffort: vi.fn(),
}))

vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }))
vi.mock("@/services/superMagic/topicModel/SuperMagicTopicModelCacheService", () => ({
	default: { getReasoningEffort: () => "high", setReasoningEffort },
}))

afterEach(() => {
	cleanup()
	setReasoningEffort.mockClear()
})

function createModel(levels: ModelItem["reasoning_effort_levels"] = ["none", "high"]): ModelItem {
	return {
		id: "qwen",
		model_id: "qwen3.7-max",
		model_name: "Qwen3.7 Max",
		model_description: "A long model description that must stay out of the effort menu.",
		model_icon: "",
		group_id: "qwen",
		provider_model_id: "qwen3.7-max",
		sort: 0,
		model_status: ModelStatusEnum.Normal,
		reasoning_effort_levels: levels,
		billing_multiplier: 5.49,
	}
}

function renderFooter(
	model = createModel(),
	openOn: "hover" | "tap" = "hover",
	layout: "overlay" | "inline" = "overlay",
) {
	const onReasoningEffortChange = vi.fn()
	render(
		<div className="relative flex h-40 flex-col">
			<ModelReasoningFooter
				model={model}
				onReasoningEffortChange={onReasoningEffortChange}
				openOn={openOn}
				layout={layout}
			/>
		</div>,
	)
	return { model, onReasoningEffortChange }
}

function hoverFooter() {
	const footer = screen.getByTestId("model-switch-reasoning-footer")
	// React maps pointerover/mouseover onto the enter handlers.
	fireEvent.pointerOver(footer, { pointerType: "mouse" })
	fireEvent.mouseOver(footer)
}

describe("resolveReasoningFooterModel", () => {
	it("uses the listed model's effort levels and keeps an explicit selection", () => {
		const selected = {
			...createModel([]),
			reasoning_effort: "none" as const,
		}
		const listed = createModel(["none", "high"])

		expect(
			resolveReasoningFooterModel({
				activeTab: "language",
				selectedModel: selected,
				groups: [{ models: [listed] }],
			}),
		).toEqual({ ...listed, reasoning_effort: "none" })
	})

	it("hides the footer on non-language tabs and keeps language models without effort levels", () => {
		const model = createModel(["high"])
		expect(
			resolveReasoningFooterModel({
				activeTab: "image",
				selectedModel: model,
				groups: [{ models: [model] }],
			}),
		).toBeNull()
		const languageModel = createModel([])
		expect(
			resolveReasoningFooterModel({
				activeTab: "language",
				selectedModel: languageModel,
				groups: [{ models: [languageModel] }],
			}),
		).toBe(languageModel)
	})
})

describe("ModelReasoningFooter", () => {
	it("shows the current model and its saved reasoning effort", () => {
		renderFooter()
		expect(screen.getByTestId("model-switch-reasoning-footer")).toHaveClass("absolute")
		expect(screen.getByText("Qwen3.7 Max")).toBeTruthy()
		expect(screen.getByText("messageEditor.modelSwitch.reasoning.high")).toBeTruthy()
	})

	it("opens only the allowed effort choices on hover", () => {
		renderFooter()
		hoverFooter()

		expect(screen.getByTestId("model-switch-reasoning-menu")).toBeTruthy()
		expect(screen.getByTestId("model-switch-reasoning-option-default")).toBeTruthy()
		expect(screen.getByTestId("model-switch-reasoning-option-none")).toBeTruthy()
		expect(screen.getByTestId("model-switch-reasoning-option-high")).toBeTruthy()
		expect(screen.queryByTestId("model-switch-reasoning-option-low")).toBeNull()
		expect(
			screen.queryByText("A long model description that must stay out of the effort menu."),
		).toBeNull()
		expect(screen.queryByText("messageEditor.modelSwitch.billingMultiplier")).toBeNull()
	})

	it("saves the selected effort without mutating the source model", () => {
		const { model, onReasoningEffortChange } = renderFooter()
		hoverFooter()
		fireEvent.click(screen.getByTestId("model-switch-reasoning-option-none"))

		expect(setReasoningEffort).toHaveBeenCalledWith(model, "none")
		expect(onReasoningEffortChange).toHaveBeenCalledWith({
			...model,
			reasoning_effort: "none",
		})
		expect(model).not.toHaveProperty("reasoning_effort")
		expect(screen.queryByTestId("model-switch-reasoning-menu")).toBeNull()
		expect(screen.getByText("messageEditor.modelSwitch.reasoning.none")).toBeTruthy()
	})

	it("opens the effort menu on tap and ignores hover", () => {
		renderFooter(createModel(), "tap")
		hoverFooter()
		expect(screen.queryByTestId("model-switch-reasoning-menu")).toBeNull()

		fireEvent.click(screen.getByTestId("model-switch-reasoning-footer-trigger"))
		expect(screen.getByTestId("model-switch-reasoning-menu")).toBeTruthy()
		expect(screen.getByTestId("model-switch-reasoning-option-none")).toBeTruthy()
		expect(screen.queryByTestId("model-switch-reasoning-option-low")).toBeNull()
	})

	it("closes the tapped menu from outside and saves the chosen effort", () => {
		const { model, onReasoningEffortChange } = renderFooter(createModel(), "tap")
		fireEvent.click(screen.getByTestId("model-switch-reasoning-footer-trigger"))
		fireEvent.pointerDown(document.body)
		expect(screen.queryByTestId("model-switch-reasoning-menu")).toBeNull()

		fireEvent.click(screen.getByTestId("model-switch-reasoning-footer-trigger"))
		fireEvent.click(screen.getByTestId("model-switch-reasoning-option-high"))
		expect(setReasoningEffort).toHaveBeenCalledWith(model, "high")
		expect(onReasoningEffortChange).toHaveBeenCalledWith({
			...model,
			reasoning_effort: "high",
		})
		expect(screen.queryByTestId("model-switch-reasoning-menu")).toBeNull()
	})

	it("places the mobile bar in normal flow above the search field", () => {
		renderFooter(createModel([]), "tap", "inline")
		const footer = screen.getByTestId("model-switch-reasoning-footer")
		expect(footer.className).not.toContain("absolute")
		expect(footer.className).toContain("shrink-0")
		expect(screen.getByText("messageEditor.modelSwitch.reasoning.default")).toBeTruthy()
		expect(screen.queryByText("Qwen3.7 Max")).toBeNull()
		expect(screen.queryByTestId("model-switch-reasoning-option-default")).toBeNull()
	})

	it("lays the mobile reasoning choices out for a direct tap", () => {
		const { model, onReasoningEffortChange } = renderFooter(createModel(), "tap", "inline")
		expect(screen.queryByText("Qwen3.7 Max")).toBeNull()
		expect(screen.queryByTestId("model-switch-reasoning-menu")).toBeNull()
		expect(screen.queryByTestId("model-switch-reasoning-footer-trigger")).toBeNull()
		expect(screen.getByTestId("model-switch-reasoning-option-high")).toHaveAttribute(
			"aria-pressed",
			"true",
		)

		fireEvent.click(screen.getByTestId("model-switch-reasoning-option-none"))
		expect(setReasoningEffort).toHaveBeenCalledWith(model, "none")
		expect(onReasoningEffortChange).toHaveBeenCalledWith({
			...model,
			reasoning_effort: "none",
		})
		expect(screen.getByTestId("model-switch-reasoning-option-none")).toHaveAttribute(
			"aria-pressed",
			"true",
		)
	})

	it("shows a locked default when the model has no effort levels", () => {
		const { onReasoningEffortChange } = renderFooter(createModel([]), "tap")
		expect(screen.getByText("messageEditor.modelSwitch.reasoning.default")).toBeTruthy()
		expect(screen.getByTestId("model-switch-reasoning-footer-trigger")).toBeDisabled()

		hoverFooter()
		fireEvent.click(screen.getByTestId("model-switch-reasoning-footer-trigger"))
		expect(screen.queryByTestId("model-switch-reasoning-menu")).toBeNull()
		expect(onReasoningEffortChange).not.toHaveBeenCalled()
	})

	it("clears the saved effort when default is selected", () => {
		const { model, onReasoningEffortChange } = renderFooter()
		hoverFooter()
		fireEvent.click(screen.getByTestId("model-switch-reasoning-option-default"))

		expect(setReasoningEffort).toHaveBeenCalledWith(model, undefined)
		expect(onReasoningEffortChange).toHaveBeenCalledWith({
			...model,
			reasoning_effort: null,
		})
	})
})
