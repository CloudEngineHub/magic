import { renderHook } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"
import type { TopicMode } from "@/pages/superMagic/pages/Workspace/TopicMode"
import superMagicModeService from "@/services/superMagic/SuperMagicModeService"
import { useVideoGeneration } from "../useVideoGeneration"

vi.mock("react-i18next", async (importOriginal) => {
	const actual = await importOriginal<typeof import("react-i18next")>()
	return {
		...actual,
		useTranslation: () => ({ t: (key: string) => key }),
	}
})

vi.mock("@/services/superMagic/SuperMagicModeService", () => ({
	default: {
		getVideoModelGroupsByMode: vi.fn(),
		getAllVideoModelGroups: vi.fn(),
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

	it("uses the active topic mode groups to match MessageEditor", async () => {
		vi.mocked(superMagicModeService.getVideoModelGroupsByMode).mockReturnValue([
			createGroup("claude-video", "claude-video", "seedance-2-fast"),
			createGroup("video", "视频", "ke"),
		] as never)
		vi.mocked(superMagicModeService.getAllVideoModelGroups).mockReturnValue([
			createGroup("dynamic", "测试动态模型", "seedance-2-fast"),
		] as never)

		const { result } = renderHook(() =>
			useVideoGeneration({
				projectId: "project-1",
				topicMode: "claude" as TopicMode,
				agentCode: "agent-1",
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
		expect(superMagicModeService.getVideoModelGroupsByMode).toHaveBeenCalledWith(
			"claude",
			"agent-1",
		)
		expect(superMagicModeService.getAllVideoModelGroups).not.toHaveBeenCalled()
	})

	it("falls back to all-mode groups when topic context is unavailable", async () => {
		vi.mocked(superMagicModeService.getAllVideoModelGroups).mockReturnValue([
			createGroup("video", "video", "veo-3-pro"),
		] as never)

		const { result } = renderHook(() =>
			useVideoGeneration({
				projectId: "project-1",
				updateAttachments: vi.fn(),
			}),
		)

		await expect(result.current.getVideoModelList()).resolves.toEqual([
			expect.objectContaining({
				model_id: "veo-3-pro",
				model_group: expect.objectContaining({ id: "video", name: "video" }),
			}),
		])
		expect(superMagicModeService.getAllVideoModelGroups).toHaveBeenCalledTimes(1)
		expect(superMagicModeService.getVideoModelGroupsByMode).not.toHaveBeenCalled()
	})
})
