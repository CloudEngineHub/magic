import { fireEvent, render, screen } from "@testing-library/react"
import type { ReactNode } from "react"
import { describe, expect, it, vi } from "vitest"
import type {
	ArticleDetail,
	SelfMediaInitGlobalSettings,
} from "../components/SelfMediaInitPanel/types"
import ArticleCard from "../components/SelfMediaInitPanel/components/article/ArticleCard"

vi.mock("react-i18next", () => ({
	useTranslation: () => ({
		t: (key: string, fallback?: string | Record<string, string | number>) => {
			const messages: Record<string, string> = {
				"detail.selfMedia.initPanel.stepDetail.cardCountUnit": "cards",
				"detail.selfMedia.initPanel.platforms.instagram": "Instagram",
				"detail.selfMedia.initPanel.platforms.rednote": "Rednote",
				"detail.selfMedia.initPanel.platforms.wechatOfficialAccounts": "WeChat",
				"detail.selfMedia.initPanel.styles.professional": "Professional",
				"detail.selfMedia.initPanel.styles.casual": "Casual",
				"detail.selfMedia.initPanel.styles.storytelling": "Storytelling",
				"detail.selfMedia.initPanel.styles.tutorial": "Tutorial",
				"detail.selfMedia.initPanel.styles.emotional": "Emotional",
				"detail.selfMedia.initPanel.styles.custom": "Custom",
				"detail.selfMedia.initPanel.stepDetail.outlineGenerateBtn": "Generate outline",
				"detail.selfMedia.initPanel.stepDetail.cardContentGenerateBtn":
					"Generate card content",
				"detail.selfMedia.initPanel.stepDetail.cardContentCanGenerateStatus":
					"Ready to generate cards",
				"detail.selfMedia.initPanel.stepDetail.cardContentReadyStatus":
					"Cards ready: {{count}}",
				"detail.selfMedia.initPanel.stepDetail.cardContentRequiresTitleStatus":
					"Title first",
				"detail.selfMedia.initPanel.stepDetail.cardCountHint":
					"6-9 cards recommended for Rednote/Instagram",
				"detail.selfMedia.initPanel.stepDetail.cardCountLabel": "Card Count",
				"detail.selfMedia.initPanel.stepDetail.outlineRequiresTitleHint":
					"Add a title first so AI can generate the outline.",
				"detail.selfMedia.initPanel.stepDetail.cardContentRequiresTitleHint":
					"Add a title first so AI can generate card content.",
				"detail.selfMedia.initPanel.stepDetail.stylePlaceholder":
					"Describe your custom writing style",
			}
			if (messages[key]) {
				const message = messages[key]
				if (fallback && typeof fallback !== "string") {
					return message.replace(/\{\{(\w+)\}\}/g, (_, token: string) =>
						String(fallback[token] ?? ""),
					)
				}
				return message
			}
			if (typeof fallback === "string") return fallback
			if (fallback?.defaultValue) return String(fallback.defaultValue)
			return key
		},
	}),
}))

vi.mock("@/components/base/MagicPromptEditor", () => ({
	MagicPromptEditor: ({
		className,
		bottomToolbar,
	}: {
		className?: string
		bottomToolbar?: ReactNode
	}) => (
		<div data-testid="magic-prompt-editor" className={className}>
			{bottomToolbar}
		</div>
	),
}))

vi.mock("../components/SelfMediaInitPanel/components/picker/VisualPresetPicker", () => ({
	default: () => <div data-testid="visual-preset-picker" />,
}))

vi.mock("../components/SelfMediaInitPanel/components/picker/ReferenceFilePicker", () => ({
	default: () => <div data-testid="reference-file-picker" />,
}))

vi.mock("../components/SelfMediaInitPanel/components/article/CardContentEditor", () => ({
	default: () => <div data-testid="card-content-editor" />,
}))

vi.mock("../components/SelfMediaInitPanel/components/article/ArticleOutlineEditor", () => ({
	default: () => <div data-testid="article-outline-editor" />,
}))

