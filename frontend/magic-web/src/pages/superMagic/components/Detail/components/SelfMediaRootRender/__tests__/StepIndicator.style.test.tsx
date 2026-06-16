import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import StepIndicator from "../components/SelfMediaInitPanel/steps/StepIndicator"

vi.mock("react-i18next", () => ({
	useTranslation: () => ({
		t: (key: string, options?: Record<string, string>) => {
			const messages: Record<string, string> = {
				"detail.selfMedia.initPanel.nav.stepCompleted": "已完成：{{title}}",
				"detail.selfMedia.initPanel.nav.stepCurrent": "当前步骤：{{title}}",
				"detail.selfMedia.initPanel.nav.stepPosition": "第 {{index}} 步，共 {{total}} 步",
				"detail.selfMedia.initPanel.nav.stepUpcoming": "待完成：{{title}}",
				"detail.selfMedia.initPanel.nav.stepShortBrand": "定位",
				"detail.selfMedia.initPanel.nav.stepShortConfirm": "确认",
				"detail.selfMedia.initPanel.nav.stepShortTopics": "选题",
				"detail.selfMedia.initPanel.steps.brand": "欢迎与定位",
				"detail.selfMedia.initPanel.steps.confirm": "确认生成",
				"detail.selfMedia.initPanel.steps.topics": "选题与内容规划",
			}
			return (messages[key] || key).replace(/\{\{(\w+)\}\}/g, (_, token: string) =>
				String(options?.[token] ?? ""),
			)
		},
	}),
}))

describe("StepIndicator guided navigation", () => {
	it("keeps future steps disabled so users follow the guided flow", () => {
		const onNavigate = vi.fn()

		render(<StepIndicator currentStep={1} onNavigate={onNavigate} />)

		expect(screen.getByRole("button", { name: "当前步骤：选题与内容规划" })).toHaveAttribute(
			"aria-current",
			"step",
		)
		expect(screen.getByRole("button", { name: "已完成：欢迎与定位" })).toBeEnabled()
		expect(screen.getByRole("button", { name: "待完成：确认生成" })).toBeDisabled()
		expect(screen.getByText("第 2 步，共 3 步")).toBeInTheDocument()
		expect(screen.queryByText("步骤 2/3")).not.toBeInTheDocument()
		expect(screen.queryByText("选题与内容规划")).not.toBeInTheDocument()
		expect(screen.getByText("定位")).toBeInTheDocument()
		expect(screen.getByText("选题")).toBeInTheDocument()
		expect(screen.getByText("确认")).toBeInTheDocument()
		expect(screen.getByTestId("self-media-step-track")).toHaveClass("static")

		fireEvent.click(screen.getByRole("button", { name: "待完成：确认生成" }))
		fireEvent.click(screen.getByRole("button", { name: "已完成：欢迎与定位" }))

		expect(onNavigate).toHaveBeenCalledTimes(1)
		expect(onNavigate).toHaveBeenCalledWith(0)
	})
})
