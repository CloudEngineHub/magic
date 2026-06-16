import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import StepIndicator from "../components/SelfMediaInitPanel/steps/StepIndicator"

vi.mock("react-i18next", () => ({
	useTranslation: () => ({
		t: (key: string, options?: Record<string, string | number>) => {
			const messages: Record<string, string> = {
				"detail.selfMedia.initPanel.nav.stepCompleted": "已完成：{{title}}",
				"detail.selfMedia.initPanel.nav.stepCurrent": "当前步骤：{{title}}",
				"detail.selfMedia.initPanel.nav.stepPosition": "第 {{index}} 步，共 {{total}} 步",
				"detail.selfMedia.initPanel.nav.stepShortBrand": "定位",
				"detail.selfMedia.initPanel.nav.stepShortConfirm": "确认",
				"detail.selfMedia.initPanel.nav.stepShortTopics": "选题",
				"detail.selfMedia.initPanel.nav.stepUpcoming": "待完成：{{title}}",
				"detail.selfMedia.initPanel.stepHero.brand.title": "先定准人设，让内容一开口就像你",
				"detail.selfMedia.initPanel.stepHero.confirm.title":
					"确认节奏，让整套内容准备好出发",
				"detail.selfMedia.initPanel.stepHero.topics.title": "把灵感打磨成值得点开的选题",
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

describe("StepIndicator hero", () => {
	it("renders an ambient visual stage for the active step", () => {
		const { rerender } = render(<StepIndicator currentStep={1} onNavigate={vi.fn()} />)

		expect(screen.getByTestId("self-media-init-panel-header").className).toContain("sm:pb-20")
		const hero = screen.getByTestId("self-media-step-hero")
		expect(hero).toHaveAttribute("data-active-step", "topics")
		expect(hero).toHaveAttribute("aria-hidden", "true")
		expect(hero.className).toContain("h-[380px]")
		expect(hero.className).not.toContain("rounded-[22px]")
		expect(hero.className).not.toContain("shadow-[")
		const guideTitle = screen.getByTestId("self-media-step-guide-title")
		expect(guideTitle).toHaveTextContent("把灵感打磨成值得点开的选题")
		expect(guideTitle.className).toContain("text-[28px]")
		expect(guideTitle.className).toContain("sm:text-[40px]")
		expect(screen.queryByTestId("self-media-step-kicker")).not.toBeInTheDocument()
		expect(screen.queryByTestId("self-media-step-hero-description")).not.toBeInTheDocument()
		expect(screen.queryByTestId("self-media-step-hero-signal")).not.toBeInTheDocument()
		expect(screen.queryByTestId("self-media-step-hero-rail")).not.toBeInTheDocument()
		expect(screen.queryAllByTestId("self-media-step-hero-mark")).toHaveLength(0)
		expect(screen.getByTestId("self-media-step-topics-flow")).toBeInTheDocument()
		expect(screen.getAllByTestId("self-media-step-topics-node")).toHaveLength(3)
		expect(screen.getByTestId("self-media-step-hero-backdrop")).toHaveAttribute(
			"aria-hidden",
			"true",
		)
		const transition = screen.getByTestId("self-media-step-hero-transition")
		expect(transition).toHaveAttribute("aria-hidden", "true")
		expect(transition.className).toContain("bg-gradient-to-b")
		expect(transition.className).toContain("top-[300px]")
		expect(transition.className).toContain("h-28")

		rerender(<StepIndicator currentStep={0} onNavigate={vi.fn()} />)

		expect(screen.getByTestId("self-media-step-hero")).toHaveAttribute(
			"data-active-step",
			"brand",
		)
		expect(screen.getByTestId("self-media-step-brand-orbit")).toBeInTheDocument()
		expect(screen.getAllByTestId("self-media-step-brand-signal")).toHaveLength(4)

		rerender(<StepIndicator currentStep={2} onNavigate={vi.fn()} />)

		expect(screen.getByTestId("self-media-step-hero")).toHaveAttribute(
			"data-active-step",
			"confirm",
		)
		expect(screen.getByTestId("self-media-step-confirm-launch")).toBeInTheDocument()
		expect(screen.getAllByTestId("self-media-step-confirm-check")).toHaveLength(3)
	})

	it("keeps the title as guidance but hides the visual stage in compact mode", () => {
		render(<StepIndicator currentStep={1} onNavigate={vi.fn()} compact />)

		expect(screen.getByTestId("self-media-init-panel-header")).toHaveAttribute(
			"data-compact",
			"true",
		)
		const compactGuideTitle = screen.getByTestId("self-media-step-guide-title")
		expect(compactGuideTitle).toHaveTextContent("把灵感打磨成值得点开的选题")
		expect(screen.getByTestId("self-media-init-panel-header").className).toContain(
			"border-[#18181b]/[0.08]",
		)
		expect(compactGuideTitle.className).toContain("font-medium")
		expect(compactGuideTitle.className).toContain("truncate")
		expect(compactGuideTitle.className).toContain("max-w-[320px]")
		expect(compactGuideTitle.className).toContain("sm:max-w-[360px]")
		expect(compactGuideTitle.className).toContain("sm:order-2")
		expect(compactGuideTitle.className).toContain("sm:text-right")
		expect(compactGuideTitle.className).toContain("text-zinc-500")
		expect(screen.getByTestId("self-media-step-track").className).toContain("sm:order-1")
		expect(screen.getByTestId("self-media-step-hero")).toHaveAttribute("data-compact", "true")
		expect(screen.queryByTestId("self-media-step-topics-flow")).not.toBeInTheDocument()
		expect(screen.queryByTestId("self-media-step-hero-signal")).not.toBeInTheDocument()
	})

	it("keeps completed steps navigable and future steps locked", () => {
		const onNavigate = vi.fn()
		render(<StepIndicator currentStep={1} onNavigate={onNavigate} />)

		fireEvent.click(screen.getByRole("button", { name: "已完成：欢迎与定位" }))
		fireEvent.click(screen.getByRole("button", { name: "待完成：确认生成" }))

		expect(onNavigate).toHaveBeenCalledWith(0)
		expect(onNavigate).not.toHaveBeenCalledWith(2)
		expect(screen.getByRole("button", { name: "待完成：确认生成" })).toBeDisabled()
	})
})
