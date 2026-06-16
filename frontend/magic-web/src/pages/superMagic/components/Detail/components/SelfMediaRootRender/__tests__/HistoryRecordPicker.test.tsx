import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { HistoryRecordPicker } from "../components/SelfMediaInitPanel/steps/StepBrandInfo/components/HistoryRecordPicker"

vi.mock("react-i18next", () => ({
	useTranslation: () => ({
		t: (key: string, fallbackOrOptions?: string | { name?: string }) => {
			const messages: Record<string, string> = {
				"detail.selfMedia.initPanel.stepBrand.closeHistoryRecords": "关闭品牌记录",
				"detail.selfMedia.initPanel.stepBrand.deleteRecord": "删除 Magic Lab",
				"detail.selfMedia.initPanel.stepBrand.reusableRecordsTitle": "可复用品牌信息",
				"detail.selfMedia.initPanel.stepBrand.useRecord": "回填 Magic Lab",
			}

			return (
				messages[key] || (typeof fallbackOrOptions === "string" ? fallbackOrOptions : key)
			)
		},
	}),
}))

describe("HistoryRecordPicker", () => {
	it("presents saved brand records as reusable shortcuts without instruction-heavy copy", () => {
		const onSelect = vi.fn()
		const onDelete = vi.fn()
		const onClose = vi.fn()

		render(
			<HistoryRecordPicker
				records={[
					{
						id: "brand-1",
						author: "Magic Lab",
						brandPosition: "AI tools",
						targetAudience: "Creators",
						createdAt: new Date("2026-06-12").getTime(),
					},
				]}
				onSelect={onSelect}
				onDelete={onDelete}
				onClose={onClose}
			/>,
		)

		const panel = screen.getByTestId("self-media-history-record-picker")
		expect(panel).toHaveClass("rounded-[24px]")
		expect(panel).toHaveClass("bg-white/95")
		expect(panel.className).not.toContain("border-border")

		expect(screen.getByText("可复用品牌信息")).toBeInTheDocument()
		expect(screen.queryByText("选择历史记录以回填")).not.toBeInTheDocument()

		fireEvent.click(screen.getByRole("button", { name: "回填 Magic Lab" }))
		fireEvent.click(screen.getByRole("button", { name: "删除 Magic Lab" }))
		fireEvent.click(screen.getByRole("button", { name: "关闭品牌记录" }))

		expect(onSelect).toHaveBeenCalledTimes(1)
		expect(onDelete).toHaveBeenCalledWith("brand-1")
		expect(onClose).toHaveBeenCalledTimes(1)
	})
})
