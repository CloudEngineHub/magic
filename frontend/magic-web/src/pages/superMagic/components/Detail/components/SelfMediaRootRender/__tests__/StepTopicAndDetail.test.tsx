import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import { useState } from "react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import type { ArticleDetail } from "../components/SelfMediaInitPanel/types"

const { mockGenerateTopics } = vi.hoisted(() => ({
	mockGenerateTopics: vi.fn(),
}))

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

vi.mock("../services/selfMediaAiGenerate", () => ({
	generateTopics: mockGenerateTopics,
	generateTopicsWithDetails: vi.fn(),
	parseOutlineFromText: vi.fn(() => []),
	reconcileCardCountWithOutline: vi.fn((_platform, count) => count || 6),
}))

vi.mock("../components/SelfMediaInitPanel/components/ai/AiTopicAssistant", () => ({
	default: ({
		onGenerate,
	}: {
		onGenerate: (params: {
			count: number
			generateWithDetails: boolean
			signal: AbortSignal
		}) => Promise<boolean>
	}) => (
		<button
			type="button"
			data-testid="ai-topic-assistant-generate"
			onClick={() =>
				onGenerate({
					count: 1,
					generateWithDetails: false,
					signal: new AbortController().signal,
				})
			}
		/>
	),
}))

vi.mock("../components/SelfMediaInitPanel/components/article/ArticleCard", () => ({
	default: () => <div data-testid="article-card" />,
}))

vi.mock("../components/SelfMediaInitPanel/components/ui/InlineVoiceButton", () => ({
	default: () => <button type="button" data-testid="inline-voice-button" />,
}))

vi.mock("../components/SelfMediaInitPanel/components/ui/SketchTitleIllustration", () => ({
	SketchTitleIllustration: () => <div data-testid="sketch-title-illustration" />,
}))

vi.mock("../components/PlatformBrandIcon", () => ({
	default: () => <span data-testid="platform-brand-icon" />,
}))

import StepTopicAndDetail from "../components/SelfMediaInitPanel/steps/StepTopicAndDetail"

function makeArticle(overrides: Partial<ArticleDetail> = {}): ArticleDetail {
	return {
		title: "Post A",
		folderName: "post-a",
		style: "professional",
		visualPreset: "none",
		outline: [],
		cardCount: 6,
		materials: [],
		notes: "",
		platform: "rednote",
		description: "",
		visualReferenceFiles: [],
		...overrides,
	}
}

describe("StepTopicAndDetail", () => {
	beforeEach(() => {
		mockGenerateTopics.mockReset()
	})

	it("assigns a stable default folder name when manually creating the first article", () => {
		const onChange = vi.fn()

		render(
			<StepTopicAndDetail
				articles={[]}
				onChange={onChange}
				onArticleUpdate={vi.fn()}
				globalSettings={{
					author: "",
					brandPosition: "",
					targetAudience: "",
					brandImages: [],
				}}
			/>,
		)

		fireEvent.click(screen.getByRole("button", { name: "添加第一个选题" }))

		expect(onChange).toHaveBeenCalledWith([
			expect.objectContaining({
				folderName: "01-post",
			}),
		])
	})

	it("assigns stable default folder names to AI generated topics", async () => {
		mockGenerateTopics.mockResolvedValue([{ title: "中文选题", description: "desc" }])
		const onChange = vi.fn()

		render(
			<StepTopicAndDetail
				articles={[makeArticle({ folderName: "existing-post" })]}
				onChange={onChange}
				onArticleUpdate={vi.fn()}
				globalSettings={{
					author: "",
					brandPosition: "",
					targetAudience: "",
					brandImages: [],
				}}
			/>,
		)

		fireEvent.click(screen.getByTestId("ai-topic-assistant-generate"))

		await waitFor(() => {
			expect(onChange).toHaveBeenCalledWith([
				expect.objectContaining({ folderName: "existing-post" }),
				expect.objectContaining({ folderName: "02-post" }),
			])
		})
	})

	it("moves focus to the generated topic title for immediate editing", async () => {
		mockGenerateTopics.mockResolvedValue([{ title: "中文选题", description: "desc" }])

		function ControlledTopicStep() {
			const [articles, setArticles] = useState<ArticleDetail[]>([])
			return (
				<StepTopicAndDetail
					articles={articles}
					onChange={setArticles}
					onArticleUpdate={(index, article) => {
						setArticles((current) =>
							current.map((item, itemIndex) =>
								itemIndex === index ? article : item,
							),
						)
					}}
					globalSettings={{
						author: "",
						brandPosition: "",
						targetAudience: "",
						brandImages: [],
					}}
				/>
			)
		}

		render(<ControlledTopicStep />)

		fireEvent.click(screen.getByTestId("ai-topic-assistant-generate"))

		await waitFor(() => {
			expect(screen.getByLabelText("选题标题")).toHaveFocus()
		})
		expect(screen.getByDisplayValue("中文选题")).toBeInTheDocument()
	})

	it("shows an editable folder name input for the active article", () => {
		const onArticleUpdate = vi.fn()
		const article = makeArticle({ folderName: "post-a" })

		render(
			<StepTopicAndDetail
				articles={[article]}
				onChange={vi.fn()}
				onArticleUpdate={onArticleUpdate}
				globalSettings={{
					author: "",
					brandPosition: "",
					targetAudience: "",
					brandImages: [],
				}}
			/>,
		)

		fireEvent.change(screen.getByTestId("self-media-step-topic-folder-name-input"), {
			target: { value: "custom-folder" },
		})

		expect(onArticleUpdate).toHaveBeenCalledWith(0, {
			...article,
			folderName: "custom-folder",
		})
	})

	it("uses shadcn controls for the topic workspace actions", () => {
		const { rerender } = render(
			<StepTopicAndDetail
				articles={[]}
				onChange={vi.fn()}
				onArticleUpdate={vi.fn()}
				globalSettings={{
					author: "",
					brandPosition: "",
					targetAudience: "",
					brandImages: [],
				}}
			/>,
		)

		expect(screen.getByText("添加第一个选题").closest("button")).toHaveAttribute(
			"data-slot",
			"button",
		)

		rerender(
			<StepTopicAndDetail
				articles={[makeArticle({ title: "Post A" })]}
				onChange={vi.fn()}
				onArticleUpdate={vi.fn()}
				globalSettings={{
					author: "",
					brandPosition: "",
					targetAudience: "",
					brandImages: [],
				}}
			/>,
		)

		expect(screen.getByPlaceholderText("点击输入选题标题...")).toHaveAttribute(
			"data-slot",
			"input",
		)
	})
})
