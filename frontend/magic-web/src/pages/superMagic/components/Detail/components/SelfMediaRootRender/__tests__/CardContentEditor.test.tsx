import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import CardContentEditor from "../components/SelfMediaInitPanel/components/article/CardContentEditor"

vi.mock("react-i18next", () => ({
	useTranslation: () => ({
		t: (key: string, fallback?: string | Record<string, string | number>) => {
			if (typeof fallback === "string") return fallback
			if (fallback?.defaultValue) return String(fallback.defaultValue)
			return key
		},
	}),
}))

vi.mock("../components/SelfMediaInitPanel/components/material/MaterialAttachmentList", () => ({
	default: () => <div data-testid="material-attachment-list" />,
}))

vi.mock("../components/SelfMediaInitPanel/components/ui/InlineVoiceButton", () => ({
	default: () => <button type="button" aria-label="voice" />,
}))

describe("CardContentEditor", () => {
	it("moves focus into card removal confirmation and lets Escape cancel it", () => {
		const onRemoveCard = vi.fn()

		render(
			<CardContentEditor
				cardCount={1}
				outline={[{ id: "card-1", text: "Opening hook", children: [] }]}
				onChange={vi.fn()}
				onRemoveCard={onRemoveCard}
			/>,
		)

		fireEvent.click(screen.getByTitle("移除此卡片"))

		expect(screen.getByRole("button", { name: "取消" })).toHaveFocus()

		fireEvent.keyDown(screen.getByRole("button", { name: "取消" }), {
			key: "Escape",
		})

		expect(screen.getByTitle("移除此卡片")).toHaveFocus()
		expect(screen.queryByRole("button", { name: "取消" })).not.toBeInTheDocument()
		expect(screen.queryByRole("button", { name: "删除" })).not.toBeInTheDocument()
		expect(onRemoveCard).not.toHaveBeenCalled()
	})

	it("uses the same prompt surface structure for card copy", () => {
		render(
			<CardContentEditor
				cardCount={1}
				outline={[{ id: "card-1", text: "Opening hook", children: [] }]}
				onChange={vi.fn()}
			/>,
		)

		const item = screen.getByTestId("self-media-card-content-item-0")
		const field = screen.getByTestId("self-media-card-content-field-0")
		const toolbar = screen.getByTestId("self-media-card-content-toolbar-0")
		const attachmentBar = screen.getByTestId("self-media-card-content-attachments-0")
		const textarea = screen.getByDisplayValue("Opening hook")

		expect(item).toHaveClass("border-b", "shadow-none", "last:pb-5")
		expect(item).not.toHaveClass("rounded-lg")
		expect(item).not.toHaveClass("hover:bg-zinc-50/35")
		expect(field).toHaveClass(
			"overflow-hidden",
			"rounded-none",
			"border-0",
			"border-b",
			"bg-zinc-50/40",
			"focus-within:border-zinc-950",
		)
		expect(toolbar).toHaveClass("border-l", "border-zinc-200")
		expect(attachmentBar).toHaveClass("border-t", "border-zinc-200/70", "bg-zinc-50/40")
		expect(textarea).toHaveClass("border-0", "bg-transparent", "focus-visible:ring-0")
	})
})
