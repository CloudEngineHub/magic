import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import StepNavigation from "../components/SelfMediaInitPanel/steps/StepNavigation"

vi.mock("react-i18next", () => ({
	initReactI18next: {
		type: "3rdParty",
		init: vi.fn(),
	},
	useTranslation: () => ({
		t: (key: string, options?: Record<string, string>) => {
			if (key === "detail.selfMedia.initPanel.nav.backHome") return "回到首页"
			if (key === "detail.selfMedia.initPanel.nav.clear") return "清空"
			if (key === "detail.selfMedia.initPanel.nav.prev") return "上一步"
			if (key === "detail.selfMedia.initPanel.nav.next") return "下一步"
			if (key === "detail.selfMedia.initPanel.nav.stepCurrent") {
				return `当前步骤：${options?.title ?? ""}`
			}
			if (key === "detail.selfMedia.initPanel.nav.stepCompleted") {
				return `已完成：${options?.title ?? ""}`
			}
			if (key === "detail.selfMedia.initPanel.nav.stepUpcoming") {
				return `待完成：${options?.title ?? ""}`
			}
			return key
		},
	}),
}))

describe("StepNavigation", () => {
	it("renders the final AI creation action in the shared footer without home or clear tools", () => {
		const onFinalClick = vi.fn()

		render(
			<StepNavigation
				currentStep={2}
				canProceed
				hasAnyInitData
				onNext={vi.fn()}
				onPrev={vi.fn()}
				onClear={vi.fn()}
				onNavigate={vi.fn()}
				onBackHome={vi.fn()}
				finalAction={{
					label: "开始 AI 创作（共 1 篇）",
					onClick: onFinalClick,
					disabled: false,
				}}
			/>,
		)

		expect(
			screen.queryByTestId("self-media-init-panel-back-home-button"),
		).not.toBeInTheDocument()
		expect(screen.queryByTestId("self-media-init-panel-clear-button")).not.toBeInTheDocument()

		fireEvent.click(screen.getByRole("button", { name: /开始 AI 创作/ }))

		expect(onFinalClick).toHaveBeenCalledTimes(1)
		expect(screen.getByTestId("self-media-init-panel-footer-final-action")).toHaveClass(
			"items-end",
		)
	})
})
