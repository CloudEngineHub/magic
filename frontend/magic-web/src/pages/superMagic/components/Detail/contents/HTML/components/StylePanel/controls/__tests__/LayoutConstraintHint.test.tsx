import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { LayoutConstraintHintCard } from "../LayoutConstraintHint"

vi.mock("react-i18next", () => ({
	useTranslation: () => ({
		t: (key: string) => key,
	}),
}))

const hint = {
	kind: "distributed-alignment" as const,
	justifyContent: "space-between",
	fix: { justifyContent: "flex-start" as const },
}

describe("LayoutConstraintHintCard", () => {
	it("commits the preview batch on click and does not apply twice", async () => {
		const onApply = vi.fn()
		const editorRef = {
			current: {
				beginBatchOperation: vi.fn().mockResolvedValue(undefined),
				applyStylesTemporary: vi.fn().mockResolvedValue(undefined),
				endBatchOperation: vi.fn().mockResolvedValue(undefined),
				cancelBatchOperation: vi.fn().mockResolvedValue(undefined),
				refreshSelectedElement: vi.fn().mockResolvedValue(undefined),
			},
		}

		render(
			<LayoutConstraintHintCard
				hint={hint}
				selector=".layout"
				editorRef={editorRef as never}
				onApply={onApply}
			/>,
		)

		const applyButton = screen.getByTestId("layout-constraint-hint-apply-distributed-alignment")
		fireEvent.mouseEnter(applyButton)
		await waitFor(() => {
			expect(editorRef.current.beginBatchOperation).toHaveBeenCalledTimes(1)
		})
		fireEvent.click(applyButton)
		await waitFor(() => {
			expect(editorRef.current.endBatchOperation).toHaveBeenCalledTimes(1)
		})

		expect(editorRef.current.endBatchOperation).toHaveBeenCalledWith(".layout", hint.fix)
		expect(onApply).not.toHaveBeenCalled()
	})

	it("falls back to onApply when click happens without a preview session", async () => {
		const onApply = vi.fn()

		render(<LayoutConstraintHintCard hint={hint} selector=".layout" onApply={onApply} />)

		await fireEvent.click(
			screen.getByTestId("layout-constraint-hint-apply-distributed-alignment"),
		)

		expect(onApply).toHaveBeenCalledWith(hint.fix)
	})
})
