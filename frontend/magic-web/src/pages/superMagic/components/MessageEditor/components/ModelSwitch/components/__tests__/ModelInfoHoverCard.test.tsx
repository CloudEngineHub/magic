import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import {
	MODEL_INFO_HOVER_OPEN_DELAY_MS,
	ModelInfoHoverCard,
	formatContextWindow,
} from "../ModelInfoHoverCard"
import { ModelStatusEnum, type ModelItem } from "../../types"

const { setReasoningEffort } = vi.hoisted(() => ({
	setReasoningEffort: vi.fn(),
}))

vi.mock("react-i18next", () => ({
	useTranslation: () => ({
		t: (key: string, options?: { value?: string }) =>
			options?.value ? `${key}:${options.value}` : key,
	}),
}))
vi.mock("@/services/superMagic/topicModel/SuperMagicTopicModelCacheService", () => ({
	default: { getReasoningEffort: () => undefined, setReasoningEffort },
}))

beforeEach(() => {
	vi.useFakeTimers()
})

afterEach(() => {
	cleanup()
	vi.useRealTimers()
	setReasoningEffort.mockClear()
})

function createModel(overrides: Partial<ModelItem> = {}): ModelItem {
	return {
		id: "qwen",
		model_id: "qwen3.7-max",
		model_name: "Qwen3.7 Max",
		model_description: "Long context flagship.",
		model_icon: "",
		group_id: "qwen",
		provider_model_id: "qwen3.7-max",
		sort: 0,
		model_status: ModelStatusEnum.Normal,
		max_context_tokens: 128_000,
		billing_multiplier: 0.42,
		...overrides,
	}
}

function renderCard(model = createModel(), onReasoningEffortChange?: (model: ModelItem) => void) {
	const onSelect = vi.fn()
	render(
		<ModelInfoHoverCard model={model} onReasoningEffortChange={onReasoningEffortChange}>
			<div data-testid="model-switch-item" onClick={() => onSelect(model)}>
				{model.model_name}
			</div>
		</ModelInfoHoverCard>,
	)
	return { model, onSelect }
}

function hoverRow() {
	const row = screen.getByTestId("model-switch-item")
	fireEvent.pointerEnter(row, { pointerType: "mouse" })
	act(() => {
		vi.advanceTimersByTime(MODEL_INFO_HOVER_OPEN_DELAY_MS)
	})
}

describe("formatContextWindow", () => {
	it("formats tokens into K and M units", () => {
		expect(formatContextWindow(128_000)).toBe("128K")
		expect(formatContextWindow(1_000_000)).toBe("1M")
		expect(formatContextWindow(1_500_000)).toBe("1.5M")
		expect(formatContextWindow(512)).toBe("512")
		expect(formatContextWindow(0)).toBeNull()
		expect(formatContextWindow(null)).toBeNull()
	})
})

describe("ModelInfoHoverCard", () => {
	it("opens quickly with the model facts and no reasoning controls for models without levels", () => {
		renderCard()
		expect(screen.queryByTestId("model-info-hover-card")).toBeNull()

		hoverRow()

		const card = screen.getByTestId("model-info-hover-card")
		expect(card).toHaveTextContent("Qwen3.7 Max")
		expect(card).toHaveTextContent("Long context flagship.")
		expect(card).toHaveTextContent("messageEditor.modelSwitch.contextWindow")
		expect(card).toHaveTextContent("128K")
		expect(card).toHaveTextContent("messageEditor.modelSwitch.billingMultiplier")
		expect(card).toHaveTextContent("0.42")
		expect(card).toHaveTextContent("messageEditor.modelSwitch.billingMultiplierHint")
		expect(card.querySelectorAll("button")).toHaveLength(0)
		expect(card).not.toHaveTextContent("messageEditor.modelSwitch.reasoning.label")
	})

	it("keeps the row click working and does not open the card instantly", () => {
		const { model, onSelect } = renderCard()
		fireEvent.click(screen.getByTestId("model-switch-item"))
		expect(onSelect).toHaveBeenCalledWith(model)
		expect(screen.queryByTestId("model-info-hover-card")).toBeNull()
	})

	it("lets the user pick a reasoning effort for the hovered model in one click", () => {
		const onReasoningEffortChange = vi.fn()
		const { model } = renderCard(
			createModel({
				reasoning_effort_levels: ["low", "high"],
				reasoning_effort_default: "low",
			}),
			onReasoningEffortChange,
		)
		hoverRow()

		const card = screen.getByTestId("model-info-hover-card")
		expect(card).toHaveTextContent("messageEditor.modelSwitch.reasoning.label")
		expect(screen.getByTestId("model-info-reasoning-option-default")).toBeTruthy()
		expect(screen.queryByTestId("model-info-reasoning-option-medium")).toBeNull()
		// 后台默认是 low，没有用户覆盖时它显示为已选。
		expect(screen.getByTestId("model-info-reasoning-option-low")).toHaveAttribute(
			"aria-pressed",
			"true",
		)

		fireEvent.click(screen.getByTestId("model-info-reasoning-option-high"))
		expect(setReasoningEffort).toHaveBeenCalledWith(model, "high")
		expect(onReasoningEffortChange).toHaveBeenCalledWith({
			...model,
			reasoning_effort: "high",
		})

		fireEvent.click(screen.getByTestId("model-info-reasoning-option-default"))
		expect(setReasoningEffort).toHaveBeenLastCalledWith(model, undefined)
		expect(onReasoningEffortChange).toHaveBeenLastCalledWith({
			...model,
			reasoning_effort: null,
		})
	})

	it("hides the reasoning section when the card is read-only, even if the model has levels", () => {
		renderCard(createModel({ reasoning_effort_levels: ["low", "high"] }))
		hoverRow()
		expect(screen.getByTestId("model-info-hover-card")).not.toHaveTextContent(
			"messageEditor.modelSwitch.reasoning.label",
		)
	})

	it("hides the sections that have no data and skips the card entirely when nothing is left", () => {
		renderCard(createModel({ max_context_tokens: null, billing_multiplier: null }))
		hoverRow()
		const card = screen.getByTestId("model-info-hover-card")
		expect(card).not.toHaveTextContent("messageEditor.modelSwitch.contextWindow")
		expect(card).not.toHaveTextContent("messageEditor.modelSwitch.billingMultiplier")
		cleanup()

		renderCard(
			createModel({
				model_description: "",
				max_context_tokens: null,
				billing_multiplier: null,
			}),
		)
		hoverRow()
		expect(screen.queryByTestId("model-info-hover-card")).toBeNull()
		expect(screen.getByTestId("model-switch-item")).toBeTruthy()
	})
})
