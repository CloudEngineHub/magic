import { renderHook } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import type { OptionItem } from "@/pages/superMagic/components/MainInputContainer/panels/types"
import { useSlidesTemplateCanvasActiveTemplates } from "../useSlidesTemplateCanvasActiveTemplates"

const initialTemplates: OptionItem[] = [{ label: "Template 1", value: "template-1" }]
const appendedTemplates: OptionItem[] = [
	...initialTemplates,
	{ label: "Template 2", value: "template-2" },
]

describe("useSlidesTemplateCanvasActiveTemplates", () => {
	it("waits for drag release before applying appended templates", () => {
		const { result, rerender } = renderHook(
			({ isDragging, templates }) =>
				useSlidesTemplateCanvasActiveTemplates({
					isDragging,
					resetKey: "all:",
					templates,
				}),
			{
				initialProps: { isDragging: false, templates: initialTemplates },
			},
		)

		rerender({ isDragging: true, templates: appendedTemplates })
		expect(result.current).toBe(initialTemplates)

		rerender({ isDragging: false, templates: appendedTemplates })
		expect(result.current).toBe(appendedTemplates)
	})

	it("applies a new query immediately even if a drag was active", () => {
		const { result, rerender } = renderHook(
			({ isDragging, resetKey, templates }) =>
				useSlidesTemplateCanvasActiveTemplates({ isDragging, resetKey, templates }),
			{
				initialProps: {
					isDragging: true,
					resetKey: "all:",
					templates: initialTemplates,
				},
			},
		)

		rerender({
			isDragging: true,
			resetKey: "search:business",
			templates: appendedTemplates,
		})
		expect(result.current).toBe(appendedTemplates)
	})

	it("clears templates immediately when a drag is active and the result is empty", () => {
		const { result, rerender } = renderHook(
			({ isDragging, templates }) =>
				useSlidesTemplateCanvasActiveTemplates({
					isDragging,
					resetKey: "all:",
					templates,
				}),
			{
				initialProps: { isDragging: true, templates: initialTemplates },
			},
		)

		rerender({ isDragging: true, templates: [] })

		expect(result.current).toEqual([])
	})
})