vi.mock("../components/SelfMediaInitPanel/components/ai/AiActionButton", () => ({
	default: ({
		label,
		disabled,
		disabledReason,
	}: {
		label: ReactNode
		disabled?: boolean
		disabledReason?: string
	}) => {
		const reasonId = disabledReason ? "ai-action-disabled-reason" : undefined
		return (
			<>
				<button
					type="button"
					disabled={disabled}
					title={disabledReason}
					aria-describedby={reasonId}
				>
					{label}
				</button>
				{disabledReason && (
					<span id={reasonId} className="sr-only">
						{disabledReason}
					</span>
				)}
			</>
		)
	},
}))

vi.mock("../components/SelfMediaInitPanel/components/ui/InlineVoiceButton", () => ({
	default: () => <button type="button" aria-label="voice" />,
}))

vi.mock("../components/PlatformBrandIcon", () => ({
	default: () => <span data-testid="platform-brand-icon" />,
}))

const globalSettings: SelfMediaInitGlobalSettings = {
	author: "Magic Lab",
	brandPosition: "AI workflow",
	targetAudience: "",
	brandImages: [],
}

const article: ArticleDetail = {
	title: "小红书选题",
	folderName: "01-rednote-topic",
	style: "professional",
	visualPreset: "none",
	outline: [],
	cardCount: 6,
	materials: [],
	notes: "",
	platform: "rednote",
	description: "",
}

