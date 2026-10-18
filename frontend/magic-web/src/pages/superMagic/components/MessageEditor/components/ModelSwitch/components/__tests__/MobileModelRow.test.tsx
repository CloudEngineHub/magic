import { createRef, type ReactNode } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react"
import { MobileModelRow } from "../MobileModelRow"
import { ModelListContent } from "../ModelListContent"
import {
	ModelStatusEnum,
	type ModelItem,
	type ModelListGroup,
	type ReasoningEffort,
} from "../../types"

const cache = vi.hoisted(() => ({
	values: new Map<string, ReasoningEffort>(),
	setReasoningEffort: vi.fn(),
}))

vi.mock("react-i18next", () => ({
	useTranslation: () => ({
		t: (key: string, values?: { name?: string; level?: string }) =>
			key.endsWith("detailsFor") ? `Details ${values?.name}` : key,
	}),
}))
vi.mock("@/services/superMagic/topicModel/SuperMagicTopicModelCacheService", () => ({
	default: {
		getReasoningEffort: (model: ModelItem) => {
			const value = cache.values.get(model.model_id)
			return value && model.reasoning_effort_levels?.includes(value) ? value : undefined
		},
		setReasoningEffort: cache.setReasoningEffort,
	},
}))
vi.mock("../ModelIcon", () => ({ default: () => <span /> }))
vi.mock("../ModelName", () => ({
	default: ({ model }: { model: ModelItem }) => <span>{model.model_name}</span>,
}))
vi.mock("../ModelTags", () => ({ default: () => null }))
vi.mock("../ProviderName", () => ({ default: () => null }))
vi.mock("../MyModelsList", () => ({ MyModelsList: () => null }))
vi.mock("@/components/base/FlexBox", () => ({
	default: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
}))
vi.mock("../../utils", () => ({ isModelDisabled: () => false }))

beforeEach(() => {
	cache.values.clear()
	cache.setReasoningEffort.mockReset()
	vi.stubGlobal(
		"ResizeObserver",
		vi.fn(() => ({
			observe: vi.fn(),
			unobserve: vi.fn(),
			disconnect: vi.fn(),
		})),
	)
})
afterEach(() => {
	cleanup()
	vi.unstubAllGlobals()
	vi.restoreAllMocks()
})

/** 合成模型只声明两个可选档位，避免将设计稿中的全部档位当作真实能力。 */
function model(id = "mock-model"): ModelItem {
	return {
		id,
		model_id: id,
		model_name: id,
		model_description: "Mock description",
		model_icon: "",
		group_id: "mock-group",
		provider_model_id: "mock-provider",
		sort: 0,
		model_status: ModelStatusEnum.Normal,
		reasoning_effort_levels: ["none", "high"],
		billing_multiplier: 0,
	}
}

/** 直接渲染模型行，展开由调用方控制，选择仅记录到 mock。 */
function setup(overrides: Partial<Parameters<typeof MobileModelRow>[0]> = {}) {
	const item = model()
	const props = {
		model: item,
		description: item.model_description,
		selected: true,
		disabled: false,
		expanded: true,
		selectedItemRef: createRef<HTMLDivElement>(),
		onToggle: vi.fn(),
		onSelect: vi.fn(),
		...overrides,
	}
	const result = render(<MobileModelRow {...props} />)
	return { ...result, props }
}

