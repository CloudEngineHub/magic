import { render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import SelfMediaOpsMetricFlipCard from "../components/SelfMediaOpsMetricFlipCard"

describe("SelfMediaOpsMetricFlipCard", () => {
	it("keeps the front status row away from the lower card edge", () => {
		const { container } = render(
			<SelfMediaOpsMetricFlipCard
				metricKey="reads"
				icon={<span aria-hidden="true" />}
				label="待绑定"
				value="1 篇"
				accent="text-[#18181b]"
				statusLabel="已同步 2/3"
				motionState="idle"
				testId="metric-card"
				detail={{
					title: "阅读拆解",
					subtitle: "看样本规模与流量集中度",
					rows: [{ label: "样本文章", value: "1 篇" }],
				}}
				flipped={false}
				onToggle={vi.fn()}
			/>,
		)

		expect(container.querySelector(".self-media-ops-metric-line")).toHaveClass("mt-3")
		expect(screen.getByText("查看拆解").parentElement).toHaveClass("mt-2", "leading-[1.2]")
		expect(screen.getByText("待绑定").parentElement?.parentElement).toHaveClass("pb-5", "pt-4")
	})

	it("keeps flipped detail content inside the metric card width", () => {
		render(
			<SelfMediaOpsMetricFlipCard
				metricKey="rate"
				icon={<span aria-hidden="true" />}
				label="平均互动率"
				value="4.7%"
				accent="text-[#18181b]"
				statusLabel="已同步"
				motionState="idle"
				testId="metric-card"
				detail={{
					title: "效率拆解",
					subtitle: "找出高效样本和风险内容",
					rows: [
						{ label: "平均互动率", value: "4.7%" },
						{ label: "最佳互动率", value: "14.2%" },
						{ label: "低互动率", value: "1.3%" },
					],
				}}
				flipped
				onToggle={vi.fn()}
			/>,
		)

		const card = screen.getByTestId("metric-card")
		expect(card).toHaveClass("w-full", "max-w-full", "overflow-hidden")

		const detail = screen.getByTestId("self-media-home-ops-metric-detail-rate")
		expect(detail).toHaveClass("min-w-0", "overflow-hidden")

		const row = screen.getByText("最佳互动率").parentElement
		expect(row).toHaveClass("grid", "min-w-0")
		expect(row?.className).toContain("grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]")
		expect(screen.getByText("14.2%")).toHaveClass("min-w-0", "justify-self-end")
	})
})
