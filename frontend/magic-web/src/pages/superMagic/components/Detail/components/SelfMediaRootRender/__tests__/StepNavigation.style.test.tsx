import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import StepNavigation from "../components/SelfMediaInitPanel/steps/StepNavigation"

vi.mock("react-i18next", () => ({
	useTranslation: () => ({
		t: (key: string, options?: Record<string, string>) => {
			const messages: Record<string, string> = {
				"detail.selfMedia.initPanel.nav.backHome": "返回首页",
				"detail.selfMedia.initPanel.nav.clear": "清空数据",
				"detail.selfMedia.initPanel.nav.next": "下一步",
				"detail.selfMedia.initPanel.nav.nextWithHint": "下一步：{{hint}}",
				"detail.selfMedia.initPanel.nav.prev": "上一步",
				"detail.selfMedia.initPanel.nav.stepCompleted": "已完成：{{title}}",
				"detail.selfMedia.initPanel.nav.stepCurrent": "当前步骤：{{title}}",
				"detail.selfMedia.initPanel.nav.stepUpcoming": "待完成：{{title}}",
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

vi.mock("@/components/base/MagicTooltip", () => ({
	default: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))

describe("StepNavigation visual chrome", () => {
	it("uses safe-area aware padding, shadcn buttons, and semantic step state", () => {
		const onNavigate = vi.fn()

		render(
			<StepNavigation
				currentStep={1}
				canProceed
				hasAnyInitData
				onNext={vi.fn()}
				onPrev={vi.fn()}
				onClear={vi.fn()}
				onNavigate={onNavigate}
				onBackHome={vi.fn()}
				proceedHint="选题已经补全，可以确认生成"
			/>,
		)

		expect(screen.getByTestId("self-media-init-panel-footer").className).toContain(
			"pb-[max(var(--safe-area-inset-bottom),1.5rem)]",
		)
		expect(screen.getByTestId("self-media-init-panel-footer")).not.toHaveClass("border-t")
		expect(screen.getByTestId("self-media-init-panel-back-home-button")).toHaveAttribute(
			"data-slot",
			"button",
		)
		expect(screen.getByTestId("self-media-init-panel-clear-button")).toHaveAttribute(
			"data-slot",
			"button",
		)
		expect(screen.getByTestId("self-media-init-panel-prev-button")).toHaveAttribute(
			"data-slot",
			"button",
		)
		expect(screen.getByRole("button", { name: "当前步骤：选题与内容规划" })).toHaveAttribute(
			"aria-current",
			"step",
		)
		expect(screen.getByRole("button", { name: "已完成：欢迎与定位" })).not.toHaveAttribute(
			"aria-current",
		)
		expect(screen.getByRole("button", { name: "待完成：确认生成" })).not.toHaveAttribute(
			"aria-current",
		)
		expect(screen.getByRole("button", { name: "待完成：确认生成" })).toBeDisabled()

		fireEvent.click(screen.getByRole("button", { name: "待完成：确认生成" }))

		expect(onNavigate).not.toHaveBeenCalledWith(2)
		expect(screen.queryByTestId("self-media-init-panel-proceed-hint")).not.toBeInTheDocument()
		expect(
			screen.getByRole("button", { name: "下一步：选题已经补全，可以确认生成" }),
		).toBeEnabled()
	})

	it("shows only blocking hints as visible microcopy", () => {
		render(
			<StepNavigation
				currentStep={1}
				canProceed={false}
				hasAnyInitData
				onNext={vi.fn()}
				onPrev={vi.fn()}
				onClear={vi.fn()}
				onNavigate={vi.fn()}
				proceedHint="先补全每篇文章标题"
			/>,
		)

		expect(screen.getByTestId("self-media-init-panel-proceed-hint")).toHaveTextContent(
			"先补全每篇文章标题",
		)
		const hint = screen.getByTestId("self-media-init-panel-proceed-hint")
		const nextButton = screen.getByRole("button", {
			name: "下一步：先补全每篇文章标题",
		})

		expect(nextButton).toBeDisabled()
		expect(nextButton).toHaveAccessibleDescription("先补全每篇文章标题")
		expect(nextButton).toHaveAttribute("aria-describedby", hint.id)
	})
})