describe("移动端模型行内设置", () => {
	it("收起时显示零倍率，参考说明和描述仅在展开区域内显示", () => {
		const { props, rerender } = setup({ expanded: false })
		expect(screen.getByText("0.00x")).toBeTruthy()
		expect(screen.queryByText("Mock description")).toBeNull()
		expect(screen.queryByText("messageEditor.modelSwitch.billingMultiplierHint")).toBeNull()
		rerender(<MobileModelRow {...props} expanded />)
		const details = screen.getByTestId("mobile-model-details")
		expect(within(details).getByText("Mock description")).toBeTruthy()
		expect(
			within(details).getByText("messageEditor.modelSwitch.billingMultiplierHint"),
		).toBeTruthy()
	})

	it("箭头不选择模型，名称选择沿用原有回调", () => {
		const { props } = setup({ expanded: false })
		fireEvent.click(screen.getByRole("button", { name: "Details mock-model" }))
		expect(props.onToggle).toHaveBeenCalledOnce()
		expect(props.onSelect).not.toHaveBeenCalled()
		fireEvent.click(screen.getByRole("button", { name: "mock-model" }))
		expect(props.onSelect).toHaveBeenCalledWith(props.model)
	})

	it("桌面端选中模型点击名称也只展开详情，不重复选择模型", () => {
		const { props } = setup({ variant: "desktop", expanded: false })

		fireEvent.click(screen.getByRole("button", { name: "mock-model" }))

		expect(props.onToggle).toHaveBeenCalledOnce()
		expect(props.onSelect).not.toHaveBeenCalled()
	})

	it("只开放后端档位，明确关闭与默认快照分别保存 none 和 null", () => {
		const { props } = setup()
		expect(
			screen.queryByRole("button", { name: "messageEditor.modelSwitch.reasoning.low" }),
		).toBeNull()
		fireEvent.click(
			screen.getByRole("button", { name: "messageEditor.modelSwitch.reasoning.none" }),
		)
		expect(cache.setReasoningEffort).toHaveBeenLastCalledWith(props.model, "none")
		expect(props.onSelect).toHaveBeenLastCalledWith({
			...props.model,
			reasoning_effort: "none",
		})
		fireEvent.click(
			screen.getByRole("button", { name: "messageEditor.modelSwitch.reasoning.default" }),
		)
		expect(cache.setReasoningEffort).toHaveBeenLastCalledWith(props.model, undefined)
		expect(props.onSelect).toHaveBeenLastCalledWith({ ...props.model, reasoning_effort: null })
	})

	it("选择思考强度使用独立回调，不触发模型选择回调", () => {
		const onReasoningEffortChange = vi.fn()
		const { props } = setup({ onReasoningEffortChange })

		fireEvent.click(
			screen.getByRole("button", { name: "messageEditor.modelSwitch.reasoning.high" }),
		)

		expect(onReasoningEffortChange).toHaveBeenCalledWith({
			...props.model,
			reasoning_effort: "high",
		})
		expect(props.onSelect).not.toHaveBeenCalled()
	})

	it("显示已存偏好，移除档位后不继续显示旧选择", () => {
		cache.values.set("mock-model", "high")
		const { props, rerender } = setup()
		expect(
			screen
				.getByRole("button", { name: "messageEditor.modelSwitch.reasoning.high" })
				.getAttribute("aria-pressed"),
		).toBe("true")
		rerender(
			<MobileModelRow
				{...props}
				model={{ ...props.model, reasoning_effort_levels: ["none"] }}
			/>,
		)
		expect(
			screen
				.getByRole("button", { name: "messageEditor.modelSwitch.reasoning.default" })
				.getAttribute("aria-pressed"),
		).toBe("true")
	})

	it("禁用模型的名称、箭头和等级均不可操作", () => {
		const { props } = setup({ disabled: true })
		for (const button of screen.getAllByRole("button")) {
			expect((button as HTMLButtonElement).disabled).toBe(true)
			fireEvent.click(button)
		}
		expect(props.onToggle).not.toHaveBeenCalled()
		expect(props.onSelect).not.toHaveBeenCalled()
		expect(cache.setReasoningEffort).not.toHaveBeenCalled()
	})

	it("空能力及无效倍率不产生设置入口，描述仍可独立展示", () => {
		const item = { ...model(), reasoning_effort_levels: [], billing_multiplier: null }
		const { props, rerender } = setup({ model: item, description: undefined })
		expect(screen.queryByRole("button", { name: "Details mock-model" })).toBeNull()
		rerender(<MobileModelRow {...props} description="Only description" />)
		expect(screen.getByText("Only description")).toBeTruthy()
		expect(screen.queryByRole("group")).toBeNull()
		expect(screen.queryByText("messageEditor.modelSwitch.billingMultiplierHint")).toBeNull()
	})

	it("长描述的展开入口独立成行，点击不会触发模型选择", () => {
		vi.spyOn(HTMLElement.prototype, "scrollHeight", "get").mockReturnValue(80)
		vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockReturnValue(40)
		const { props } = setup()
		fireEvent.click(
			screen.getByRole("button", {
				name: "messageEditor.modelSwitch.expandDescriptionShort",
			}),
		)
		expect(
			screen
				.getByRole("button", { name: "messageEditor.modelSwitch.collapseDescriptionShort" })
				.getAttribute("aria-expanded"),
		).toBe("true")
		expect(props.onSelect).not.toHaveBeenCalled()
	})

	it("跨模型分组只展开一个模型，再点箭头收起且不选择", () => {
		const onSelect = vi.fn()
		const groups: ModelListGroup[] = ["mock-a", "mock-b"].map((id) => ({
			group: {
				id,
				name: id,
				mode_id: "mock-mode",
				icon: "",
				color: "",
				description: "",
				sort: 0,
				status: true,
				created_at: "2026-10-15T00:00:00Z",
			},
			models: [model(id)],
			model_ids: [id],
			image_model_ids: [],
			video_model_ids: [],
		}))
		render(
			<ModelListContent
				modelList={groups}
				selectedModel={groups[0].models[0]}
				searchKeyword=""
				size="mobile"
				onModelClick={onSelect}
				selectedItemRef={createRef<HTMLDivElement>()}
				getModelDescription={(item) => item.model_description}
			/>,
		)
		expect(screen.queryByTestId("mobile-model-details")).toBeNull()
		fireEvent.click(screen.getByRole("button", { name: "Details mock-a" }))
		expect(screen.getAllByTestId("mobile-model-details")).toHaveLength(1)
		fireEvent.click(screen.getByRole("button", { name: "Details mock-b" }))
		expect(screen.getAllByTestId("mobile-model-details")).toHaveLength(1)
		expect(
			screen.getByRole("button", { name: "Details mock-a" }).getAttribute("aria-expanded"),
		).toBe("false")
		fireEvent.click(screen.getByRole("button", { name: "Details mock-b" }))
		expect(screen.queryByTestId("mobile-model-details")).toBeNull()
		expect(onSelect).not.toHaveBeenCalled()
	})
})
