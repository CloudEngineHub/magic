import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { ModelReasoningDetails } from "../ModelReasoningDetails"
import { ModelStatusEnum, type ModelItem } from "../../types"
import modelCache from "@/services/superMagic/topicModel/SuperMagicTopicModelCacheService"

vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: (key: string) => key }) }))
vi.mock("@/services/superMagic/topicModel/SuperMagicTopicModelCacheService", () => ({
	default: { getReasoningEffort: () => undefined, setReasoningEffort: vi.fn() },
}))
vi.mock("@/components/shadcn-ui/scroll-area", () => ({
	ScrollArea: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))

afterEach(cleanup)

/** 只使用允许两档的 mock 模型，验证菜单不会开放其他强度。 */
function setup(
	mobile = false,
	levels: ModelItem["reasoning_effort_levels"] = ["none", "high"],
	multiplier?: number | null,
	maxContextTokens?: number | null,
	withScrollContainer = false,
) {
	const model: ModelItem = {
		id: "mock-model",
		model_id: "mock-model",
		model_name: "Mock model",
		model_description: "Mock description",
		model_icon: "",
		group_id: "mock-group",
		provider_model_id: "mock-provider",
		sort: 0,
		model_status: ModelStatusEnum.Normal,
		reasoning_effort_levels: levels,
		billing_multiplier: multiplier,
		max_context_tokens: maxContextTokens,
	}
	const onReasoningEffortChange = vi.fn()
	const details = (
		<ModelReasoningDetails
			model={model}
			mobile={mobile}
			disabled={false}
			onReasoningEffortChange={onReasoningEffortChange}
		>
			<button data-testid="model-switch-item">Mock row</button>
		</ModelReasoningDetails>
	)
	render(
		withScrollContainer ? (
			<div data-model-switch-scroll-container data-testid="model-switch-scroll-container">
				{details}
			</div>
		) : (
			details
		),
	)
	// Desktop keyboard focus opens the detail menu; mouse users open it by hovering.
	fireEvent.focus(screen.getByTestId("model-switch-item"))
	return { model, onReasoningEffortChange }
}

describe("模型详情思考强度", () => {
	it("桌面详情展示后端倍率和参考说明", () => {
		setup(false, [], 0)
		expect(screen.getByText("0.00x")).toBeTruthy()
		expect(screen.getByText("messageEditor.modelSwitch.billingMultiplierHint")).toBeTruthy()
	})
	it("移动端悬停、焦点和右箭头都不打开详情菜单", () => {
		const model: ModelItem = {
			id: "mock-model",
			model_id: "mock-model",
			model_name: "Mock model",
			model_description: "Mock description",
			model_icon: "",
			group_id: "mock-group",
			provider_model_id: "mock-provider",
			sort: 0,
			model_status: ModelStatusEnum.Normal,
			reasoning_effort_levels: ["none", "high"],
		}
		render(
			<ModelReasoningDetails
				model={model}
				mobile
				disabled={false}
				onReasoningEffortChange={vi.fn()}
			>
				<button data-testid="model-switch-item">Mock row</button>
			</ModelReasoningDetails>,
		)
		const row = screen.getByTestId("model-switch-item")
		fireEvent.focus(row)
		fireEvent.pointerOver(row, { pointerType: "mouse" })
		fireEvent.mouseOver(row)
		fireEvent.keyDown(row, { key: "ArrowRight" })
		expect(screen.queryByRole("dialog")).toBeNull()
		expect(screen.queryByText("Mock description")).toBeNull()
	})
	it("后端关闭倍率时隐藏数值和对应说明", () => {
		setup(false, [], null)
		expect(screen.queryByText("messageEditor.modelSwitch.billingMultiplierHint")).toBeNull()
		expect(screen.queryByText("messageEditor.modelSwitch.billingMultiplier")).toBeNull()
	})
	it("只在模型下发上下文上限时显示上下文窗口", () => {
		setup(false, [], undefined, 1_000_000)
		expect(screen.getByText("messageEditor.modelSwitch.contextWindow")).toBeTruthy()
		expect(screen.getByText("1M")).toBeTruthy()

		cleanup()
		setup(false, [], undefined, null)
		expect(screen.queryByText("messageEditor.modelSwitch.contextWindow")).toBeNull()
	})

	it("Esc 关闭桌面详情并返回模型行，不因恢复焦点再次打开", () => {
		setup(false, [])
		fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" })
		expect(document.activeElement).toBe(screen.getByTestId("model-switch-item"))
		expect(screen.queryByText("Mock description")).toBeNull()
	})
	it("鼠标离开详情卡片时关闭，即使卡片仍保留焦点", () => {
		setup(false)
		const strength = screen.getByRole("button", {
			name: /messageEditor.modelSwitch.reasoning.label/,
		})
		strength.focus()
		const outside = document.createElement("div")
		document.body.appendChild(outside)
		fireEvent.pointerLeave(screen.getByRole("dialog"), { relatedTarget: outside })
		expect(screen.queryByRole("dialog")).toBeNull()
		outside.remove()
	})
	it("从一级模型行经过 Portal 间隙进入二级详情时保持打开", () => {
		setup(false)
		const modelRow = screen.getByTestId("model-switch-item")
		const detail = screen.getByRole("dialog")

		// The empty space between the anchor and its portaled card resolves to body.
		fireEvent.pointerLeave(modelRow, { relatedTarget: document.body })
		expect(screen.getByRole("dialog")).toBe(detail)

		fireEvent.pointerEnter(detail)
		expect(screen.getByRole("dialog")).toBe(detail)
	})
	it("滚动模型列表时关闭详情卡片", () => {
		setup(false, ["none", "high"], undefined, undefined, true)
		fireEvent.scroll(screen.getByTestId("model-switch-scroll-container"))
		expect(screen.queryByRole("dialog")).toBeNull()
	})
	it("键盘右箭头进入详情，默认选择保留可见焦点", () => {
		const { onReasoningEffortChange } = setup()
		const strength = screen.getByRole("button", {
			name: /messageEditor.modelSwitch.reasoning.label/,
		})
		fireEvent.keyDown(screen.getByTestId("model-switch-item"), { key: "ArrowRight" })
		expect(document.activeElement).toBe(strength)
		fireEvent.click(strength)
		const choice = screen.getByRole("button", {
			name: "messageEditor.modelSwitch.reasoning.default",
		})
		choice.focus()
		expect(document.activeElement).toBe(choice)
		fireEvent.click(choice)
		expect(onReasoningEffortChange).toHaveBeenCalledWith(
			expect.objectContaining({ reasoning_effort: null }),
		)
	})

	it("桌面详情打开子菜单，关闭思考保持明确枚举并选择模型", () => {
		const { model, onReasoningEffortChange } = setup()
		fireEvent.click(
			screen.getByRole("button", { name: /messageEditor.modelSwitch.reasoning.label/ }),
		)
		expect(
			screen.queryByRole("button", { name: "messageEditor.modelSwitch.reasoning.low" }),
		).toBeNull()
		fireEvent.click(
			screen.getByRole("button", { name: "messageEditor.modelSwitch.reasoning.none" }),
		)
		expect(modelCache.setReasoningEffort).toHaveBeenCalledWith(model, "none")
		expect(onReasoningEffortChange).toHaveBeenCalledWith({
			...model,
			reasoning_effort: "none",
		})
		expect(model).not.toHaveProperty("reasoning_effort")
	})

	it("无思考档位时详情仍显示默认，且不能打开选择菜单", () => {
		setup(false, [])
		expect(screen.getByText("Mock description")).toBeTruthy()
		const locked = screen.getByTestId("model-switch-reasoning-locked")
		expect(locked).toHaveTextContent("messageEditor.modelSwitch.reasoning.default")
		expect(
			screen.queryByRole("button", { name: /messageEditor.modelSwitch.reasoning.label/ }),
		).toBeNull()
		fireEvent.pointerOver(locked, { pointerType: "mouse" })
		fireEvent.click(locked)
		expect(
			screen.queryByRole("button", { name: "messageEditor.modelSwitch.reasoning.none" }),
		).toBeNull()
	})
})
