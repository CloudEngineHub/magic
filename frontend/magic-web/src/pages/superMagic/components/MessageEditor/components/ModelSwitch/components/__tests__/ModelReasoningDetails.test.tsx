import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
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
	const onSelect = vi.fn()
	render(
		<ModelReasoningDetails model={model} mobile={mobile} disabled={false} onSelect={onSelect}>
			<button data-testid="model-switch-item">Mock row</button>
		</ModelReasoningDetails>,
	)
	if (mobile)
		fireEvent.click(
			screen.getByRole("button", { name: "messageEditor.modelSwitch.reasoning.details" }),
		)
	else fireEvent.focus(screen.getByTestId("model-switch-item"))
	return { model, onSelect }
}

describe("模型详情思考强度", () => {
	it.each([false, true])("桌面及移动详情展示后端倍率和参考说明 mobile=%s", (mobile) => {
		setup(mobile, [], 0)
		expect(screen.getByText("0.00x")).toBeTruthy()
		expect(screen.getByText("messageEditor.modelSwitch.billingMultiplierHint")).toBeTruthy()
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

	it("Esc 关闭桌面详情并返回模型行，不因恢复焦点再次打开", async () => {
		setup(false, [])
		fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" })
		await waitFor(() =>
			expect(document.activeElement === screen.getByTestId("model-switch-item")).toBe(true),
		)
		expect(screen.queryByText("Mock description")).toBeNull()
	})
	it("键盘右箭头进入详情，默认选择保留可见焦点", () => {
		const { onSelect } = setup()
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
		expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ reasoning_effort: null }))
	})

	it("桌面详情打开子菜单，关闭思考保持明确枚举并选择模型", () => {
		const { model, onSelect } = setup()
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
		expect(onSelect).toHaveBeenCalledWith({ ...model, reasoning_effort: "none" })
		expect(model).not.toHaveProperty("reasoning_effort")
	})

	it("移动端在同一面板选择默认，清除覆盖并关闭详情", () => {
		const { model, onSelect } = setup(true)
		fireEvent.click(
			screen.getByRole("button", { name: /messageEditor.modelSwitch.reasoning.label/ }),
		)
		expect(screen.queryByText("Mock description")).toBeNull()
		fireEvent.click(
			screen.getByRole("button", { name: "messageEditor.modelSwitch.reasoning.default" }),
		)
		expect(onSelect).toHaveBeenCalledWith({ ...model, reasoning_effort: null })
		expect(screen.queryByText("Mock description")).toBeNull()
	})

	it("无能力时显示详情但不显示强度入口", () => {
		setup(false, [])
		expect(screen.getByText("Mock description")).toBeTruthy()
		expect(
			screen.queryByRole("button", { name: /messageEditor.modelSwitch.reasoning.label/ }),
		).toBeNull()
	})
})
