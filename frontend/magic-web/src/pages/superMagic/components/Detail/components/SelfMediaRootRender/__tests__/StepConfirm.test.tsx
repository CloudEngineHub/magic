import { act, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
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
				"detail.selfMedia.initPanel.stepConfirm.completeSummaryDesc":
					"内容创作 Agent 已接手，当前话题会自动打开。",
				"detail.selfMedia.initPanel.stepConfirm.completeSummaryTitle":
					"已创建 {{count}} 个创作话题",
				"detail.selfMedia.initPanel.stepConfirm.completeTopicListHint":
					"已自动打开第一篇；点击其它标题即可切换。",
				"detail.selfMedia.initPanel.stepConfirm.doneDesc":
					"已为 {{count}} 篇文章创建独立话题，由内容创作 Agent 继续处理",
				"detail.selfMedia.initPanel.stepConfirm.opened": "已打开",
				"detail.selfMedia.initPanel.stepConfirm.projectPendingHint":
					"项目准备完成后即可开始创作。",
				"detail.selfMedia.initPanel.stepConfirm.startBtn":
					"开始 AI 创作（共 {{count}} 篇）",
				"detail.selfMedia.initPanel.stepConfirm.phase.archiving":
					"正在归档当前方案，确保 Agent 能读取完整规划。",
				"detail.selfMedia.initPanel.stepConfirm.phaseLabels.archiving": "归档方案",
				"detail.selfMedia.initPanel.stepConfirm.phaseStatus": "当前阶段：{{phase}}",
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
import type { StepConfirmFooterAction } from "../components/SelfMediaInitPanel/steps/StepConfirm"

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

const twoArticleData: SelfMediaInitData = {
	...data,
	articles: [
		...data.articles,
		{
			...data.articles[0],
			title: "Post B",
			folderName: "post-b",
			description: "desc b",
		},
	],
}

function getLatestFooterAction(
	onFooterActionChange: ReturnType<typeof vi.fn>,
): StepConfirmFooterAction {
	const actionCall = [...onFooterActionChange.mock.calls]
		.reverse()
		.find(([action]) => action !== null)

	if (!actionCall?.[0]) {
		throw new Error("StepConfirm footer action was not registered")
	}

	return actionCall[0] as StepConfirmFooterAction
}

describe("StepConfirm", () => {
	let consoleErrorSpy: ReturnType<typeof vi.spyOn>

	beforeEach(() => {
		mockSendArticleBatch.mockReset()
		mockNavigateToBatchTopic.mockReset()
		mockFetchTopics.mockReset()
		mockPrefillSelfMediaMagicProjectIndex.mockReset()
		mockPrefillSelfMediaMagicProjectIndex.mockResolvedValue(undefined)
		mockEnsureArticlePostAssetDirectories.mockReset()
		mockEnsureArticlePostAssetDirectories.mockResolvedValue([
			{
				articleIndex: 0,
				folderName: "post-a",
				postPath: "Self Media/posts/post-a",
				assetsPath: "Self Media/posts/post-a/assets",
				postEntry: "posts/post-a/post.json",
				assetsDirId: "assets-dir",
			},
		])
		consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined)
	})

	afterEach(() => {
		consoleErrorSpy.mockRestore()
	})

	it("shows startup loading immediately after generation starts", async () => {
		const onArchiveDraft = vi.fn().mockReturnValue(new Promise(() => undefined))
		const onFooterActionChange = vi.fn()
		const onExecutionLockedChange = vi.fn()

		render(
			<StepConfirm
				data={data}
				selectedProject={{ id: "project-1" }}
				onArchiveDraft={onArchiveDraft}
				onFooterActionChange={onFooterActionChange}
				onExecutionLockedChange={onExecutionLockedChange}
			/>,
		)

		act(() => {
			void getLatestFooterAction(onFooterActionChange).onClick()
		})

		expect(await screen.findByTestId("self-media-step-confirm-startup-loading")).toBeTruthy()
		expect(onExecutionLockedChange).toHaveBeenLastCalledWith(true)
		expect(
			screen.getByText("detail.selfMedia.initPanel.stepConfirm.preparingTitle"),
		).toBeTruthy()
		const phaseStatus = await screen.findByText("当前阶段：归档方案")
		expect(phaseStatus).toHaveAttribute("aria-live", "polite")
		expect(
			screen.queryByText("正在归档方案、准备素材，并创建第一个创作话题"),
		).not.toBeInTheDocument()
	})

	it("shows a completion summary after the AI creation topics are created", async () => {
		const onFooterActionChange = vi.fn()
		mockSendArticleBatch.mockImplementation(async ({ onTopicCreated }) => {
			const item = {
				topicId: "topic-1",
				topicName: "[自媒体] Post A",
				articleTitle: "Post A",
				articleIndex: 0,
				topic: { id: "topic-1" },
			}
			onTopicCreated?.(item)
			return [item]
		})

		render(
			<StepConfirm
				data={data}
				selectedProject={{ id: "project-1" }}
				onFooterActionChange={onFooterActionChange}
			/>,
		)

		await act(async () => {
			await getLatestFooterAction(onFooterActionChange).onClick()
		})

		const summary = await screen.findByTestId("self-media-step-confirm-complete-summary")
		expect(summary).toHaveTextContent("已创建 1 个创作话题")
		expect(summary).toHaveTextContent("内容创作 Agent 已接手，当前话题会自动打开。")
		expect(summary).not.toHaveTextContent("AI 创作助手")
		await waitFor(() => expect(summary).toHaveFocus())
		expect(screen.getByText("已自动打开第一篇；点击其它标题即可切换。")).toBeInTheDocument()
		expect(screen.getByText("已打开")).toBeInTheDocument()
	})

	it("uses the home visual language after creation completes", async () => {
		const onFooterActionChange = vi.fn()
		mockSendArticleBatch.mockImplementation(async ({ onTopicCreated }) => {
			const item = {
				topicId: "topic-1",
				topicName: "[自媒体] Post A",
				articleTitle: "Post A",
				articleIndex: 0,
				topic: { id: "topic-1" },
			}
			onTopicCreated?.(item)
			return [item]
		})

		render(
			<StepConfirm
				data={data}
				selectedProject={{ id: "project-1" }}
				onBackHome={vi.fn()}
				onFooterActionChange={onFooterActionChange}
			/>,
		)

		await act(async () => {
			await getLatestFooterAction(onFooterActionChange).onClick()
		})

		const progressShell = await screen.findByTestId("self-media-step-confirm-progress")
		expect(progressShell).toHaveClass("max-w-5xl", "bg-[#f8f8f9]")

		const statusEmblem = screen.getByTestId("self-media-step-confirm-status-emblem")
		const completeMark = screen.getByTestId("self-media-step-confirm-complete-mark")
		expect(statusEmblem).toHaveClass("rounded-[30px]", "bg-white")
		expect(completeMark).toHaveClass("bg-[#18181b]")
		expect(screen.queryByTestId("self-media-step-confirm-rocket-icon")).not.toBeInTheDocument()

		const summary = screen.getByTestId("self-media-step-confirm-complete-summary")
		expect(summary).toHaveClass("rounded-[28px]", "bg-white")

		const backHomeButton = screen.getByTestId(
			"self-media-step-confirm-progress-back-home-button",
		)
		expect(backHomeButton).toHaveClass("rounded-[24px]", "bg-white")
		expect(backHomeButton).not.toHaveClass("w-full")
	})

	it("does not show success when the batch creates no topics", async () => {
		const onGenerateFailed = vi.fn()
		const onFooterActionChange = vi.fn()
		mockSendArticleBatch.mockResolvedValue([])

		render(
			<StepConfirm
				data={data}
				selectedProject={{ id: "project-1" }}
				onGenerateFailed={onGenerateFailed}
				onFooterActionChange={onFooterActionChange}
			/>,
		)

		await act(async () => {
			await getLatestFooterAction(onFooterActionChange).onClick()
		})

		await waitFor(() => {
			expect(onGenerateFailed).toHaveBeenCalledTimes(1)
		})
		expect(
			screen.queryByTestId("self-media-step-confirm-complete-summary"),
		).not.toBeInTheDocument()
		expect(
			screen.queryByTestId("self-media-step-confirm-startup-loading"),
		).not.toBeInTheDocument()
	})

	it("uses the created topic count in success feedback when only part of the batch starts", async () => {
		const onFooterActionChange = vi.fn()
		mockSendArticleBatch.mockImplementation(async ({ onTopicCreated }) => {
			const item = {
				topicId: "topic-1",
				topicName: "[自媒体] Post A",
				articleTitle: "Post A",
				articleIndex: 0,
				topic: { id: "topic-1" },
			}
			onTopicCreated?.(item)
			return [item]
		})

		render(
			<StepConfirm
				data={twoArticleData}
				selectedProject={{ id: "project-1" }}
				onFooterActionChange={onFooterActionChange}
			/>,
		)

		await act(async () => {
			await getLatestFooterAction(onFooterActionChange).onClick()
		})

		expect(
			await screen.findByText("已为 1 篇文章创建独立话题，由内容创作 Agent 继续处理"),
		).toBeInTheDocument()
		expect(
			screen.queryByText("已为 2 篇文章创建独立话题，由内容创作 Agent 继续处理"),
		).not.toBeInTheDocument()
	})

	it("stops generation when archiving draft fails", async () => {
		const onArchiveDraft = vi.fn().mockRejectedValue(new Error("archive failed"))
		const onGenerateFailed = vi.fn()
		const onFooterActionChange = vi.fn()
		mockSendArticleBatch.mockResolvedValue([])

		render(
			<StepConfirm
				data={data}
				selectedProject={{ id: "project-1" }}
				onArchiveDraft={onArchiveDraft}
				onGenerateFailed={onGenerateFailed}
				onFooterActionChange={onFooterActionChange}
			/>,
		)

		await act(async () => {
			await getLatestFooterAction(onFooterActionChange).onClick()
		})

		await waitFor(() => {
			expect(onArchiveDraft).toHaveBeenCalledTimes(1)
			expect(mockSendArticleBatch).not.toHaveBeenCalled()
			expect(onGenerateFailed).toHaveBeenCalledTimes(1)
		})
	})

	it("restores caller state when batch sending fails after archiving", async () => {
		const onArchiveDraft = vi.fn().mockResolvedValue(undefined)
		const onGenerateFailed = vi.fn()
		const onFooterActionChange = vi.fn()
		mockSendArticleBatch.mockRejectedValue(new Error("send failed"))

		render(
			<StepConfirm
				data={data}
				selectedProject={{ id: "project-1" }}
				onArchiveDraft={onArchiveDraft}
				onGenerateFailed={onGenerateFailed}
				onFooterActionChange={onFooterActionChange}
			/>,
		)

		await act(async () => {
			await getLatestFooterAction(onFooterActionChange).onClick()
		})

		await waitFor(() => {
			expect(onArchiveDraft).toHaveBeenCalledTimes(1)
			expect(mockSendArticleBatch).toHaveBeenCalledTimes(1)
			expect(onGenerateFailed).toHaveBeenCalledTimes(1)
		})
	})

	it("creates post asset directories after archiving and before prefilling the root post index", async () => {
		const order: string[] = []
		const onFooterActionChange = vi.fn()
		const onArchiveDraft = vi.fn().mockImplementation(async () => {
			order.push("archive")
		})
		mockEnsureArticlePostAssetDirectories.mockImplementation(async () => {
			order.push("ensure-dirs")
			return [
				{
					articleIndex: 0,
					folderName: "post-a",
					postPath: "Self Media/posts/post-a",
					assetsPath: "Self Media/posts/post-a/assets",
					postEntry: "posts/post-a/post.json",
					assetsDirId: "assets-dir",
				},
			]
		})
		mockPrefillSelfMediaMagicProjectIndex.mockImplementation(async () => {
			order.push("prefill")
		})
		mockSendArticleBatch.mockImplementation(async () => {
			order.push("send")
			return []
		})

		render(
			<StepConfirm
				data={data}
				selectedProject={{ id: "project-1" }}
				folderFileId="folder-1"
				folderPath="Self Media"
				attachmentList={[
					{
						file_id: "folder-1",
						file_name: "Self Media",
						is_directory: true,
						relative_file_path: "Self Media",
						children: [],
					},
				]}
				onArchiveDraft={onArchiveDraft}
				onFooterActionChange={onFooterActionChange}
			/>,
		)

		await act(async () => {
			await getLatestFooterAction(onFooterActionChange).onClick()
		})

		await waitFor(() => {
			expect(mockSendArticleBatch).toHaveBeenCalledTimes(1)
		})
		expect(order).toEqual(["archive", "ensure-dirs", "prefill", "send"])
		expect(mockEnsureArticlePostAssetDirectories).toHaveBeenCalledWith({
			projectId: "project-1",
			rootDirectoryId: "folder-1",
			rootPath: "Self Media",
			articles: data.articles,
			existingNodes: expect.any(Array),
		})
		expect(mockPrefillSelfMediaMagicProjectIndex).toHaveBeenCalledWith({
			articles: data.articles,
			attachmentList: expect.any(Array),
			folderFileId: "folder-1",
			postTargets: [
				expect.objectContaining({
					folderName: "post-a",
					postEntry: "posts/post-a/post.json",
				}),
			],
		})
		expect(mockSendArticleBatch).toHaveBeenCalledWith(
			expect.objectContaining({
				postTargets: [
					expect.objectContaining({
						assetsDirId: "assets-dir",
						assetsPath: "Self Media/posts/post-a/assets",
					}),
				],
			}),
		)
	})

	it("stops generation when post asset directory creation fails", async () => {
		const onArchiveDraft = vi.fn().mockResolvedValue(undefined)
		const onGenerateFailed = vi.fn()
		const onFooterActionChange = vi.fn()
		mockEnsureArticlePostAssetDirectories.mockRejectedValue(new Error("mkdir failed"))
		mockSendArticleBatch.mockResolvedValue([])

		render(
			<StepConfirm
				data={data}
				selectedProject={{ id: "project-1" }}
				folderFileId="folder-1"
				folderPath="Self Media"
				onArchiveDraft={onArchiveDraft}
				onGenerateFailed={onGenerateFailed}
				onFooterActionChange={onFooterActionChange}
			/>,
		)

		await act(async () => {
			await getLatestFooterAction(onFooterActionChange).onClick()
		})

		await waitFor(() => {
			expect(onArchiveDraft).toHaveBeenCalledTimes(1)
			expect(mockEnsureArticlePostAssetDirectories).toHaveBeenCalledTimes(1)
			expect(mockPrefillSelfMediaMagicProjectIndex).not.toHaveBeenCalled()
			expect(mockSendArticleBatch).not.toHaveBeenCalled()
			expect(onGenerateFailed).toHaveBeenCalledTimes(1)
		})
	})

	it("stops generation when root post index prefill fails", async () => {
		const onArchiveDraft = vi.fn().mockResolvedValue(undefined)
		const onGenerateFailed = vi.fn()
		const onFooterActionChange = vi.fn()
		mockPrefillSelfMediaMagicProjectIndex.mockRejectedValue(new Error("prefill failed"))
		mockSendArticleBatch.mockResolvedValue([])

		render(
			<StepConfirm
				data={data}
				selectedProject={{ id: "project-1" }}
				folderFileId="folder-1"
				attachmentList={[]}
				onArchiveDraft={onArchiveDraft}
				onGenerateFailed={onGenerateFailed}
				onFooterActionChange={onFooterActionChange}
			/>,
		)

		await act(async () => {
			await getLatestFooterAction(onFooterActionChange).onClick()
		})

		await waitFor(() => {
			expect(onArchiveDraft).toHaveBeenCalledTimes(1)
			expect(mockPrefillSelfMediaMagicProjectIndex).toHaveBeenCalledTimes(1)
			expect(mockSendArticleBatch).not.toHaveBeenCalled()
			expect(onGenerateFailed).toHaveBeenCalledTimes(1)
		})
	})

	it("does not show back home from the confirm actions", () => {
		const onBackHome = vi.fn()

		render(
			<StepConfirm
				data={data}
				selectedProject={{ id: "project-1" }}
				onBackHome={onBackHome}
			/>,
		)

		expect(
			screen.queryByTestId("self-media-step-confirm-back-home-button"),
		).not.toBeInTheDocument()
	})

	it("calls back home from the generation progress screen", async () => {
		const onBackHome = vi.fn()
		const onFooterActionChange = vi.fn()
		mockSendArticleBatch.mockReturnValue(new Promise(() => undefined))

		render(
			<StepConfirm
				data={data}
				selectedProject={{ id: "project-1" }}
				onBackHome={onBackHome}
				onFooterActionChange={onFooterActionChange}
			/>,
		)

		act(() => {
			void getLatestFooterAction(onFooterActionChange).onClick()
		})

		expect(await screen.findByTestId("self-media-step-confirm-startup-loading")).toBeTruthy()

		fireEvent.click(screen.getByTestId("self-media-step-confirm-progress-back-home-button"))

		expect(onBackHome).toHaveBeenCalledTimes(1)
	})
})
