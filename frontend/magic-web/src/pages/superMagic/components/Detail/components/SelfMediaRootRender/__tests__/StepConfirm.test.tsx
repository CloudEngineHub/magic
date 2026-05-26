import { fireEvent, render, screen, waitFor } from "@testing-library/react"
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
		t: (key: string) => key,
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
		const onArchiveDraft = vi.fn().mockResolvedValue(undefined)
		mockSendArticleBatch.mockReturnValue(new Promise(() => undefined))

		render(
			<StepConfirm
				data={data}
				selectedProject={{ id: "project-1" }}
				onArchiveDraft={onArchiveDraft}
			/>,
		)

		fireEvent.click(screen.getByText("detail.selfMedia.initPanel.stepConfirm.startBtn"))

		expect(await screen.findByTestId("self-media-step-confirm-startup-loading")).toBeTruthy()
		expect(
			screen.getByText("detail.selfMedia.initPanel.stepConfirm.preparingTitle"),
		).toBeTruthy()
	})

	it("stops generation when archiving draft fails", async () => {
		const onArchiveDraft = vi.fn().mockRejectedValue(new Error("archive failed"))
		const onGenerateFailed = vi.fn()
		mockSendArticleBatch.mockResolvedValue([])

		render(
			<StepConfirm
				data={data}
				selectedProject={{ id: "project-1" }}
				onArchiveDraft={onArchiveDraft}
				onGenerateFailed={onGenerateFailed}
			/>,
		)

		fireEvent.click(screen.getByText("detail.selfMedia.initPanel.stepConfirm.startBtn"))

		await waitFor(() => {
			expect(onArchiveDraft).toHaveBeenCalledTimes(1)
			expect(mockSendArticleBatch).not.toHaveBeenCalled()
			expect(onGenerateFailed).toHaveBeenCalledTimes(1)
		})
	})

	it("restores caller state when batch sending fails after archiving", async () => {
		const onArchiveDraft = vi.fn().mockResolvedValue(undefined)
		const onGenerateFailed = vi.fn()
		mockSendArticleBatch.mockRejectedValue(new Error("send failed"))

		render(
			<StepConfirm
				data={data}
				selectedProject={{ id: "project-1" }}
				onArchiveDraft={onArchiveDraft}
				onGenerateFailed={onGenerateFailed}
			/>,
		)

		fireEvent.click(screen.getByText("detail.selfMedia.initPanel.stepConfirm.startBtn"))

		await waitFor(() => {
			expect(onArchiveDraft).toHaveBeenCalledTimes(1)
			expect(mockSendArticleBatch).toHaveBeenCalledTimes(1)
			expect(onGenerateFailed).toHaveBeenCalledTimes(1)
		})
	})

	it("creates post asset directories after archiving and before prefilling the root post index", async () => {
		const order: string[] = []
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
			/>,
		)

		fireEvent.click(screen.getByText("detail.selfMedia.initPanel.stepConfirm.startBtn"))

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
			/>,
		)

		fireEvent.click(screen.getByText("detail.selfMedia.initPanel.stepConfirm.startBtn"))

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
			/>,
		)

		fireEvent.click(screen.getByText("detail.selfMedia.initPanel.stepConfirm.startBtn"))

		await waitFor(() => {
			expect(onArchiveDraft).toHaveBeenCalledTimes(1)
			expect(mockPrefillSelfMediaMagicProjectIndex).toHaveBeenCalledTimes(1)
			expect(mockSendArticleBatch).not.toHaveBeenCalled()
			expect(onGenerateFailed).toHaveBeenCalledTimes(1)
		})
	})

	it("calls back home from the confirm actions", () => {
		const onBackHome = vi.fn()

		render(
			<StepConfirm
				data={data}
				selectedProject={{ id: "project-1" }}
				onBackHome={onBackHome}
			/>,
		)

		fireEvent.click(screen.getByTestId("self-media-step-confirm-back-home-button"))

		expect(onBackHome).toHaveBeenCalledTimes(1)
	})

	it("calls back home from the generation progress screen", async () => {
		const onBackHome = vi.fn()
		mockSendArticleBatch.mockReturnValue(new Promise(() => undefined))

		render(
			<StepConfirm
				data={data}
				selectedProject={{ id: "project-1" }}
				onBackHome={onBackHome}
			/>,
		)

		fireEvent.click(screen.getByText("detail.selfMedia.initPanel.stepConfirm.startBtn"))

		expect(await screen.findByTestId("self-media-step-confirm-startup-loading")).toBeTruthy()

		fireEvent.click(screen.getByTestId("self-media-step-confirm-progress-back-home-button"))

		expect(onBackHome).toHaveBeenCalledTimes(1)
	})
})
