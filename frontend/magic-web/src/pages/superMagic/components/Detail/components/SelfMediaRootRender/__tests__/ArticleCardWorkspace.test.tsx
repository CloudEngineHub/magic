import { fireEvent, render, screen } from "@testing-library/react"
import { createRef } from "react"
import { describe, expect, it, vi } from "vitest"
import type { ArticleDetail } from "../components/SelfMediaInitPanel/types"
import ArticleCardWorkspace from "../components/SelfMediaInitPanel/components/article/ArticleCardWorkspace"

vi.mock("react-i18next", () => ({
	initReactI18next: {
		type: "3rdParty",
		init: vi.fn(),
	},
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

vi.mock("@/assets/locales/locale-adapters", () => ({
	getAdminLocaleModules: () => ({}),
	getLocaleModules: () => ({ zhCNModules: {}, enUSModules: {} }),
	loadFallbackLocale: vi.fn(),
	loadMagicFlowLocale: vi.fn(),
}))

vi.mock("@/components/base/MagicPromptEditor", () => ({
	MagicPromptEditor: () => <div data-testid="magic-prompt-editor" />,
}))

vi.mock("../components/SelfMediaInitPanel/components/picker/VisualPresetPicker", () => ({
	default: () => <div data-testid="visual-preset-picker" />,
}))

vi.mock("../components/SelfMediaInitPanel/components/picker/ReferenceFilePicker", () => ({
	default: () => <button type="button" data-testid="reference-file-picker" />,
}))

vi.mock("../components/SelfMediaInitPanel/components/ui/InlineVoiceButton", () => ({
	default: () => <button type="button" data-testid="inline-voice-button" />,
}))

vi.mock("../components/SelfMediaInitPanel/components/ai/AiActionButton", () => ({
	default: ({ label, onClick }: { label: string; onClick: () => void }) => (
		<button type="button" onClick={onClick}>
			{label}
		</button>
	),
}))

vi.mock("../components/PlatformBrandIcon", () => ({
	default: () => <span data-testid="platform-brand-icon" />,
}))

function makeArticle(overrides: Partial<ArticleDetail> = {}): ArticleDetail {
	return {
		title: "公众号长文标题",
		folderName: "wechat-post",
		style: "professional",
		visualPreset: "none",
		outline: [
			{
				id: "section-1",
				text: "第一节观点",
				children: [{ id: "section-1-1", text: "子观点", children: [] }],
			},
		],
		cardCount: 6,
		materials: [],
		notes: "",
		description: "开头摘要",
		visualReferenceFiles: [],
		platform: "wechat-official-accounts",
		...overrides,
	}
}

function renderWorkspace(article = makeArticle()) {
	return render(
		<ArticleCardWorkspace
			article={article}
			hideHeader
			showFolderField={false}
			isCardPlatform={false}
			hasOutline={article.outline.length > 0}
			generatingOutline={false}
			outlineModel=""
			optimizePopoverOpen={false}
			optimizeInstruction=""
			outlineActionRef={createRef<HTMLDivElement>()}
			onFieldChange={vi.fn()}
			onCardCountChange={vi.fn()}
			onReferenceFilesChange={vi.fn()}
			onOutlineButtonClick={vi.fn()}
			onOptimizeInstructionChange={vi.fn()}
			onOutlineModelChange={vi.fn()}
			onAiOptimize={vi.fn()}
			onOutlineChange={vi.fn()}
			onRemoveCard={vi.fn()}
			onPersistDraft={vi.fn()}
			onUploadToProject={vi.fn()}
		/>,
	)
}

describe("ArticleCardWorkspace", () => {
	it("lets WeChat articles switch the full content area between editor and phone preview", () => {
		renderWorkspace()

		expect(screen.getByTestId("wechat-article-outline-editor")).toBeInTheDocument()
		expect(screen.queryByTestId("wechat-article-phone-preview")).not.toBeInTheDocument()

		fireEvent.click(screen.getByRole("button", { name: "手机预览" }))

		expect(screen.getByTestId("wechat-article-phone-preview")).toBeInTheDocument()
		expect(screen.getByText("公众号长文标题")).toBeInTheDocument()
		expect(screen.getByText("第一节观点")).toBeInTheDocument()
		expect(screen.getByText("子观点")).toBeInTheDocument()
		expect(screen.queryByTestId("wechat-article-outline-editor")).not.toBeInTheDocument()
	})
})