describe("ArticleCard", () => {
	it("uses localized microcopy for the card count unit", () => {
		render(
			<ArticleCard
				index={0}
				article={article}
				globalSettings={globalSettings}
				onUpdate={vi.fn()}
				onRemove={vi.fn()}
				alwaysExpanded
				hideHeader
			/>,
		)

		expect(screen.getByText("cards")).toBeInTheDocument()
		expect(screen.queryByText("张卡片")).not.toBeInTheDocument()
	})

	it("keeps the card count recommendation attached to the input without visible helper copy", () => {
		render(
			<ArticleCard
				index={0}
				article={article}
				globalSettings={globalSettings}
				onUpdate={vi.fn()}
				onRemove={vi.fn()}
				alwaysExpanded
				hideHeader
			/>,
		)

		const cardCountInput = screen.getByRole("spinbutton", { name: "Card Count" })
		const hint = "6-9 cards recommended for Rednote/Instagram"

		expect(cardCountInput).toHaveAttribute("title", hint)
		expect(cardCountInput).toHaveAccessibleDescription(hint)
		expect(screen.getByText(hint)).toHaveClass("sr-only")
		expect(screen.getAllByText(hint)).toHaveLength(1)
	})

	it("exposes platform and style selections as pressed button state", () => {
		const onUpdate = vi.fn()

		render(
			<ArticleCard
				index={0}
				article={article}
				globalSettings={globalSettings}
				onUpdate={onUpdate}
				onRemove={vi.fn()}
				alwaysExpanded
				hideHeader
			/>,
		)

		expect(screen.getByRole("button", { name: "Rednote" })).toHaveAttribute(
			"aria-pressed",
			"true",
		)
		expect(screen.getByRole("button", { name: "Instagram" })).toHaveAttribute(
			"aria-pressed",
			"false",
		)
		expect(screen.getByRole("button", { name: "Professional" })).toHaveAttribute(
			"aria-pressed",
			"true",
		)
		expect(screen.getByRole("button", { name: "Casual" })).toHaveAttribute(
			"aria-pressed",
			"false",
		)

		fireEvent.click(screen.getByRole("button", { name: "Instagram" }))

		expect(onUpdate).toHaveBeenCalledWith(
			expect.objectContaining({
				platform: "instagram",
			}),
		)
	})

	it("shows an editable custom writing style field after selecting custom style", () => {
		const onUpdate = vi.fn()
		const { rerender } = render(
			<ArticleCard
				index={0}
				article={{ ...article, style: "custom" }}
				globalSettings={globalSettings}
				onUpdate={onUpdate}
				onRemove={vi.fn()}
				alwaysExpanded
				hideHeader
			/>,
		)

		const customStyleInput = screen.getByPlaceholderText("Describe your custom writing style")

		expect(screen.getByRole("button", { name: "Custom" })).toHaveAttribute(
			"aria-pressed",
			"true",
		)
		expect(customStyleInput).toBeInTheDocument()
		expect(screen.getByRole("button", { name: "voice" })).toBeInTheDocument()

		fireEvent.change(customStyleInput, { target: { value: "Sharp founder voice" } })

		expect(onUpdate).toHaveBeenCalledWith(
			expect.objectContaining({
				style: "Sharp founder voice",
			}),
		)

		rerender(
			<ArticleCard
				index={0}
				article={{ ...article, style: "Sharp founder voice" }}
				globalSettings={globalSettings}
				onUpdate={onUpdate}
				onRemove={vi.fn()}
				alwaysExpanded
				hideHeader
			/>,
		)

		expect(screen.getByRole("button", { name: "Custom" })).toHaveAttribute(
			"aria-pressed",
			"true",
		)
		expect(screen.getByDisplayValue("Sharp founder voice")).toBeInTheDocument()
	})

	it("keeps freeform inputs on the shared low-border form surface", () => {
		render(
			<ArticleCard
				index={0}
				article={{ ...article, style: "custom" }}
				globalSettings={globalSettings}
				onUpdate={vi.fn()}
				onRemove={vi.fn()}
				alwaysExpanded
				hideHeader
			/>,
		)

		expect(screen.getByPlaceholderText("Describe your custom writing style")).toHaveClass(
			"rounded-none",
			"border-0",
			"border-b",
			"focus-visible:ring-0",
		)
		expect(screen.getByTestId("magic-prompt-editor")).toHaveClass(
			"rounded-none",
			"border-0",
			"border-b",
			"focus-within:ring-0",
		)
	})

	it("turns the blocked AI generation state into a compact status cue", () => {
		render(
			<ArticleCard
				index={0}
				article={{ ...article, title: "" }}
				globalSettings={globalSettings}
				onUpdate={vi.fn()}
				onRemove={vi.fn()}
				alwaysExpanded
				hideHeader
			/>,
		)

		const generateButton = screen.getByRole("button", {
			name: "Generate card content",
		})
		const reason = "Add a title first so AI can generate card content."

		expect(generateButton).toBeDisabled()
		expect(generateButton).toHaveAttribute("title", reason)
		expect(generateButton).toHaveAccessibleDescription(reason)
		expect(screen.getByText(reason)).toHaveClass("sr-only")
		expect(screen.getByText("Title first")).toHaveAttribute("aria-live", "polite")
		expect(screen.getAllByText(reason)).toHaveLength(1)
	})

	it("turns a ready title into compact AI generation feedback", () => {
		const { rerender } = render(
			<ArticleCard
				index={0}
				article={{ ...article, title: "Launch Plan", outline: [] }}
				globalSettings={globalSettings}
				onUpdate={vi.fn()}
				onRemove={vi.fn()}
				alwaysExpanded
				hideHeader
			/>,
		)

		expect(screen.getByText("Ready to generate cards")).toHaveAttribute("aria-live", "polite")

		rerender(
			<ArticleCard
				index={0}
				article={{
					...article,
					title: "Launch Plan",
					outline: [
						{ id: "1", title: "Cover", text: "Hook" },
						{ id: "2", title: "Body", text: "Point" },
					],
				}}
				globalSettings={globalSettings}
				onUpdate={vi.fn()}
				onRemove={vi.fn()}
				alwaysExpanded
				hideHeader
			/>,
		)

		expect(screen.getByText("Cards ready: 2")).toHaveAttribute("aria-live", "polite")
	})
})
