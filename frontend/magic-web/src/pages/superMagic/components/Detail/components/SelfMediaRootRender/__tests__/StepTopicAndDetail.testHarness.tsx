import type React from "react"
import { vi } from "vitest"
import type { ArticleDetail } from "../components/SelfMediaInitPanel/types"

vi.mock("react-i18next", () => ({
	useTranslation: () => ({
		t: (key: string, fallback?: string | Record<string, string | number>) => {
			if (typeof fallback === "string") return fallback
			if (fallback?.defaultValue) {
				return String(fallback.defaultValue).replace(/\{\{(\w+)\}\}/g, (_, token: string) =>
					String(fallback[token] ?? ""),
				)
			}
			return key
		},
	}),
}))

vi.mock("@/components/base/MagicTooltip", () => ({
	default: ({ children, title }: { children: React.ReactNode; title?: React.ReactNode }) => (
		<span data-tooltip-title={typeof title === "string" ? title : undefined}>{children}</span>
	),
}))

vi.mock("../components/SelfMediaInitPanel/components/ai/AiTopicAssistant", () => ({
	default: function MockAiTopicAssistant() {
		return <div data-testid="ai-topic-assistant" />
	},
}))

vi.mock("../components/SelfMediaInitPanel/components/article/ArticleCard", () => ({
	default: function MockArticleCard(props: { showFolderField?: boolean }) {
		return (
			<div
				data-testid="article-card"
				data-show-folder-field={String(props.showFolderField)}
			/>
		)
	},
}))

vi.mock("../components/SelfMediaInitPanel/components/ui/InlineVoiceButton", () => ({
	default: function MockInlineVoiceButton() {
		return <button type="button" aria-label="voice" />
	},
}))

vi.mock("../components/PlatformBrandIcon", () => ({
	default: function MockPlatformBrandIcon() {
		return <span data-testid="platform-brand-icon" />
	},
}))

export const globalSettings = {
	author: "Magic Lab",
	brandPosition: "AI workflow",
	targetAudience: "",
	brandImages: [],
}

export function createArticle(overrides: Partial<ArticleDetail> = {}): ArticleDetail {
	return {
		title: "小红书选题",
		folderName: "posts/rednote-topic",
		style: "professional",
		outline: [],
		cardCount: 6,
		materials: [],
		notes: "",
		platform: "rednote",
		...overrides,
	}
}

const { default: StepTopicAndDetail } =
	await import("../components/SelfMediaInitPanel/steps/StepTopicAndDetail")

export { StepTopicAndDetail }
