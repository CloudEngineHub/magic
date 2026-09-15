import { render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { PromptRichTextLocaleEditor } from "../components/DemoItemEditDialog/PromptRichTextLocaleEditor"

vi.mock("react-i18next", () => ({
	useTranslation: () => ({ t: (key: string) => key }),
}))

vi.mock("../components/DemoItemEditDialog/PromptRichTextEditor", async () => {
	const { forwardRef } = await import("react")
	return {
		PromptRichTextEditor: forwardRef(function MockPromptRichTextEditor() {
			return <div data-testid="mock-prompt-editor" />
		}),
	}
})

vi.mock("../components/DemoItemEditDialog/PromptRichTextLocaleDialog", () => ({
	PromptRichTextLocaleDialog: ({ allowPresetValue }: { allowPresetValue?: boolean }) => (
		<button
			type="button"
			data-testid="mock-locale-dialog"
			data-allow-preset-value={String(allowPresetValue)}
		/>
	),
}))

vi.mock("../components/DemoItemEditDialog/usePromptMentionDataService", () => ({
	usePromptMentionDataService: () => ({}),
}))

describe("PromptRichTextLocaleEditor", () => {
	it("places the locale button beside the editor and disables preset insertion", () => {
		render(
			<PromptRichTextLocaleEditor
				value="Prompt"
				onChange={vi.fn()}
				allowPresetValue={false}
				data-testid="prompt-input"
			/>,
		)

		const editor = screen.getByTestId("mock-prompt-editor")
		const localeButton = screen.getByTestId("mock-locale-dialog")
		const inlineContainer = editor.parentElement?.parentElement

		expect(inlineContainer).toHaveClass("flex", "items-start", "gap-2")
		expect(localeButton.parentElement).toBe(inlineContainer)
		expect(localeButton).toHaveAttribute("data-allow-preset-value", "false")
		expect(screen.queryByTestId("prompt-input-insert-preset-value-btn")).not.toBeInTheDocument()
	})

	it("keeps the preset toolbar enabled by default", () => {
		render(
			<PromptRichTextLocaleEditor
				value="Prompt"
				onChange={vi.fn()}
				data-testid="prompt-input"
			/>,
		)

		expect(screen.getByTestId("prompt-input-insert-preset-value-btn")).toBeInTheDocument()
		expect(screen.getByTestId("mock-locale-dialog")).toHaveAttribute(
			"data-allow-preset-value",
			"true",
		)
	})
})
