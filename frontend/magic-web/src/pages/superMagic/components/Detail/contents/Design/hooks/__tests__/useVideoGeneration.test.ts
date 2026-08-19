import { renderHook } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { MODEL_TYPE_VIDEO } from "@/apis/modules/org-ai-model-provider"
import superMagicModeService from "@/services/superMagic/SuperMagicModeService"
import superMagicCustomModelService from "@/services/superMagic/SuperMagicCustomModelService"
import { useVideoGeneration } from "../useVideoGeneration"

const { generateVideo } = vi.hoisted(() => ({
	generateVideo: vi.fn(async (request: unknown) => request),
}))

vi.mock("@/apis", () => ({
	SuperMagicApi: {
		generateVideo,
	},
}))

vi.mock("react-i18next", async (importOriginal) => {
	const actual = await importOriginal<typeof import("react-i18next")>()
	return {
		...actual,
		useTranslation: () => ({ t: (key: string) => key }),
	}
})

vi.mock("@/services/superMagic/SuperMagicModeService", () => ({
	default: {
		fetchModeList: vi.fn(async () => []),
		fetchDefaultModeModelList: vi.fn(async () => undefined),
		getAllVideoModelGroups: vi.fn(),
	},
}))

vi.mock("@/services/superMagic/SuperMagicCustomModelService", () => ({
	default: {
		getMyModelsByType: vi.fn(async () => []),
	},
}))

function createGroup(id: string, name: string, modelId: string) {
	return {
		group: { id, name, icon: `${id}-icon`, sort: 1 },
		models: [
			{
				model_id: modelId,
				model_name: modelId,
				group_id: id,
			},
		],
	}
}

describe("useVideoGeneration model grouping", () => {
	beforeEach(() => {
		vi.clearAllMocks()
	})

	it("submits a self-contained composition request with project-absolute paths", async () => {
		const { result } = renderHook(() =>
			useVideoGeneration({
				projectId: "project-1",
				topicId: "topic-1",
				designProjectBasePath: "新建画布",
				currentFile: { id: "design-1", name: "新建画布.magic" },
				flatAttachments: [
					{
						file_id: "design-1",
						file_name: "新建画布.magic",
						relative_file_path: "新建画布/新建画布.magic",
					},
				],
				updateAttachments: vi.fn(),
			}),
		)

		await result.current.generateVideo({
			generation_type: "canvas_composition",
			topic_id: "topic-1",
			generation: {
				aspect_ratio: "9:16",
				resolution: "480p",
				duration_seconds: 4,
			},
			composition: {
				videos: [{ path: "./videos/a.mp4" }, { path: "./videos/b.mp4" }],
				audios: [{ path: "./audios/b.mp3" }],
			},
		})

		expect(generateVideo).toHaveBeenCalledWith({
			project_id: "project-1",
			generation_type: "canvas_composition",
			file_dir: "/新建画布/videos/",
			generation: {
				aspect_ratio: "9:16",
				resolution: "480p",
				duration_seconds: 4,
			},
			composition: {
				videos: [{ path: "/新建画布/videos/a.mp4" }, { path: "/新建画布/videos/b.mp4" }],
				audios: [{ path: "/新建画布/audios/b.mp3" }],
			},
		})
	})

	it("loads all supported models independently of the active topic", async () => {
		vi.mocked(superMagicModeService.getAllVideoModelGroups).mockReturnValue([
			createGroup("claude-video", "claude-video", "seedance-2-fast"),
			createGroup("video", "视频", "ke"),
		] as never)

		const { result } = renderHook(() =>
			useVideoGeneration({
				projectId: "project-1",
				updateAttachments: vi.fn(),
			}),
		)

		await expect(result.current.getVideoModelList()).resolves.toEqual([
			expect.objectContaining({
				model_id: "seedance-2-fast",
				model_group: expect.objectContaining({ id: "claude-video", name: "claude" }),
			}),
			expect.objectContaining({
				model_id: "ke",
				model_group: expect.objectContaining({ id: "video", name: "视频" }),
			}),
		])
		expect(superMagicModeService.fetchModeList).toHaveBeenCalledWith({ force: false })
		expect(superMagicModeService.fetchDefaultModeModelList).toHaveBeenCalledWith({
			force: false,
		})
		expect(superMagicModeService.getAllVideoModelGroups).toHaveBeenCalledTimes(1)
	})

	it("includes personal video models in the canvas model list", async () => {
		vi.mocked(superMagicModeService.getAllVideoModelGroups).mockReturnValue([])
		vi.mocked(superMagicCustomModelService.getMyModelsByType).mockResolvedValue([
			{
				id: "custom-video-1",
				name: "MiniMax-H3",
				model_id: "minimax-h3",
				model_type: MODEL_TYPE_VIDEO,
				category: "vgmm",
				service_provider_config_id: "provider-1",
				service_provider_config: { id: "provider-1", name: "自定义服务商" },
			},
		])

		const { result } = renderHook(() =>
			useVideoGeneration({
				projectId: "project-1",
				updateAttachments: vi.fn(),
			}),
		)

		await expect(result.current.getVideoModelList()).resolves.toEqual([
			expect.objectContaining({
				model_id: "minimax-h3",
				model_name: "MiniMax-H3",
				model_source: "custom",
				model_group: expect.objectContaining({ source: "custom" }),
			}),
		])
		expect(superMagicCustomModelService.getMyModelsByType).toHaveBeenCalledWith(
			MODEL_TYPE_VIDEO,
		)
	})
})
