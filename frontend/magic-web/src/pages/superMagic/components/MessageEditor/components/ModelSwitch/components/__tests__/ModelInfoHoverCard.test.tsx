import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { ModelInfoHoverCard, formatContextWindow } from "../ModelInfoHoverCard"
import { ModelStatusEnum, type ModelItem } from "../../types"

vi.mock("react-i18next", () => ({
	useTranslation: () => ({
		t: (key: string, options?: { value?: string }) =>
			options?.value ? `${key}:${options.value}` : key,
	}),
}))

beforeEach(() => {
	vi.useFakeTimers()
})

afterEach(() => {
	cleanup()
	vi.useRealTimers()
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

function renderCard(model = createModel()) {
	const onSelect = vi.fn()
	render(
		<ModelInfoHoverCard model={model}>
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
	// HoverCard 使用默认 700ms 打开延迟，与项目 Tooltip 规范一致。
	act(() => {
		vi.advanceTimersByTime(700)
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
	it("opens a read-only card after the hover delay", () => {
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
		// 卡片只读：没有任何按钮或可聚焦元素。
		expect(card.querySelectorAll("button, [tabindex]")).toHaveLength(0)
		expect(card).not.toHaveTextContent("messageEditor.modelSwitch.reasoning.label")
	})

	it("keeps the row click working and does not open the card instantly", () => {
		const { model, onSelect } = renderCard()
		fireEvent.click(screen.getByTestId("model-switch-item"))
		expect(onSelect).toHaveBeenCalledWith(model)
		expect(screen.queryByTestId("model-info-hover-card")).toBeNull()
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
