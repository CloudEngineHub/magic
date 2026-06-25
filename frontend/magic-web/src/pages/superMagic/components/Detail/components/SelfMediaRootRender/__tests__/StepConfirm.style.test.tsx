import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import type { SelfMediaInitData } from "../components/SelfMediaInitPanel/types"

const {
	mockSendArticleBatch,
	mockNavigateToBatchTopic,
	mockFetchTopics,
	mockPrefillSelfMediaMagicProjectIndex,
	mockEnsureArticlePostAssetDirectories,
} = vi.hoisted(() => ({
	mockSendArticleBatch: vi.fn(),
	mockNavigateToBatchTopic: vi.fn(),
	mockFetchTopics: vi.fn(),
	mockPrefillSelfMediaMagicProjectIndex: vi.fn(),
	mockEnsureArticlePostAssetDirectories: vi.fn(),
}))

vi.mock("react-i18next", () => ({
	initReactI18next: {
		type: "3rdParty",
		init: vi.fn(),
	},
	useTranslation: () => ({
		t: (key: string, options?: Record<string, string | number>) => {
			const messages: Record<string, string> = {
				"detail.selfMedia.initPanel.stepConfirm.articleListTitle":
					"已准备的文章（{{count}} 篇）",
				"detail.selfMedia.initPanel.stepConfirm.articleListAutomationHint":
					"开始后会自动拆分话题、上传素材，并打开第一篇。",
				"detail.selfMedia.initPanel.stepConfirm.articleListAutomationHintWithoutMaterials":
					"开始后会自动拆分话题，并打开第一篇。",
				"detail.selfMedia.initPanel.stepConfirm.articleReadyHint":
					"已整理 {{outlineCount}} 个大纲要点和 {{materialCount}} 个参考资料",
				"detail.selfMedia.initPanel.stepConfirm.articleReadyHintMaterials":
					"已整理 {{materialCount}} 个参考资料",
				"detail.selfMedia.initPanel.stepConfirm.articleReadyHintOutline":
					"已整理 {{outlineCount}} 个大纲要点",
				"detail.selfMedia.initPanel.stepConfirm.projectPendingHint":
					"项目准备完成后即可开始创作。",
				"detail.selfMedia.initPanel.stepConfirm.startBtn":
					"开始 AI 创作（共 {{count}} 篇）",
				"detail.selfMedia.initPanel.stepConfirm.statusReady": "准备生成",
				"detail.selfMedia.initPanel.stepConfirm.subtitle":
					"确认后会自动创建创作话题，并打开第一篇文章。",
				"detail.selfMedia.initPanel.stepConfirm.templateNameLabel": "模板名称",
			}
			return (messages[key] || key).replace(/\{\{(\w+)\}\}/g, (_, token) =>
				String(options?.[token] ?? ""),
			)
		},
	}),
}))

vi.mock("../services/selfMediaBatchSend", () => ({
	sendArticleBatch: mockSendArticleBatch,
	navigateToBatchTopic: mockNavigateToBatchTopic,
}))

vi.mock("../services/selfMediaMagicProjectIndex", () => ({
	prefillSelfMediaMagicProjectIndex: mockPrefillSelfMediaMagicProjectIndex,
}))

vi.mock("../services/selfMediaPostPaths", () => ({
	ensureArticlePostAssetDirectories: mockEnsureArticlePostAssetDirectories,
}))

vi.mock("@/pages/superMagic/services", () => ({
	default: {
		topic: {
			fetchTopics: mockFetchTopics,
		},
	},
}))

vi.mock("../components/SelfMediaInitPanel/components/picker/ModelSelector", () => ({
	default: ({ modelType = "text" }: { modelType?: string }) => (
		<div data-testid={`model-selector-${modelType}`} />
	),
}))

vi.mock("../components/SelfMediaInitPanel/components/ui/InlineVoiceButton", () => ({
	default: () => <button type="button" data-testid="inline-voice-button" />,
}))

import StepConfirm from "../components/SelfMediaInitPanel/steps/StepConfirm"

const data: SelfMediaInitData = {
	global: {
		author: "Magic Lab",
		brandPosition: "AI tools",
		targetAudience: "Creators",
		brandImages: [],
	},
	articles: [
		{
			title: "Post A",
			folderName: "post-a",
			style: "professional",
			visualPreset: "code-dispatch",
			cardCount: 6,
			outline: [],
			materials: [],
			notes: "",
			platform: "rednote",
			description: "desc",
			visualReferenceFiles: [],
		},
	],
}

