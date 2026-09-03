import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import MicroAppLoadErrorState from "../MicroAppLoadErrorState"

describe("MicroAppLoadErrorState", () => {
	it("renders the product illustration and retries", () => {
		const onRetry = vi.fn()

		render(
			<MicroAppLoadErrorState
				title="加载失败"
				description="项目列表加载失败，请重试。"
				actionLabel="刷新"
				onRetry={onRetry}
			/>,
		)

		expect(screen.getByTestId("micro-app-load-error-illustration")).toBeInTheDocument()
		fireEvent.click(screen.getByRole("button", { name: "刷新" }))
		expect(onRetry).toHaveBeenCalledOnce()
	})

	it("uses the compact mobile composition", () => {
		render(
			<MicroAppLoadErrorState
				title="加载失败"
				description="项目列表加载失败，请重试。"
				actionLabel="刷新"
				onRetry={vi.fn()}
				mobile
			/>,
		)

		expect(screen.getByTestId("micro-apps-load-error")).toHaveAttribute("data-mobile", "true")
	})
})
