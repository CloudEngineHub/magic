import { act, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import AiCompletionTipStore from "@/stores/chatNew/editor/AiCompletionTip"
import AiCompletionTip from "../index"

vi.mock("antd-style", () => ({
	createStyles: () => () => ({ styles: { tip: "tip" } }),
}))

describe("AiCompletionTip", () => {
	beforeEach(() => {
		Object.defineProperty(window, "innerHeight", {
			configurable: true,
			value: 1084,
		})
		act(() => {
			AiCompletionTipStore.hide()
		})
	})

	afterEach(() => {
		act(() => {
			AiCompletionTipStore.hide()
		})
	})

	it("renders outside the project-page fixed-position containing block", () => {
		render(
			<div style={{ overflow: "hidden", willChange: "transform" }}>
				<AiCompletionTip />
			</div>,
		)

		act(() => {
			AiCompletionTipStore.show({ top: 828, left: 1569 })
		})

		const tip = screen.getByAltText("ai-completion-tip").parentElement

		expect(tip).toHaveStyle({
			display: "block",
		})
		expect(tip?.parentElement).toBe(document.body)
	})
})
