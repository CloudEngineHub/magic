import { beforeEach, describe, expect, it, vi } from "vitest"
import type { ArticleDetail } from "../components/SelfMediaInitPanel/types"
import { sendArticleBatch } from "../services/selfMediaBatchSend"

const {
	mockChat,
	mockCreateTopic,
	mockPreWarmSandbox,
	mockGetUploadToken,
	mockChangeDir,
	mockSaveFileToProject,
	mockUpload,
} = vi.hoisted(() => ({
	mockChat: vi.fn(),
	mockCreateTopic: vi.fn(),
	mockPreWarmSandbox: vi.fn(),
	mockGetUploadToken: vi.fn(),
	mockChangeDir: vi.fn(),
	mockSaveFileToProject: vi.fn(),
	mockUpload: vi.fn(),
}))

vi.mock("@/apis", () => ({
	ChatApi: {
		chat: mockChat,
	},
	SuperMagicApi: {
		createTopic: mockCreateTopic,
		preWarmSandbox: mockPreWarmSandbox,
	},
}))

vi.mock("@/models/user", () => ({
	userStore: {
		user: {
			userInfo: {
				user_id: "user-1",
			},
		},
	},
}))

vi.mock("@/pages/superMagic/stores/core", () => ({
	projectStore: {
		selectedProject: { id: "project-1" },
	},
	topicStore: {
		setSelectedTopic: vi.fn(),
	},
}))

vi.mock("@/pages/superMagic/services/routeManageService", () => ({
	default: {
		navigateToState: vi.fn(),
	},
}))

vi.mock("@/utils/pubsub", () => ({
	default: {
		publish: vi.fn(),
	},
	PubSubEvents: {
		Expand_Topic_Conversation_Panel: "expand-topic-conversation-panel",
	},
}))

vi.mock("@/pages/superMagic/components/MessageEditor/services/UploadTokenService", () => ({
	superMagicUploadTokenService: {
		getUploadToken: mockGetUploadToken,
		changeDir: mockChangeDir,
		saveFileToProject: mockSaveFileToProject,
	},
}))

vi.mock("@dtyq/upload-sdk", () => ({
	Upload: vi.fn(() => ({
		upload: mockUpload,
	})),
}))

function makeArticle(): ArticleDetail {
	return {
		title: "Post A",
		folderName: "post-a",
		style: "professional",
		visualPreset: "none",
		outline: [],
		cardCount: 6,
		materials: [
			{
				id: "material-1",
				file: new File(["image"], "cover.png", { type: "image/png" }),
				previewUrl: "",
				description: "cover image",
				uploadedPath: "self-media/__drafts/draft-materials/0/cover.png",
			},
		],
		notes: "",
		platform: "rednote",
		description: "",
		visualReferenceFiles: [],
	}
}

describe("selfMediaBatchSend", () => {
	beforeEach(() => {
		mockChat.mockReset().mockResolvedValue(undefined)
		mockCreateTopic.mockReset().mockResolvedValue({
			id: "topic-1",
			chat_topic_id: "chat-topic-1",
			chat_conversation_id: "conversation-1",
		})
		mockPreWarmSandbox.mockReset()
		mockGetUploadToken.mockReset().mockResolvedValue({
			temporary_credential: { dir: "workspace/" },
		})
		mockChangeDir.mockReset().mockImplementation((credentials) => credentials)
		mockSaveFileToProject.mockReset().mockResolvedValue(undefined)
		mockUpload.mockReset().mockReturnValue({
			success: (cb: (res: { data: { path: string } }) => void) =>
				cb({ data: { path: "oss/self-media/posts/post-a/assets/cover.png" } }),
			fail: vi.fn(),
		})
	})

	it("uploads regenerated draft materials to assets and saves them under the assets directory node", async () => {
		const article = makeArticle()

		await sendArticleBatch({
			articles: [article],
			globalSettings: {
				author: "Magic Lab",
				brandPosition: "AI tools",
				targetAudience: "Creators",
				brandImages: [],
			},
			selectedProject: { id: "project-1" },
			selfMediaProjectDirectory: {
				directoryId: "self-media-root",
				directoryPath: "self-media",
				directoryName: "self-media",
			},
			postTargets: [
				{
					articleIndex: 0,
					folderName: "post-a",
					postPath: "self-media/posts/post-a",
					assetsPath: "self-media/posts/post-a/assets",
					postEntry: "posts/post-a/post.json",
					assetsDirId: "assets-dir",
				},
			],
		})

		expect(mockChangeDir).toHaveBeenCalledWith(
			expect.anything(),
			"self-media/posts/post-a/assets",
		)
		expect(mockSaveFileToProject).toHaveBeenCalledWith(
			expect.objectContaining({
				parent_id: "assets-dir",
				relative_file_path: "self-media/posts/post-a/assets/cover.png",
			}),
		)
		expect(article.materials[0].uploadedPath).toBe("self-media/posts/post-a/assets/cover.png")
	})
})