describe("StepConfirm style shell", () => {
	it("uses localized status copy instead of decorative English in the header", () => {
		render(<StepConfirm data={data} selectedProject={{ id: "project-1" }} />)

		expect(screen.getByText("准备生成")).toBeInTheDocument()
		expect(screen.getByText("确认后会自动创建创作话题，并打开第一篇文章。")).toBeInTheDocument()
		expect(screen.queryByText("Compilation & Release")).not.toBeInTheDocument()
	})

	it("keeps the confirm header focused without a right-side decorative panel", () => {
		render(<StepConfirm data={data} selectedProject={{ id: "project-1" }} />)

		expect(
			screen.queryByTestId("self-media-step-confirm-title-illustration"),
		).not.toBeInTheDocument()
	})

	it("surfaces automation cues inline instead of using a right-side prompt area", () => {
		const material = new File(["reference"], "reference.txt", { type: "text/plain" })
		render(
			<StepConfirm
				data={{
					...data,
					articles: [
						{
							...data.articles[0],
							materials: [
								{
									id: "material-1",
									file: material,
									previewUrl: "blob:reference",
									description: "source note",
								},
							],
							outline: [{ id: "outline-1", text: "Opening hook" }],
						},
					],
				}}
				selectedProject={{ id: "project-1" }}
			/>,
		)

		expect(
			screen.getByText("开始后会自动拆分话题、上传素材，并打开第一篇。"),
		).toBeInTheDocument()
		expect(screen.getByText("已整理 1 个大纲要点和 1 个参考资料")).toBeInTheDocument()
		expect(screen.queryByTestId("self-media-step-confirm-right-prompt")).not.toBeInTheDocument()
	})

	it("does not render an empty brand summary when brand information was skipped", () => {
		render(
			<StepConfirm
				data={{
					...data,
					global: {
						author: "",
						brandPosition: "",
						targetAudience: "",
						brandImages: [],
					},
				}}
				selectedProject={{ id: "project-1" }}
			/>,
		)

		expect(
			screen.queryByTestId("self-media-step-confirm-global-summary"),
		).not.toBeInTheDocument()
		expect(
			screen.queryByText("detail.selfMedia.initPanel.stepConfirm.globalSummary"),
		).not.toBeInTheDocument()
	})

	it("does not mention material upload when no article has references", () => {
		render(<StepConfirm data={data} selectedProject={{ id: "project-1" }} />)

		expect(screen.getByText("开始后会自动拆分话题，并打开第一篇。")).toBeInTheDocument()
		expect(
			screen.queryByText("开始后会自动拆分话题、上传素材，并打开第一篇。"),
		).not.toBeInTheDocument()
	})

	it("keeps article readiness feedback positive when only an outline is ready", () => {
		render(
			<StepConfirm
				data={{
					...data,
					articles: [
						{
							...data.articles[0],
							outline: [{ id: "outline-1", text: "Opening hook" }],
						},
					],
				}}
				selectedProject={{ id: "project-1" }}
			/>,
		)

		expect(screen.getByText("已整理 1 个大纲要点")).toBeInTheDocument()
		expect(screen.queryByText(/0 个参考资料/)).not.toBeInTheDocument()
	})

	it("uses localized review labels for the article list and template editor", () => {
		render(
			<StepConfirm
				data={data}
				selectedProject={{ id: "project-1" }}
				onSaveTemplate={vi.fn()}
			/>,
		)

		expect(screen.getByText("已准备的文章（1 篇）")).toBeInTheDocument()
		expect(screen.queryByText(/选题矩阵清单/)).not.toBeInTheDocument()

		fireEvent.click(screen.getByText("detail.selfMedia.initPanel.stepConfirm.saveAsTemplate"))

		expect(screen.getByText("模板名称")).toBeInTheDocument()
		expect(screen.queryByText("模板归档名称")).not.toBeInTheDocument()
	})

	it("disables generation with an inline reason when the project context is missing", () => {
		const onFooterActionChange = vi.fn()

		render(
			<StepConfirm
				data={data}
				selectedProject={null}
				onFooterActionChange={onFooterActionChange}
			/>,
		)

		expect(onFooterActionChange).toHaveBeenLastCalledWith(
			expect.objectContaining({
				disabled: true,
				disabledReason: "项目准备完成后即可开始创作。",
				label: "开始 AI 创作（共 1 篇）",
			}),
		)
	})

	it("keeps model settings in the page body and leaves only the primary action in the bottom bar", () => {
		const onFooterActionChange = vi.fn()
		render(
			<StepConfirm
				data={data}
				selectedProject={{ id: "project-1" }}
				onBackHome={vi.fn()}
				onFooterActionChange={onFooterActionChange}
			/>,
		)

		const textModelSelector = screen.getByTestId("model-selector-text")
		const imageModelSelector = screen.getByTestId("model-selector-image")
		const videoModelSelector = screen.getByTestId("model-selector-video")

		expect(textModelSelector).toBeInTheDocument()
		expect(imageModelSelector).toBeInTheDocument()
		expect(videoModelSelector).toBeInTheDocument()
		expect(screen.queryByTestId("self-media-step-confirm-actions")).not.toBeInTheDocument()
		expect(
			screen.queryByTestId("self-media-step-confirm-back-home-button"),
		).not.toBeInTheDocument()
		expect(onFooterActionChange).toHaveBeenLastCalledWith(
			expect.objectContaining({
				disabled: false,
				label: "开始 AI 创作（共 1 篇）",
				onClick: expect.any(Function),
			}),
		)
	})

	it("keeps the review flow ordered before optional generation settings", () => {
		render(<StepConfirm data={data} selectedProject={{ id: "project-1" }} />)

		const articleList = screen.getByTestId("self-media-step-confirm-article-list")
		const modelSettings = screen.getByTestId("self-media-step-confirm-model-settings")

		expect(
			articleList.compareDocumentPosition(modelSettings) & Node.DOCUMENT_POSITION_FOLLOWING,
		).toBeTruthy()
	})
})
